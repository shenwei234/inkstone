package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"time"
)

// AppVersion is the current backend release version.
const AppVersion = "1.2.0"

var appStartTime = time.Now()

type ChangelogEntry struct {
	Version string   `json:"version"`
	Date    string   `json:"date"`
	Items   []string `json:"items"`
}

var changelog = []ChangelogEntry{
	{
		Version: "1.2.0",
		Date:    "2026-09-09",
		Items: []string{
			"页面管理：WordPress 式自定义页面，支持三种模板",
			"外观管理：顶部菜单自定义（页面选择/图标选择）、侧边栏小工具（天气/倒计时/站长信息等 11 种）、侧边栏左右切换",
			"网站管理：注册开关、SMTP 邮件、站点 Logo/Favicon 自定义",
			"用户管理：管理员创建用户、封禁/解封",
		},
	},
	{
		Version: "1.1.0",
		Date:    "2026-09-08",
		Items: []string{
			"分类与标签、评论系统、点赞收藏、浏览量统计、RSS 订阅",
			"管理后台：数据概览、用户/文章/评论管理",
			"TipTap 区块编辑器 + 小白模式（自动保存/一键发布）",
			"全站 UI 动画升级，统一通知与确认弹窗模板",
		},
	},
	{
		Version: "1.0.0",
		Date:    "2026-09-07",
		Items: []string{
			"Go + Gin + GORM 后端骨架，PostgreSQL 存储",
			"JWT 认证（注册/登录/刷新令牌）与 RBAC 权限",
			"文章 CRUD、草稿/发布、slug 路由",
			"Next.js 15 前端（文章列表/详情/后台）",
		},
	},
}

func ChangelogList() []ChangelogEntry {
	return changelog
}

type UpdateManifest struct {
	Version     string   `json:"version"`
	Notes       []string `json:"notes"`
	DownloadURL string   `json:"download_url"`
}

type UpdateCheck struct {
	Current     string   `json:"current"`
	Latest      string   `json:"latest"`
	HasUpdate   bool     `json:"has_update"`
	Notes       []string `json:"notes,omitempty"`
	DownloadURL string   `json:"download_url,omitempty"`
	CheckedAt   string   `json:"checked_at"`
	ManifestURL string   `json:"manifest_url"`
	Message     string   `json:"message"`
}

func compareSemver(a, b string) int {
	pa := parseSemver(a)
	pb := parseSemver(b)
	for i := 0; i < 3; i++ {
		if pa[i] > pb[i] {
			return 1
		}
		if pa[i] < pb[i] {
			return -1
		}
	}
	return 0
}

func parseSemver(v string) [3]int {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	for i, part := range strings.SplitN(v, ".", 3) {
		if i > 2 {
			break
		}
		n := 0
		for _, ch := range part {
			if ch < '0' || ch > '9' {
				break
			}
			n = n*10 + int(ch-'0')
		}
		out[i] = n
	}
	return out
}

// CheckUpdates fetches a remote version manifest and compares versions.
func CheckUpdates(manifestURL string) (*UpdateCheck, error) {
	result := &UpdateCheck{
		Current:     AppVersion,
		CheckedAt:   time.Now().Format(time.RFC3339),
		ManifestURL: manifestURL,
	}
	if strings.TrimSpace(manifestURL) == "" {
		result.Latest = AppVersion
		result.Message = "未配置更新源，请在下方填写清单地址后检查"
		return result, nil
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(manifestURL)
	if err != nil {
		return nil, fmt.Errorf("无法连接更新源: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("更新源返回异常状态 %d", resp.StatusCode)
	}

	var manifest UpdateManifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return nil, fmt.Errorf("更新清单格式无效: %w", err)
	}
	if manifest.Version == "" {
		return nil, fmt.Errorf("更新清单缺少 version 字段")
	}

	result.Latest = manifest.Version
	result.Notes = manifest.Notes
	result.DownloadURL = manifest.DownloadURL
	result.HasUpdate = compareSemver(manifest.Version, AppVersion) > 0
	if result.HasUpdate {
		result.Message = "发现新版本 " + manifest.Version
	} else {
		result.Message = "当前已是最新版本"
	}
	return result, nil
}

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
		Author:    "Blog Platform Team",
	}
}
