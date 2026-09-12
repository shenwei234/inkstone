#!/usr/bin/env bash
# ============================================================
#  InkStone 宝塔一键部署脚本
#  用法：
#    ./deploy-baota.sh                     # 使用 .env 中已有配置
#    ./deploy-baota.sh blog.example.com    # 自动写入域名并部署
#    ./deploy-baota.sh blog.example.com --no-cache   # 强制重新构建
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[信息]${NC} $*"; }
ok()    { echo -e "${GREEN}[成功]${NC} $*"; }
warn()  { echo -e "${YELLOW}[注意]${NC} $*"; }
fail()  { echo -e "${RED}[失败]${NC} $*"; exit 1; }

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.baota.yml"
DOMAIN="${1:-}"
NO_CACHE=""
[[ "${2:-}" == "--no-cache" ]] && NO_CACHE="--no-cache"

echo "========================================"
echo "      InkStone 宝塔一键部署脚本"
echo "========================================"

# ---------- 1. 环境检查 ----------
info "检查 Docker 环境..."
command -v docker >/dev/null 2>&1 || fail "未找到 docker，请先在宝塔「软件商店」安装 Docker 管理器"
docker compose version >/dev/null 2>&1 || fail "未找到 docker compose，请升级 Docker 到 20.10+"
ok "Docker 环境正常：$(docker --version)"

[[ -f "$COMPOSE_FILE" ]] || fail "缺少 $COMPOSE_FILE，请在项目根目录运行"
[[ -f "backend/Dockerfile" ]] || fail "缺少 backend/Dockerfile，源码不完整"

# ---------- 2. 镜像加速 ----------
if ! docker info 2>/dev/null | grep -q "Registry Mirrors"; then
  warn "未检测到 Docker 镜像加速，国内服务器建议配置后再部署"
  warn "宝塔 Docker管理器 → 设置 → 镜像加速，填入： https://docker.m.daocloud.io"
  read -r -p "是否继续？(y/N) " reply
  [[ "${reply,,}" == "y" ]] || exit 0
else
  ok "已配置镜像加速"
fi

# ---------- 3. 生成 / 校验 .env ----------
if [[ ! -f .env ]]; then
  [[ -z "$DOMAIN" ]] && fail "缺少 .env 且未提供域名。用法：./deploy-baota.sh blog.example.com"
  info "生成 .env（域名：$DOMAIN）..."
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  DB_PASSWORD="InkStone@$(openssl rand -hex 4 2>/dev/null || echo '2026_shenv')"
  cat > .env <<EOF
DB_USER=blog
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=blog_platform

JWT_SECRET=${JWT_SECRET}

FRONTEND_URL=https://${DOMAIN}
PUBLIC_API_URL=https://${DOMAIN}
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api/v1

UPLOAD_DIR=/app/data/uploads
EOF
  chmod 600 .env
  ok ".env 已生成（数据库密码：${DB_PASSWORD}）"
else
  ok "使用已存在的 .env"
  if [[ -n "$DOMAIN" ]]; then
    info "更新 .env 中的域名为 $DOMAIN ..."
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" .env
    sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=https://${DOMAIN}|" .env
    sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://${DOMAIN}/api/v1|" .env
  fi
fi

# 校验必填项
set -a; source ./.env; set +a
[[ -z "${JWT_SECRET:-}" ]] && fail ".env 缺少 JWT_SECRET"
[[ "${JWT_SECRET}" == "change-me-to-a-long-random-secret" ]] && fail "请修改 .env 中的 JWT_SECRET（生成：openssl rand -hex 32）"
[[ -z "${FRONTEND_URL:-}" || "${FRONTEND_URL}" == *"localhost"* ]] && warn "FRONTEND_URL 仍为默认值：${FRONTEND_URL}"
[[ "${NEXT_PUBLIC_API_URL}" != "${FRONTEND_URL}/api/v1" ]] && warn "NEXT_PUBLIC_API_URL 与 FRONTEND_URL 不匹配，前端可能无法访问 API"
ok "环境变量：FRONTEND_URL=${FRONTEND_URL}"

# ---------- 4. 端口占用检查 ----------
for port in 3000 8080; do
  if (command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${port} ") \
     || (command -v lsof >/dev/null && lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1); then
    warn "端口 ${port} 已被占用（若为上次部署的容器可忽略）"
  fi
done

# ---------- 5. 构建启动 ----------
info "开始构建并启动（首次约 3~6 分钟）..."
docker compose -f "$COMPOSE_FILE" up -d --build $NO_CACHE

info "等待服务就绪..."
sleep 10
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then break; fi
  sleep 3
done

# ---------- 6. 自检 ----------
echo ""
info "===== 部署自检 ====="
docker compose -f "$COMPOSE_FILE" ps

echo ""
if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
  ok "后端 API：http://127.0.0.1:8080/healthz 正常"
else
  warn "后端未就绪，查看日志：docker compose -f $COMPOSE_FILE logs --tail=50 backend"
fi

if curl -fsSI http://127.0.0.1:3000 >/dev/null 2>&1; then
  ok "前端站点：http://127.0.0.1:3000 正常"
else
  warn "前端未就绪，查看日志：docker compose -f $COMPOSE_FILE logs --tail=50 frontend"
fi

# ---------- 7. 后续指引 ----------
DOMAIN_DISPLAY="${DOMAIN:-${FRONTEND_URL#https://}}"
cat <<EOF

========================================
  部署完成，还需 4 步：
========================================
1) 域名解析：${DOMAIN_DISPLAY} → 本服务器公网 IP
2) 安全组放行：80、443
3) 宝塔建站（域名 ${DOMAIN_DISPLAY}）→ 申请 SSL → 强制 HTTPS
4) 添加反向代理：目标 http://127.0.0.1:3000，然后把配置替换为：

   location ~ ^/(api/v1|uploads)/ {
       proxy_pass http://127.0.0.1:8080;
       proxy_set_header Host \$host;
       proxy_set_header X-Real-IP \$remote_addr;
       proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto \$scheme;
       client_max_body_size 20m;
   }
   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade \$http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host \$host;
       proxy_set_header X-Forwarded-Proto \$scheme;
   }

完成后访问：https://${DOMAIN_DISPLAY}
第一个注册的用户将自动成为管理员。

常用命令：
  查看状态：docker compose -f ${COMPOSE_FILE} ps
  查看日志：docker compose -f ${COMPOSE_FILE} logs -f backend
  更新部署：git pull && ./deploy-baota.sh
  停止服务：docker compose -f ${COMPOSE_FILE} down
EOF
