<div align="center">

# 砚 · InkStone

**现代化多用户博客平台** — Go (Gin + GORM) 后端 + Next.js 15 前端

[![Go](https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logo=postgresql&color=4169E1)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

生产实例：[blog.shenv.top](https://blog.shenv.top)

</div>

## ✨ 功能特性

**内容创作**
- 文章系统：草稿/发布、slug 路由、封面自动提取、分类与标签、浏览统计、RSS 订阅、站点地图
- 自定义页面：WordPress 式独立页面（三种模板）
- Markdown 编辑器：全屏实时预览、自动保存；小白模式一键发布

**社区互动**
- 评论系统（嵌套回复、审核管理）、点赞收藏、友情链接（自动健康检查）

**管理后台**
- 数据概览（流量趋势、资源监控）、用户/文章/评论/标签管理
- 网站管理：站点信息、导航菜单、侧边栏小工具（11 种）、壁纸、SMTP 邮件
- 外观自定义：Logo / Favicon / 明暗主题
- 安全防护：API/登录/注册/评论多级限流、**GT4 人机验证**（登录/注册/评论）、邮箱验证码、账号封禁
- 操作日志审计

**自动更新体系**
- 实例端代理（`backend/internal/service/update_agent.go`）：定时轮询更新推送后台
- 收到新版本后自动执行：`git 拉取镜像包仓库 → docker load → docker compose up -d`（一次性 sibling 容器执行，自更新不中断）
- 更新实时日志与进度上报，支持手动「立即更新」

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.27 · Gin · GORM · PostgreSQL 16 · JWT 双令牌（access 15min / refresh 7d） |
| 前端 | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · TanStack Query · GSAP |
| 部署 | Docker 离线镜像 + docker compose · Nginx 反代 · Let's Encrypt |
| 更新 | git 镜像包仓库 + 推送后台（独立组件）+ 实例端自动更新代理 |

## 🚀 快速开始

### 本地开发

```bash
# 1. 数据库（需本地 Docker）
docker compose -f docker-compose.dev.yml up -d

# 2. 后端 (8080)
cd backend && go run ./cmd/server

# 3. 前端 (3000)
cd frontend && npm run dev
```

访问 http://localhost:3000 ，第一个注册的账号自动成为管理员。

### Docker 离线部署（推荐小内存 VPS）

```powershell
# 本地构建（国内源加速）
docker build -t inkstone-backend:latest backend
docker build -t inkstone-frontend:latest --build-arg NEXT_PUBLIC_API_URL=https://<你的域名>/api/v1 frontend
docker save -o inkstone-images.tar inkstone-backend:latest inkstone-frontend:latest
```

```bash
# 服务器：加载镜像并启动
scp inkstone-images.tar root@<服务器IP>:/opt/
ssh root@<服务器IP>
cd /opt && docker load -i inkstone-images.tar
# 解压部署包（含 docker-compose.offline.yml 与 .env.example）
cd inkstone-deploy && cp .env.example .env && vi .env
docker compose up -d
curl http://127.0.0.1:8080/healthz   # {"status":"ok"}
```

前端 API 地址为**构建期注入**，更换域名需重新构建前端镜像。

## 🔄 自动更新体系

```
┌─────────────────────┐        发布新版本         ┌──────────────────┐
│   博客实例（生产）    │ ◄────── 轮询(60s) ────── │  更新推送后台      │
│  backend 容器内 agent │                         │  (独立组件)        │
└─────────┬───────────┘                         └────────┬─────────┘
          │ git clone/pull 镜像包仓库                     │ 版本管理 / 实例管理
          ▼                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  镜像包 git 仓库：inkstone-images.tar + docker-compose.offline│
└──────────────────────────────────────────────────────────────┘
          │
          ▼  docker load → docker compose up -d（sibling 容器执行）
       服务替换为新版本镜像
```

更新流程：推送后台发布版本 → 实例 60 秒内收到任务 → `git` 拉取镜像包仓库 → `docker load` 新镜像 → `docker compose up -d` 替换部署 → 上报进度。

实例在「系统更新」页配置：推送后台地址、注册令牌、镜像仓库检出目录。

## 📦 目录结构

```
blog-platform/
├── backend/
│   ├── cmd/server/              # 入口：依赖注入 + 路由注册
│   ├── internal/
│   │   ├── handler/             # HTTP 层（参数绑定 + 响应）
│   │   ├── service/             # 业务逻辑（含 update_agent.go 更新代理）
│   │   ├── repository/          # GORM 数据访问
│   │   ├── middleware/          # Auth / CORS / 限流 / 安全头 / 流量统计
│   │   └── model/               # 数据模型
│   └── pkg/config/              # 环境变量配置
├── frontend/
│   ├── app/                     # Next.js 页面（含 admin 后台）
│   ├── components/              # 组件（GT4 验证 / 编辑器 / 通知等）
│   └── lib/                     # API 客户端 / 类型 / 上下文
├── docker-compose.yml           # 离线部署编排
└── docker-compose.dev.yml       # 开发编排（仅数据库）
```

## 🔧 环境变量（后端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 监听端口 |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `localhost` / `5432` / `blog` / `blog_dev_password` / `blog_platform` | PostgreSQL |
| `JWT_SECRET` | `dev-only-...` | **生产必须改为随机串** |
| `FRONTEND_URL` | `http://localhost:3000` | CORS 白名单 + RSS 链接 |
| `PUBLIC_API_URL` | `""` | 上传文件访问前缀（反代场景留空） |
| `INKSTONE_DISABLE_CAPTCHA` | — | `1` = 全局停用人机验证（应急） |

## 📡 API 概览（`/api/v1`）

公开：`/auth/*`、`/articles`、`/categories`、`/tags`、`/pages`、`/links`、`/site-config`、`/system/info`、`/feed.xml`、`/sitemap.xml`

需登录：文章/评论/点赞的写操作、`/auth/me`

管理员：`/admin/stats`、`/admin/users|articles|comments|tags|files|pages|links`、`/admin/settings`、`/admin/logs`、`/admin/updates/*`

## 🗺 路线图

- ✅ P1 骨架：认证、文章 CRUD、前后端联调
- ✅ P2 博客核心：分类标签、评论、互动、RSS
- ✅ P3 平台化：RBAC、后台管理、安全防护、外观自定义
- ✅ P4 上线：离线镜像部署、Nginx/HTTPS、自动更新推送体系
- 🔜 规划：全文搜索（Meilisearch）、OAuth 登录、WebSocket 实时通知

## 📄 License

[MIT](LICENSE)
