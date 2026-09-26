package service

import (
	"fmt"
	"runtime"
	"time"
)

// AppVersion is the current backend release version.
const AppVersion = "Beta1.8"

var appStartTime = time.Now()

type ChangelogEntry struct {
	Version string   `json:"version"`
	Date    string   `json:"date"`
	Items   []string `json:"items"`
}

var changelog = []ChangelogEntry{
	{
		Version: "Beta1.8",
		Date:    "2026-09-26",
		Items: []string{
			"自更新 sibling 容器执行（compose up -d 不再随 backend 容器停止而中断）",
			"镜像包仓库支持本地 file:// 路径，容器内 git 拉取 + docker load + compose 全链路生产验证通过",
		},
	},
	{
		Version: "Beta1.3",
		Date:    "2026-09-26",
		Items: []string{
			"更新推送链路首次生产验证版本（git 拉镜像仓 → docker load → compose 自动替换部署）",
		},
	},
	{
		Version: "Beta1.2",
		Date:    "2026-09-26",
		Items: []string{
			"前端镜像 standalone 瘦身（1.21GB → 308MB），更新包体积大幅缩小",
			"更新推送后台修复实例更新进度上报失效（ReportClient 值遍历），并补齐 13 项单元测试",
			"更新推送后台：GT4 应急开关 UPS_DISABLE_CAPTCHA、交互细节与动画优化",
		},
	},
	{
		Version: "Beta1.1",
		Date:    "2026-09-26",
		Items: []string{
			"「更新推送后台」联动：定时轮询接收新版本，自动 git 拉取镜像包仓库并 docker load + compose 替换部署",
			"更新推送后台：多账户管理、GT4 人机验证、邮箱验证码两步登录、明暗主题、GSAP 动画、lucide 图标",
			"修复：系统更新保存配置按钮卡死、GT4 验证成功后登录中断、敏感操作二次验证",
		},
	},
	{
		Version: "Beta1.0",
		Date:    "2026-09-25",
		Items: []string{
			"文章 / 页面 / 分类标签 / 评论 / 点赞收藏全功能博客系统",
			"管理后台：数据概览、用户文章评论管理、外观自定义、安全防护（限流 / 验证码 / 邮箱验证）",
			"「更新推送后台」联动：定时轮询接收新版本，自动 git 拉取镜像包仓库并 docker load + compose 替换部署",
		},
	},
}

func ChangelogList() []ChangelogEntry {
	return changelog
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
		Author:    "shenwei",
	}
}
