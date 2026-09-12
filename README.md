# InkStone · 砚台

![Logo](frontend/public/logo.svg)

**InkStone（砚台）** — 一方承载文字的多用户博客系统。Go + Gin + GORM 后端，Next.js 15 前端，PostgreSQL 存储，Docker 一键部署。

![Version](https://img.shields.io/badge/version-1.2.0-blue) ![Go](https://img.shields.io/badge/Go-1.27-00ADD8) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![License](https://img.shields.io/badge/license-MIT-green)

> 作者：shenwei

## ✨ 功能特性

### 内容
- 📝 **区块富文本编辑器**（Gutenberg 风格）：`/` 斜杠命令插块、区块工具栏、选字浮动排版、小白模式自动保存草稿、一键发布
- 📄 **独立页面管理**：关于/友链等自定义页面，三种模板（常规/通栏/自定义 HTML）
- 🏷️ **分类与标签**、全文搜索、标签云
- 💬 **评论系统**（嵌套支持）、👍 点赞收藏、👀 浏览量统计、📡 RSS 订阅

### 用户与安全
- 👥 多用户 + RBAC 权限（管理员/普通用户）、注册开关、用户封禁
- 🔐 JWT 双令牌（Access + Refresh）、bcrypt 密码哈希、封禁实时拦截
- 👤 用户个人中心：修改资料/密码、我的文章、我的评论

### 外观与管理
- 🎨 **外观管理**：导航菜单自定义（可配图标、可选页面）、11 种侧边栏小工具（站长信息/天气/节日倒计时/时钟/一言/热门文章等）、侧边栏左右切换
- ⚙️ **网站管理**：站点名称/Logo/Favicon、SMTP 邮件（测试邮件）、ICP 备案号
- 📊 管理后台：数据概览、评论管理、系统更新检查与变更日志

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.27 · Gin · GORM · golang-jwt |
| 数据库 | PostgreSQL 16 |
| 前端 | Next.js 15 (App Router) · TypeScript · Tailwind CSS · TanStack Query · TipTap · Framer Motion |
| 部署 | Docker Compose · Nginx/Caddy |

## 📁 目录结构

```
blog-platform/
├── backend/                 # Go 后端
│   ├── cmd/server/          # 入口
│   ├── internal/
│   │   ├── handler/         # HTTP 处理层
│   │   ├── service/         # 业务逻辑
│   │   ├── repository/      # GORM 数据访问
│   │   ├── middleware/      # JWT/CORS/RBAC 中间件
│   │   └── model/           # 数据模型
│   ├── pkg/                 # config / mailer
│   └── Dockerfile
├── frontend/                # Next.js 前端
│   ├── app/                 # 页面路由
│   ├── components/          # 组件（编辑器/小工具/通知）
│   ├── lib/                 # API client / 认证上下文
│   └── Dockerfile
├── docker-compose.yml       # 生产部署编排
├── docker-compose.dev.yml   # 开发用（仅数据库）
└── .env.example             # 环境变量模板
```

---

# 🚀 部署教程

## 方式一：本地开发环境

### 前置要求

- Go ≥ 1.24、Node.js ≥ 20、Docker（或本地 PostgreSQL 16）

### 1. 启动数据库

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. 启动后端（端口 8080）

```bash
cd backend
go run ./cmd/server
# 首次启动自动建表（GORM AutoMigrate）
```

### 3. 启动前端（端口 3000）

```bash
cd frontend
npm install
npm run dev
```

### 4. 访问与初始化

打开 http://localhost:3000 → 注册第一个账号 → **第一个注册的用户自动成为管理员**。

---

## 方式二：Docker 一键部署（推荐）

### 1. 克隆项目

```bash
git clone https://github.com/shenwei/inkstone.git
cd inkstone
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

**必改两项**：

```ini
# 数据库密码
DB_PASSWORD=你的数据库密码
# JWT 密钥（生成方式：openssl rand -hex 32）
JWT_SECRET=生成的随机密钥
```

**有域名/IP 时同步修改**（假设服务器 IP 为 `1.2.3.4`）：

```ini
FRONTEND_URL=http://1.2.3.4:3000
PUBLIC_API_URL=http://1.2.3.4:8080
NEXT_PUBLIC_API_URL=http://1.2.3.4:8080/api/v1
```

### 3. 构建并启动

```bash
docker compose up -d --build
```

首次构建约 3-5 分钟。完成后：

| 服务 | 地址 |
|---|---|
| 前端站点 | http://localhost:3000 |
| 后端 API | http://localhost:8080/api/v1 |
| 健康检查 | http://localhost:8080/healthz |
| RSS 订阅 | http://localhost:8080/feed.xml |

常用运维命令：

```bash
docker compose logs -f backend    # 看后端日志
docker compose restart backend    # 重启单个服务
docker compose down               # 停止（数据保留在卷中）
docker compose up -d --build      # 更新代码后重新部署
```

---

## 方式三：VPS 生产部署（含域名 + HTTPS）

以 Ubuntu 22.04 + Caddy（自动 HTTPS）为例。

### 1. 服务器准备

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
# 安装 Caddy（自动 HTTPS 反向代理）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 2. 部署应用

```bash
git clone https://github.com/shenwei/inkstone.git && cd inkstone
cp .env.example .env && nano .env
```

假设域名 `blog.example.com`：

```ini
DB_PASSWORD=强数据库密码
JWT_SECRET=64位随机字符串
FRONTEND_URL=https://blog.example.com
PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

> 也可以前后端共用一个域名，用路径区分（见下方 Caddy 配置注释）。

```bash
docker compose up -d --build
```

### 3. 配置 Caddy 反向代理

```bash
sudo nano /etc/caddy/Caddyfile
```

**两个域名方案**（推荐）：

```
blog.example.com {
    reverse_proxy localhost:3000
}

api.example.com {
    reverse_proxy localhost:8080
}
```

**单域名方案**（前端 + API 共用）：

```
blog.example.com {
    handle /api/v1/* {
        reverse_proxy localhost:8080
    }
    handle /uploads/* {
        reverse_proxy localhost:8080
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

> ⚠️ 单域名方案需将 `.env` 中三个地址都改为 `https://blog.example.com`（API 为 `https://blog.example.com/api/v1`）并重新 `docker compose up -d --build` 重建前端。

```bash
sudo systemctl reload caddy
```

Caddy 自动申请并续期 Let's Encrypt 证书，直接访问 https://blog.example.com 即可。

### 4. 数据备份与恢复

```bash
# 备份数据库
docker exec blog-postgres pg_dump -U blog blog_platform > backup_$(date +%F).sql
# 备份上传文件
docker run --rm -v inkstone_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz /data

# 恢复数据库
cat backup_2026-01-01.sql | docker exec -i blog-postgres psql -U blog blog_platform
```

### 5. 系统升级

```bash
cd inkstone
git pull
docker compose up -d --build
# 数据库结构变更会在后端启动时自动迁移
```

---

## ⚙️ 环境变量参考（后端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8080 | 后端监听端口 |
| `APP_ENV` | development | production 时关闭调试日志 |
| `DB_HOST` / `DB_PORT` | localhost / 5432 | PostgreSQL 地址 |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | blog / — / blog_platform | 数据库凭据 |
| `JWT_SECRET` | dev-only… | **生产必须修改**，JWT 签名密钥 |
| `FRONTEND_URL` | http://localhost:3000 | CORS 白名单 + RSS 链接 |
| `PUBLIC_API_URL` | — | 上传文件对外访问前缀 |
| `UPLOAD_DIR` | ./data/uploads | 上传文件存储目录 |

其余站点级配置（站点名称、Logo、注册开关、SMTP 等）在 **后台 → 网站管理** 中在线配置，无需重启。

## ❓ FAQ

**Q: 忘记管理员密码怎么办？**
```bash
# 重置为 password123（之后请登录修改）
docker exec -it blog-postgres psql -U blog -d blog_platform \
  -c "UPDATE users SET password_hash='\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE username='管理员用户名';"
```

**Q: 如何把某个用户提升为管理员？**
```bash
docker exec -it blog-postgres psql -U blog -d blog_platform \
  -c "UPDATE users SET role='admin' WHERE email='xxx@example.com';"
```
该用户重新登录后生效。

**Q: 天气/一言小工具不显示？**
这两个小工具由**访客浏览器**直接请求第三方 API（Open-Meteo / hitokoto），与服务器网络无关；检查浏览器控制台，若被浏览器扩展拦截请放行。

**Q: 上传的图片存在哪里？**
后端容器 `/app/data/uploads`（Docker 卷 `uploads_data`），通过 `http://后端地址/uploads/文件名` 访问。

**Q: 如何只用一个域名部署？**
见上文「单域名方案」，注意修改 `.env` 后需 `--build` 重建前端（API 地址是构建期注入的）。

**Q: 修改了站点名称/Logo 但前台没变？**
保存后**刷新前台页面**即可（配置通过 site-config 接口在浏览器端生效）。

## 🗺️ 路线图

- [x] P1 — 后端骨架 / 认证 / 文章 CRUD / 前后端联调
- [x] P2 — 分类标签 / 评论 / 点赞收藏 / 浏览统计 / RSS
- [x] P3 — 页面管理 / 外观自定义 / 网站设置 / 用户后台 / 系统更新
- [ ] P4 — Meilisearch 全文搜索 / Redis 限流 / 对象存储 / CI/CD

## 📄 License

MIT
