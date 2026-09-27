package service

import (
	"fmt"
	"runtime"
	"time"
)

// AppVersion is the current backend release version.
const AppVersion = "Beta1.25"

var appStartTime = time.Now()

type ChangelogEntry struct {
	Version string   `json:"version"`
	Date    string   `json:"date"`
	Items   []string `json:"items"`
}

var changelog = []ChangelogEntry{
	{
		Version: "Beta1.25",
		Date:    "2026-09-27",
		Items: []string{
			"代码质量清理（无功能变化）：删除失真注释与死代码（人机验证组件未使用的 ready 状态、描述不存在逻辑的注释等），统一挂载判断 hook 为 lib/use-mounted，分享菜单图标修正",
			"包含 Beta1.24 修复：后台自动更新部署失败（创建 agent 容器缺少 Content-Type: application/json，新版 Docker daemon 强制校验）",
			"包含 Beta1.23 全部内容：Markdown 表格样式修复、favicon 后台修改即时生效、后台「站点地图」页、文章页自动目录 + 分享按钮 + 回到顶部",
		},
	},
	{
		Version: "Beta1.24",
		Date:    "2026-09-27",
		Items: []string{
			"修复后台自动更新部署失败「创建 agent 容器失败：malformed Content-Type header (): mime: no media type」：新版 Docker daemon 强制要求带 body 的请求必须携带 Content-Type: application/json，CreateContainerRaw 此前漏设（生产环境首次触发 agent 创建才暴露）",
			"包含 Beta1.23 全部内容：Markdown 表格样式修复（启用 @tailwindcss/typography）、favicon 后台修改即时生效、后台「站点地图」页（URL 分组/统计/robots 预览）、文章页自动目录 + 分享按钮 + 回到顶部",
		},
	},
	{
		Version: "Beta1.23",
		Date:    "2026-09-27",
		Items: []string{
			"修复 Markdown 表格预览无框线：安装并启用 @tailwindcss/typography（此前 prose 类完全无样式，表格退化为浏览器默认裸表），并定制表格完整框线/表头底色/斑马纹；编辑器预览与文章/独立页正文排版同步受益",
			"修复后台修改 Favicon 前台不生效：标题与图标改为 React 19 metadata hoist 方式渲染（site-head 组件），不再运行时操作 DOM link",
			"后台新增「站点地图」页：sitemap.xml 全量 URL 分组展示（基础页面/文章/独立页/分类/标签）+ 统计 + robots.txt 预览 + 按名称/地址过滤",
			"文章页增强：自动目录（滚动高亮/点击跳转，智能贴在没有侧边栏的一侧）、分享按钮（移动端原生分享/桌面复制链接/微博/Twitter/邮件）、回到顶部悬浮按钮",
		},
	},
	{
		Version: "Beta1.22",
		Date:    "2026-09-27",
		Items: []string{
			"修复更新失败/中断后重试被误判「疑似假更新」：docker load 会把宿主机 latest 改写为新镜像，残留导致重试永久卡死；现在防呆比对改为「当前运行容器」镜像 ID，且失败/中断时自动还原 latest，回滚 tag 素材改用运行容器镜像",
		},
	},
	{
		Version: "Beta1.21",
		Date:    "2026-09-27",
		Items: []string{
			"修复友链页提交申请人机验证弹窗「只有提交窗口模糊」：验证弹窗改为 createPortal 挂载到 body，不再被申请表单卡片的 transform 动画困住",
			"文章编辑器优化：Ctrl+S 与新增「存草稿」按钮统一为保存草稿（不再把草稿直接发布）；新建文章内容自动缓存到本地，刷新/误关后可一键恢复；有未保存更改时离开页面弹出提醒",
		},
	},
	{
		Version: "Beta1.20",
		Date:    "2026-09-27",
		Items: []string{
			"下载选源改为实测带宽排序（替代 RTT 排序）：GitHub 直连被限速至 KB/s 时自动优先走加速源，下载速度提升数量级",
			"下载新增空闲读超时（2 分钟无数据即失败并自动换源），慢速/断流源不再永久卡死更新流程",
			"中断自检防误杀：本进程更新任务运行中不判中断；跨进程残留窗口 3→10 分钟",
		},
	},
	{
		Version: "Beta1.19",
		Date:    "2026-09-27",
		Items: []string{
			"新增友链自助提交：前台「友情链接」页开放申请表单（名称/地址/简介/图标/邮箱），人机验证复用评论场景，IP 限流 5 次/小时",
			"后台「友情链接 → 申请审核」tab：待审核/已通过/已拒绝筛选，通过自动转为正式友链并后台探测可达性，拒绝需填原因，可删除记录",
			"申请防呆：URL 规范化去重（pending/已是友链均拦截）、IP 仅存 SHA256 哈希、可经设置项 friend_apply_enabled 一键关闭",
		},
	},
	{
		Version: "Beta1.18",
		Date:    "2026-09-27",
		Items: []string{
			"安全加固：更新链路强制 https、镜像包强制 SHA256 校验（缺失即拒绝下载）",
			"镜像白名单：仅允许 inkstone-backend/frontend 的 latest 标签，防恶意版本清单",
			"更新/回滚接口独立限流（5 次/分钟），检查与测速 10 次/分钟",
			"更新代理容器最小权限（CapDrop ALL + no-new-privileges），backend 容器同样收敛 capabilities",
			"安全响应头补充 HSTS；JWT 密钥过短启动告警",
		},
	},
	{
		Version: "Beta1.17",
		Date:    "2026-09-27",
		Items: []string{
			"周期中断自检（每 5 分钟）：agent 崩溃或残留 running 记录自动清理/回滚，不再永久挡住手动更新",
			"健康检查发现容器已退出立即失败，坏版本 crash 时快速回滚（不再等满 150 秒）",
			"加速源测速同时探测镜像包下载延迟（前端双徽章），下载前检查磁盘余量",
		},
	},
	{
		Version: "Beta1.16",
		Date:    "2026-09-27",
		Items: []string{
			"更新记录查询改用 Limit(1).Find：无记录时不再打出 not-found 日志噪音",
		},
	},
	{
		Version: "Beta1.15",
		Date:    "2026-09-27",
		Items: []string{
			"全新系统更新体系：后台「系统更新」页实时查看版本、一键更新与回滚，全程无需登录服务器",
			"全自动更新链路：定时检查 GitHub 版本清单 → 加速源测速下载镜像包 → SHA256 校验 → docker load → 一次性更新代理容器替换 backend/frontend",
			"更新防呆：镜像 ID 比对杜绝假更新；部署后健康检查 + 运行版本核对，失败自动回滚",
			"实例重启自检：上次更新若中断，自动回滚到更新前版本并记录原因",
			"内置 GitHub 加速源（ghfast/gh-proxy 等）自动测速与失败切换，新设置项 update_enabled / update_check_interval / update_mirror_urls / update_repo",
			"新增独立「更新推送后台」update-hub：发布版本、上传镜像包、维护加速源，发布后各实例自动拉取",
		},
	},
	{
		Version: "Beta1.14",
		Date:    "2026-09-26",
		Items: []string{
			"系统更新设置简化：移除「收到推送后自动更新」「仓库自治模式」两个选项，合并为单一「开启自动更新」开关",
			"移除仓库自治模式相关代码（绕过推送后台直巡镜像仓库），统一走「推送后台发布 → 实例自动更新」标准流程",
		},
	},
	{
		Version: "Beta1.13",
		Date:    "2026-09-26",
		Items: []string{
			"操作日志全覆盖：文章/用户/评论/设置/文件/友链/页面/标签/系统更新等关键操作均记录，含变更字段明细，失败操作同样留痕",
			"日志页新增统计卡片（总数 / 今日新增 / 失败操作）与时间范围、操作结果筛选",
			"新增日志导出：按当前筛选条件一键下载 CSV（UTF-8 BOM，Excel 打开中文不乱码）",
			"JWT 令牌内置用户名声明（uname），操作日志可固化操作者名称",
		},
	},
	{
		Version: "Beta1.11",
		Date:    "2026-09-26",
		Items: []string{
			"发布即自动更新：轮询间隔 60s → 15s，推送后台发版后实例无需任何点击自动更新",
			"更新防呆：docker load 后比对镜像 ID，无变化直接报错终止，杜绝「假更新」",
			"更新回滚：每次更新前自动打 rollback 回滚镜像，重启后自检运行版本，不符自动回滚并上报",
			"多仓库源回退：git 拉取 origin 失败时自动切换备用镜像仓库地址（新设置项 update_mirror_urls）",
			"新增一键发布脚本 scripts/release.ps1（自动改版本号 + 预检 + 打包 + 提交推送）",
			"backend 容器增加 /healthz 健康检查",
		},
	},
	{
		Version: "Beta1.10",
		Date:    "2026-09-26",
		Items: []string{
			"更新防呆：docker load 后比对镜像 ID，与当前一致直接报错终止，杜绝「假更新」",
			"更新回滚：每次更新前自动打 rollback 回滚镜像，重启后自检运行版本，不符自动回滚并上报",
			"多仓库源回退：git 拉取 origin 失败时自动切换备用镜像仓库地址（新设置项 update_mirror_urls）",
			"新增一键发布脚本 scripts/release.ps1（自动改版本号 + 预检 + 打包 + 提交推送）",
			"backend 容器增加 /healthz 健康检查",
		},
	},
	{
		Version: "Beta1.9",
		Date:    "2026-09-26",
		Items: []string{
			"Markdown 编辑器升级：快捷键（Ctrl+B/I/K/U/S/F）、回车续写列表、Tab 缩进",
			"编辑器新增：表格/任务列表工具、粘贴与拖拽上传图片、全屏专注模式",
			"预览支持代码块语法高亮与一键复制、任务列表可勾选并反向改写源码",
			"编辑器新增目录大纲 TOC、查找替换面板、滚动同步与状态栏",
		},
	},
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
