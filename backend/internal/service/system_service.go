package service

import (
	"fmt"
	"runtime"
	"time"
)

// AppVersion is the current backend release version.
const AppVersion = "Beta1.26"

var appStartTime = time.Now()

type SystemInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	GoVersion string `json:"go_version"`
	Uptime    string `json:"uptime"`
	Author    string `json:"author"`
}

func BuildSystemInfo(siteName string) SystemInfo {
	uptime := time.Since(appStartTime)
	days := int(uptime.Hours() / 24)
	hours := int(uptime.Hours()) % 24
	minutes := int(uptime.Minutes()) % 60
	return SystemInfo{
		Name:      siteName,
		Version:   AppVersion,
		GoVersion: runtime.Version(),
		Uptime:    fmt.Sprintf("%d 天 %d 小时 %d 分钟", days, hours, minutes),
		Author:    "shenwei",
	}
}
