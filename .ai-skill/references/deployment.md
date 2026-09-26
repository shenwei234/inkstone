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

## 更新版本（推送后台 + 镜像包 git 仓库）

新更新体系由两部分组成：

1. **更新推送后台**（`D:\Update`，独立 Go+Gin 单二进制服务）：发布版本、管理实例
2. **镜像包 git 仓库**：存放 `inkstone-images.tar`（docker save 导出）与 `docker-compose.offline.yml`

**生产推送后台**：https://update.shenv.top（服务器 47.116.16.181，systemd `inkstone-update.service`，
只绑 `127.0.0.1:9090`，Nginx 443 反代，LE 证书 acme.sh 自动续期）。
客户端侧「推送服务配置」服务地址填 `https://update.shenv.top`，令牌在推送后台「注册令牌」页生成（每个实例一个）。

### 1. 镜像包 git 仓库结构（根目录即部署目录）

```text
inkstone-images/                  # git 仓库
├── inkstone-images.tar           # docker save 导出的镜像包
├── docker-compose.offline.yml    # 离线编排（image: 引用，不 build）
└── .env                          # 服务器本地维护，不进 git（pull 不覆盖未跟踪文件）
```

本地打包命令：

```powershell
docker build -t inkstone-backend:latest "D:\blog-platform-release\blog-platform\backend"
docker build -t inkstone-frontend:latest --build-arg NEXT_PUBLIC_API_URL=https://blog.shenv.top/api/v1 "D:\blog-platform-release\blog-platform\frontend"
docker save -o inkstone-images.tar inkstone-backend:latest inkstone-frontend:latest
git add inkstone-images.tar docker-compose.offline.yml
git commit -m "release Beta1.1"
git push
```

### 2. 更新推送后台部署（/opt/inkstone-update）

```bash
PORT=9090 DATA_DIR=/opt/inkstone-update/data ADMIN_PASSWORD=<强密码> nohup ./update-server > run.log 2>&1 &
```

初始管理密码 `admin`（或 `ADMIN_PASSWORD`，仅首次生效），登录后立即在页面右上角修改。
Nginx 反代必须与博客同为 https（浏览器混合内容策略会拦截 http 请求）：

```nginx
server {
    server_name update.shenv.top;
    location / { proxy_pass http://127.0.0.1:9090; include /etc/nginx/proxy_params; }
}
```

### 3. 连接博客实例

博客后台 →「系统更新 → 推送服务配置」：

| 配置项 | 示例 |
|---|---|
| 推送后台服务地址 | `https://update.shenv.top` |
| 访问令牌 | 推送后台「注册令牌」页生成（每个实例一个） |
| 镜像包 git 仓库检出目录 | `/opt/inkstone-images` |
| docker compose 编排文件名 | `docker-compose.offline.yml` |

保存后实例每 60s 轮询一次；`auto` 开启时收到新版本自动更新，关闭时仅在页面提醒、手动点「立即更新」。

### 4. 发布新版本

推送后台 →「版本发布」填版本号（如 `Beta1.1`）、更新说明、镜像仓库地址/分支/镜像包/编排 → 创建 → 点「发布」。
所有实例 60s 内收到任务并执行：

```bash
git clone --depth 1 --branch <branch> <repo_url> <repo_dir>   # 首次
git -C <repo_dir> fetch origin <branch> && git -C <repo_dir> reset --hard FETCH_HEAD  # 增量
docker load -i <repo_dir>/inkstone-images.tar
docker compose -f docker-compose.offline.yml up -d              # 替换部署（backend 自身会重建）
```

「客户端实例」页可查看每个站点的当前版本/目标版本/更新状态/心跳；更新失败可重新点「发布」再次推送。

**故障提示**：backend 容器更新时会被自身替换，进程日志随之清断，最终状态以推送后台显示的版本为准。

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
| 更新推送后台（版本发布/推送） | `D:\Update`（Go+Gin 单二进制，默认端口 9090） |
| GitHub 仓库 | `https://github.com/shenwei234/inkstone` |
| 生产站点 | `https://blog.shenv.top` |
