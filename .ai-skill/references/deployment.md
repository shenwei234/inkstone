# 部署与运维

## 部署方式对比

| 方式 | 适用 | 命令 |
|---|---|---|
| **离线镜像**（推荐小内存 VPS） | 服务器只 `docker load`，不编译 | 见下方 |
| 源码构建 | 内存 ≥ 4G 的服务器 | `docker compose up -d --build` |
| 本地开发 | 开发者本机 | `docker compose -f docker-compose.dev.yml up -d` |

**为什么推荐离线镜像**：服务器编译 Go + npm 需要 2-4GB 内存，小 VPS 容易 OOM 导致 SSH 断连。离线方式只需 `docker load`（几百 MB、约 30 秒）。

---

## 离线镜像部署（完整流程）

### 1. 本地构建镜像

```powershell
# 后端
docker build -t inkstone-backend:latest "D:\blog-platform-release\blog-platform\backend"

# 前端（API 地址必须构建期注入，填你的域名）
docker build -t inkstone-frontend:latest `
  --build-arg NEXT_PUBLIC_API_URL=https://blog.shenv.top/api/v1 `
  "D:\blog-platform-release\blog-platform\frontend"

# 导出为 tar
docker save -o "D:\blog-platform-release\inkstone-images.tar" `
  inkstone-backend:latest inkstone-frontend:latest
```

### 2. 上传到服务器

```powershell
scp "D:\blog-platform-release\inkstone-images.tar" root@<服务器IP>:/opt/
scp "D:\blog-platform-release\inkstone-offline-deploy.zip" root@<服务器IP>:/opt/
```

### 3. 服务器加载启动

```bash
cd /opt
docker load -i inkstone-images.tar      # 约 30 秒
unzip -q -o inkstone-offline-deploy.zip
cd inkstone-deploy
cat .env                                 # 确认配置
docker compose up -d
docker compose ps
curl http://127.0.0.1:8080/healthz      # {"status":"ok"}
```

### 4. Nginx 反向代理 + HTTPS

```nginx
server {
    listen 80;
    server_name blog.shenv.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name blog.shenv.top;
    client_max_body_size 100M;

    ssl_certificate     /etc/nginx/ssl/blog.shenv.top.crt;
    ssl_certificate_key /etc/nginx/ssl/blog.shenv.top.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # API / 上传 / 文件 → 后端
    location /api/     { proxy_pass http://127.0.0.1:8080; include /etc/nginx/proxy_params; }
    location /uploads/ { proxy_pass http://127.0.0.1:8080; include /etc/nginx/proxy_params; }
    location /files/   { proxy_pass http://127.0.0.1:8080; include /etc/nginx/proxy_params; }

    # 其余 → 前端
    location / { proxy_pass http://127.0.0.1:3000; include /etc/nginx/proxy_params; }
}
```

**关键点**：
- `/api`、`/uploads`、`/files` **必须**指到后端 8080（否则图片 404、接口不通）
- 前端容器端口只绑 `127.0.0.1`（`FRONTEND_BIND=127.0.0.1`），由 Nginx 对外
- 阿里云等要放行安全组 `80` + `443`

---

## 环境变量（后端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `APP_ENV` | `development` | `production` 关闭调试日志、启用 release 模式 |
| `PORT` | `8080` | 监听端口 |
| `DB_HOST` | `localhost` | PostgreSQL 地址（容器内填 `postgres`） |
| `DB_PORT` | `5432` | |
| `DB_USER` | `blog` | |
| `DB_PASSWORD` | `blog_dev_password` | **生产必改** |
| `DB_NAME` | `blog_platform` | |
| `JWT_SECRET` | `dev-only-...` | **生产必改**，64 位随机串 |
| `FRONTEND_URL` | `http://localhost:3000` | CORS 白名单 + RSS 链接 |
| `PUBLIC_API_URL` | `""` | 上传文件访问前缀（反代场景留空用相对路径） |
| `UPLOAD_DIR` | `./data/uploads` | 图片存储目录 |
| `FILES_DIR` | `./data/files` | 文件管理存储目录 |
| `INKSTONE_DISABLE_CAPTCHA` | — | 设为 `1` 全局停用验证码（应急） |

---

## Dockerfile 关键点（国内网络环境）

```dockerfile
# 后端：必须用国内 Go 代理，否则 go mod download 超时
FROM docker.m.daocloud.io/library/golang:1.27-alpine AS builder
ENV GOPROXY=https://goproxy.cn,direct
ENV GOSUMDB=off
```

```dockerfile
# 前端：必须用国内 npm 源
FROM docker.m.daocloud.io/library/node:22-alpine AS builder
RUN npm config set registry https://registry.npmmirror.com
```

**基础镜像全部走 `docker.m.daocloud.io` 镜像源**（Docker Hub 在国内被墙）。

---

## docker-compose 编排

```yaml
services:
  postgres:
    image: docker.m.daocloud.io/library/postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:?请在 .env 设置}
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck: pg_isready

  backend:
    build: ./backend            # 或 image: inkstone-backend:latest
    depends_on: { postgres: { condition: service_healthy } }
    environment:
      DB_HOST: postgres
      JWT_SECRET: ${JWT_SECRET:?请在 .env 设置}
    volumes: [uploads_data:/app/data]
    ports: ["${BACKEND_BIND:-127.0.0.1}:8080:8080"]

  frontend:
    image: inkstone-frontend:latest
    ports: ["${FRONTEND_BIND:-127.0.0.1}:3000:3000"]
```

**数据卷**：`postgres_data`（数据库）、`uploads_data`（上传文件）。

---

## 常用运维命令

```bash
docker compose ps                      # 状态
docker compose logs -f backend         # 后端日志
docker compose logs --tail=50 backend  # 最后 50 行
docker compose restart backend         # 重启后端
docker compose down                    # 停止（数据保留）
docker compose up -d                   # 启动
docker compose up -d --build           # 重新构建启动
```

## 数据备份与恢复

```bash
# 备份数据库
docker exec blog-postgres pg_dump -U blog blog_platform > backup_$(date +%F).sql

# 备份上传文件
docker run --rm -v inkstone_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz /data

# 恢复数据库
cat backup.sql | docker exec -i blog-postgres psql -U blog blog_platform
```

## 发布产物规范（Beta1.19 起）

`release.ps1`（`-ImagesDir` 默认 `D:\images`）除推送 image-repo 外，同时产出**版本化分发物**：

| 文件 | 用途 |
|---|---|
| `D:\images\inkstone-images-<Version>.tar` | 分发的镜像包（**必须带版本号**——Beta1.14 曾沿用固定名 `inkstone-images.tar`，导致仓库无新 tar、实例幂等跳过却上报成功的「假更新」事故） |
| `D:\images\release-notes-<Version>.md` | 更新说明：镜像包 SHA256/大小、包含镜像 ID、changelog 自动提取（从 `system_service.go` 正则解析当前版本 Items）、三种部署方式命令、回滚指引、部署前备份命令 |
| `D:\blog-platform-release\image-repo\inkstone-images.tar` | image-repo 检出的**固定名**tar（服务器 `docker load` 协作约定，自动 commit+push 到 `/srv/git/inkstone-images.git`） |

**纪律**：
- 服务器协作（image-repo）用固定名；对外分发/推送后台发布必须用 `inkstone-images-<Version>.tar`
- 版本号进入文件名、Release tag、清单 version 三处，缺一不可
- release-notes 的「本版变更」段可直接粘贴到 update-hub 发布表单

## 系统更新（全自动，Beta1.15）

**宿主机零操作**：backend 容器挂载 `/var/run/docker.sock` 后，从「发现新版本」到「替换容器」全链路自动完成。

### 架构

```
发布者                 GitHub                          各实例 backend
  │  update-hub 上传     │  releases/latest.json          │
  │  镜像包到 Release ──>│  + inkstone-images.tar         │
                        │<──────── 每 15 分钟检查 ────────│
                        │<──────── 经加速源下载镜像包 ────│
                        │                               docker load → 打 rollback tag
                        │                               → 一次性 agent 容器替换 backend/frontend
                        │                               → 健康检查 + 版本核对（失败自动回滚）
```

### 前提（一次性）

首次部署时保证 compose 文件包含（已内置 prod/offline）：

```yaml
services:
  backend:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

未挂载时后台「系统更新」页会显示醒目指引，其余功能不受影响。

### 实例端（博客后台 → 系统更新）

- 自动检查新版本（间隔可调，默认 15 分钟），发现即自动下载部署
- 页面展示：当前版本 / 远端版本 / 更新说明 / 进度条 / 历史 / 一键回滚
- 更新设置：`auto_update` 开关、检查间隔、发布仓库、加速源列表（自动测速）

### 发布新版本（更新推送后台 update-hub）

```bash
# 1. 本地构建镜像包（自动改版本号 + 预检 + 打包）
D:\blog-platform\scripts\release.ps1 -Version Beta1.16 -Notes "说明"

# 2. 提交源码并推送（含 releases/latest.json 模板）
git add -A && git commit -m "release Beta1.16" && git push

# 3. 更新推送后台发布（GitHub 仓库 shenwei234/inkstone）
cd update-hub && npm install && npm run dev    # 或 npm run build 后部署 out/ 静态站
```

推送后台功能：GitHub PAT 登录（仅存浏览器 sessionStorage）→ 发布新版本（填版本号/说明、
上传 `inkstone-images.tar`，自动计算 SHA256）→ 创建 Release + 上传资产 + 更新 `latest.json`
→ 维护加速源 `releases/mirrors.json`。发布后各实例自动拉取。

### 更新推送后台部署（update.shenv.top，纯静态）

update-hub 是 Next.js `output:'export'` 静态站，**无容器/无端口/无后端进程**，nginx 直接托管：

```bash
# 一条命令完成：build → scp → nginx reload
D:\blog-platform\scripts\deploy-update-hub.ps1
```

- 产物目录：服务器 `/opt/update-hub/`（本地构建 `update-hub/out/`）
- nginx 配置：`/etc/nginx/conf.d/update.conf`（`root /opt/update-hub; try_files $uri $uri/ /index.html;`）
- 首屏 HTML 为 loading 态（`use client` SPA 与 SSR 一致的 hydration 约定，挂载后切登录页），
  `/_next/static/` 一年 immutable 缓存
- 旧版（Beta1.14 前的容器式推送后台）已下线：nginx 不再反代 9090，无残留服务

**功能矩阵**（Beta1.18 update-hub）：
- 发布新版本：版本号/min_version/说明/镜像包 → 建 Release → 传资产 → 回填 `latest.json`；**发布前清单预览**、SHA256 流式计算（4MB 分块）、上传进度、复用旧 Release 自动同步 name/body
- 版本管理：当前清单详情（sha256/大小/直链/复制）、Releases 列表、**回退清单到历史版本**（自动下载资产算 SHA256，CORS/网络失败可拖本地 tar 兜底）、**下架 Release**（删 Release+tag）
- 加速源：增删改 + **浏览器直连测试延迟**（Range 2KB 探测，`lib/mirror-probe.ts`）
- 设置：账户/token 权限徽章（`x-oauth-scopes` 识别）、部署说明、实例对接指引
- 组件拆分：`components/{ui,login-card,publish-tab,versions-tab,mirrors-tab,settings-tab}.tsx` + `lib/{github,mirror-probe,sha256}.ts`，入口 `app/page.tsx` 只做编排

### 手动兜底（不需要 SSH 也行，但保留）

```bash
# 服务器本地手动更新（极少数应急场景）
curl -L -o /tmp/images.tar <镜像包地址>   # 或加速源代理地址
docker load -i /tmp/images.tar
cd <部署目录> && docker compose -f docker-compose.offline.yml up -d
```

### 失败回滚

- 自动：部署阶段健康检查/版本核对失败 → agent 自动把 `rollback-<id>` tag 恢复为 latest 并重建容器
- 自检：更新中途实例被杀 → 重启 30 秒后检测到中断记录 → 自动回滚
- 手动：后台「系统更新 → 更新历史 → 回滚到上一版本」

---

## 证书申请（acme.sh，无需 certbot）

```bash
curl https://get.acme.sh | sh -s email=your@email.com
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
mkdir -p /etc/nginx/ssl
~/.acme.sh/acme.sh --issue -d blog.shenv.top --nginx
~/.acme.sh/acme.sh --install-cert -d blog.shenv.top \
  --key-file /etc/nginx/ssl/blog.shenv.top.key \
  --fullchain-file /etc/nginx/ssl/blog.shenv.top.crt \
  --reloadcmd "systemctl reload nginx"
```

> **Alinux 注意事项**：官方 `get.docker.com` 脚本不支持 Alinux，需用 `dnf` 从阿里云源装 docker-ce（`sed -i 's/\$releasever/7/g' /etc/yum.repos.d/docker-ce.repo` 绕过版本号问题）。

---

## 首次部署初始化

1. 浏览器打开域名
2. 点「注册」→ **第一个注册的账号自动成为管理员**
3. 头像菜单 →「后台管理」
4. 后台 → 网站管理：配置站点名称、Logo、SMTP
5. 后台 → 安全防护：按需开启验证码

## 排障速查

| 现象 | 原因 | 解决 |
|---|---|---|
| `failed to connect database` | Postgres 容器没起 | `docker compose up -d postgres` |
| 页面能开但接口 404 | Nginx 没代理 `/api` | 检查反代配置 |
| 图片 404 | `/uploads` `/files` 没代理到 8080 | 补反代规则 |
| 登录报「操作过于频繁」 | 触发限流 | 等 15 分钟或调大 `security_login_max` |
| 极验提示未配置 | `geetest_captcha_id` 未传到前端 | 检查 `site-config-context.tsx` 解构 |
| 前端改了 API 地址不生效 | 构建期注入 | 必须重新 build 前端镜像 |
| `go mod download` 超时 | 缺 Go 代理 | Dockerfile 加 `GOPROXY=https://goproxy.cn,direct` |

## 项目关键路径

| 内容 | 路径 |
|---|---|
| 发布副本（含部署文件） | `D:\blog-platform-release\blog-platform\` |
| 离线部署配置包 | `D:\blog-platform-release\inkstone-offline-deploy.zip` |
| Docker 镜像包 | `D:\blog-platform-release\inkstone-images.tar` |
| 一键发布脚本 | `D:\blog-platform\scripts\release.ps1`（自动改 AppVersion + 预检 + 打包） |
| 源码压缩包 | `D:\blog-platform-release\inkstone-latest.zip` |
| 版本清单 | 仓库 `releases/latest.json`（实例端每 15 分钟自动检查） |
| 更新推送后台 | `D:\blog-platform\update-hub\`（独立 Next.js 静态站，浏览器直连 GitHub） |
| 后台一键部署脚本 | `D:\blog-platform\scripts\deploy-update-hub.ps1`（build → scp → nginx reload） |
| GitHub 仓库 | `https://github.com/shenwei234/inkstone` |
| 生产站点 | `https://blog.shenv.top` |
