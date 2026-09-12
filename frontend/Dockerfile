# ---------- 构建阶段 ----------
FROM node:22-alpine AS builder

# 国内服务器走 npmmirror（如服务器在海外可删掉本行）
RUN npm config set registry https://registry.npmmirror.com

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# API 地址在构建期注入（浏览器端会使用该地址）
ARG NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ---------- 运行阶段 ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Shanghai

COPY --from=builder /build/package.json /build/package-lock.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/.next ./.next
COPY --from=builder /build/public ./public
COPY --from=builder /build/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "run", "start"]
