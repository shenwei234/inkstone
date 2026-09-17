# ---------- 构建阶段 ----------
FROM docker.m.daocloud.io/library/golang:1.27-alpine AS builder

WORKDIR /build

# 先复制依赖文件，利用 Docker 层缓存
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server

# ---------- 运行阶段 ----------
FROM docker.m.daocloud.io/library/alpine:3.20

RUN apk add --no-cache tzdata ca-certificates

WORKDIR /app
COPY --from=builder /build/server ./server

# 上传文件目录（挂载卷持久化）
RUN mkdir -p /app/data/uploads

# 注意：数据库密码 / JWT 密钥等敏感信息由 docker-compose 或环境变量注入，
# 此处只提供非敏感的默认值。
ENV APP_ENV=production \
    PORT=8080 \
    DB_HOST=postgres \
    DB_PORT=5432 \
    DB_NAME=blog_platform \
    UPLOAD_DIR=/app/data/uploads

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["./server"]
