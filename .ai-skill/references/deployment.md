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

## 更新版本

```bash
# 离线方式（推荐）
# 本地：重新 build + save → 上传 → 服务器：
docker load -i inkstone-images.tar
docker compose up -d

# 源码方式
git pull && docker compose up -d --build

# 数据库结构变更会在后端启动时自动迁移（GORM AutoMigrate）
```

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
| 源码压缩包 | `D:\blog-platform-release\inkstone-latest.zip` |
| GitHub 仓库 | `https://github.com/shenwei234/inkstone` |
| 生产站点 | `https://blog.shenv.top` |
