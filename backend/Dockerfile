# ---------- 构建阶段 ----------
FROM golang:1.27-alpine AS builder

# 国内服务器拉 Go 依赖走 goproxy.cn（如服务器在海外可删掉本行）
ENV GOPROXY=https://goproxy.cn,direct
# Alpine 系统包走清华镜像（如服务器在海外可删掉本行）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

WORKDIR /build

# 先复制依赖文件，利用 Docker 层缓存
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server

# ---------- 运行阶段 ----------
FROM alpine:3.20

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories \
    && apk add --no-cache tzdata ca-certificates

WORKDIR /app
COPY --from=builder /build/server ./server

# 上传文件目录（挂载卷持久化）
RUN mkdir -p /app/data/uploads

ENV APP_ENV=production \
    PORT=8080 \
    DB_HOST=postgres \
    DB_PORT=5432 \
    DB_USER=blog \
    DB_PASSWORD=blog_password \
    DB_NAME=blog_platform \
    UPLOAD_DIR=/app/data/uploads \
    TZ=Asia/Shanghai

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["./server"]
