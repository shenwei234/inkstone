//go:build windows

package service

import (
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Windows 平台通过 PowerShell 的 Get-Counter / CIM 查询主机资源，
// 结果做 5 秒缓存，避免频繁拉起子进程。

var (
	winResMu     sync.Mutex
	winResCache  SystemResource
	winResExpiry time.Time
)

func readMemInfo() (usedMB, totalMB float64, ok bool) {
	res, ok := collectWindowsResource()
	if !ok {
		return 0, 0, false
	}
	return res.MemUsedMB, res.MemTotalMB, true
}

func readCPUPercent() float64 {
	res, ok := collectWindowsResource()
	if !ok {
		return 0
	}
	return res.CPUPercent
}

func collectWindowsResource() (SystemResource, bool) {
	winResMu.Lock()
	defer winResMu.Unlock()

	if time.Now().Before(winResExpiry) {
		return winResCache, true
	}

	script := `$os = Get-CimInstance Win32_OperatingSystem; ` +
		`$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; ` +
		`Write-Output ("{0}|{1}|{2}" -f $cpu, $os.FreePhysicalMemory, $os.TotalVisibleMemorySize)`

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.Output()
	if err != nil {
		return SystemResource{}, false
	}
	parts := strings.Split(strings.TrimSpace(string(out)), "|")
	if len(parts) != 3 {
		return SystemResource{}, false
	}
	cpu, _ := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	freeKB, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	totalKB, _ := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	if totalKB <= 0 {
		return SystemResource{}, false
	}

	res := SystemResource{
		CPUPercent: cpu,
		MemUsedMB:  (totalKB - freeKB) / 1024,
		MemTotalMB: totalKB / 1024,
		MemPercent: (totalKB - freeKB) / totalKB * 100,
	}
	winResCache = res
	winResExpiry = time.Now().Add(5 * time.Second)
	return res, true
}
