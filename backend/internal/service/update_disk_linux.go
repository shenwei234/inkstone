package service

import "syscall"

// diskFreeBytes 返回 path 所在文件系统的可用字节数（Linux）。
func diskFreeBytes(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}
