#!/usr/bin/env bash
# ============================================================
#  InkStone 部署诊断脚本
#  用法：./scripts/check.sh
#  作用：一键体检容器/端口/接口/日志，并给出修复建议
# ============================================================
set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✔${NC} $*"; }
bad()  { echo -e "${RED}  ✘${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
head() { echo -e "\n${BLUE}== $* ==${NC}"; }

cd "$(dirname "$0")/.."
COMPOSE_FILE="docker-compose.baota.yml"
[[ -f "$COMPOSE_FILE" ]] || COMPOSE_FILE="docker-compose.yml"

head "1. 环境"
command -v docker >/dev/null 2>&1 && ok "docker $(docker --version | awk '{print $3}' | tr -d ,)" || bad "未安装 docker"
docker compose version >/dev/null 2>&1 && ok "docker compose 可用" || bad "docker compose 不可用"
docker info 2>/dev/null | grep -q "Registry Mirrors" && ok "已配置镜像加速" || warn "未配置镜像加速（拉镜像可能超时）"

head "2. 容器状态（$COMPOSE_FILE）"
if docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}}\t{{.Status}}' 2>/dev/null | grep -q .; then
  docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}}\t{{.Status}}'
else
  bad "没有运行中的容器，先执行：./deploy-baota.sh"
fi

head "3. 端口监听"
for port in 3000 8080; do
  if (command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${port} ") \
     || (command -v lsof >/dev/null && lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1); then
    ok "端口 ${port} 已监听"
  else
    bad "端口 ${port} 未监听"
  fi
done

head "4. 接口自检"
if curl -fsS --max-time 5 http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
  ok "后端 /healthz 正常：$(curl -fsS --max-time 5 http://127.0.0.1:8080/healthz)"
else
  bad "后端 /healthz 失败"
fi
if curl -fsSI --max-time 5 http://127.0.0.1:3000 >/dev/null 2>&1; then
  ok "前端 3000 正常"
else
  bad "前端 3000 失败"
fi
if curl -fsS --max-time 5 http://127.0.0.1:8080/api/v1/site-config >/dev/null 2>&1; then
  ok "公开接口 /api/v1/site-config 正常"
else
  bad "公开接口异常（数据库未连上？）"
fi

head "5. 环境变量"
if [[ -f .env ]]; then
  grep -E '^(DB_USER|DB_NAME|FRONTEND_URL|PUBLIC_API_URL|NEXT_PUBLIC_API_URL)=' .env | sed 's/^/  /'
  grep -q '^JWT_SECRET=change-me' .env && warn "JWT_SECRET 仍是默认值，务必修改！" || ok "JWT_SECRET 已自定义"
else
  bad "缺少 .env 文件"
fi

head "6. 最近日志（backend / frontend）"
echo "--- backend ---"
docker compose -f "$COMPOSE_FILE" logs --tail=15 backend 2>/dev/null || warn "无日志"
echo "--- frontend ---"
docker compose -f "$COMPOSE_FILE" logs --tail=10 frontend 2>/dev/null || warn "无日志"

head "7. 磁盘与数据库"
docker exec inkstone-postgres pg_isready -U "${DB_USER:-blog}" >/dev/null 2>&1 \
  && ok "PostgreSQL 可连接" || bad "PostgreSQL 无法连接"
df -h / | awk 'NR==1{print "  "$0} NR==2{print "  "$0}'

echo ""
echo "诊断完成。常见修复："
echo "  拉镜像超时     → 宝塔 Docker管理器配置镜像加速后重启 docker"
echo "  后端起不来     → docker compose -f $COMPOSE_FILE logs backend"
echo "  前端接口 404   → Nginx 缺少 /api/v1/ 与 /uploads/ 反向代理规则"
echo "  改了域名不生效 → ./deploy-baota.sh 你的域名（会重新构建前端）"
