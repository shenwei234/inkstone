package service

import "fmt"

// diskFreeBytes Windows 开发环境不支持 Statfs，返回错误由调用方跳过预检。
func diskFreeBytes(path string) (uint64, error) {
	return 0, fmt.Errorf("windows 不支持磁盘预检")
}
