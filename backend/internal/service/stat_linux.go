//go:build linux

package service

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Linux 平台直接读取 /proc 获取主机 CPU / 内存占用。

var (
	cpuSampleMu   sync.Mutex
	lastCPUIdle   uint64
	lastCPUTotal  uint64
	lastCPUSample time.Time
)

// readMemInfo parses /proc/meminfo (Linux containers).
func readMemInfo() (usedMB, totalMB float64, ok bool) {
	raw, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, 0, false
	}
	var totalKB, availableKB float64
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		val, err := strconv.ParseFloat(fields[1], 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			totalKB = val
		case "MemAvailable:":
			availableKB = val
		}
	}
	if totalKB == 0 {
		return 0, 0, false
	}
	return (totalKB - availableKB) / 1024, totalKB / 1024, true
}

// readCPUPercent derives utilisation from /proc/stat between two calls.
// The first call after startup returns 0 (no baseline yet).
func readCPUPercent() float64 {
	raw, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(raw), "\n")
	if len(lines) == 0 {
		return 0
	}
	fields := strings.Fields(lines[0])
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0
	}
	var values []uint64
	for _, f := range fields[1:] {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return 0
		}
		values = append(values, v)
	}
	if len(values) < 4 {
		return 0
	}
	var total, idle uint64
	for i, v := range values {
		total += v
		if i == 3 || i == 4 { // idle + iowait
			idle += v
		}
	}

	cpuSampleMu.Lock()
	defer cpuSampleMu.Unlock()

	prevIdle, prevTotal := lastCPUIdle, lastCPUTotal
	lastCPUIdle, lastCPUTotal = idle, total
	lastCPUSample = time.Now()
	if prevTotal == 0 || total <= prevTotal {
		return 0
	}
	idleDelta := float64(idle - prevIdle)
	totalDelta := float64(total - prevTotal)
	if totalDelta <= 0 {
		return 0
	}
	pct := (1 - idleDelta/totalDelta) * 100
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	return pct
}
