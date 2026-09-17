# ---------- 构建阶段 ----------
FROM docker.m.daocloud.io/library/golang:1.27-alpine AS builder

WORKDIR /build

# 国内 Go 模块代理，避免依赖拉取超时
ENV GOPROXY=https://goproxy.cn,direct
ENV GOSUMDB=off
ENV CGO_ENABLED=0

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -ldflags="-s -w" -o server ./cmd/server

# ---------- 运行阶段 ----------
FROM docker.m.daocloud.io/library/alpine:3.20

RUN apk add --no-cache tzdata ca-certificates

WORKDIR /app
COPY --from=builder /build/server ./server
RUN mkdir -p /app/data/uploads

# 敏感信息（DB_PASSWORD / JWT_SECRET）由 docker-compose 注入
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
