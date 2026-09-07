# Blog Platform

多用户博客平台（P1 骨架）— Go (Gin + GORM) 后端 + Next.js 15 前端。

## 技术栈

- **后端**：Go 1.27 / Gin / GORM / PostgreSQL 16 / JWT (access + refresh)
- **前端**：Next.js 15 (App Router) / TypeScript / Tailwind CSS / TanStack Query / react-markdown

## 本地开发

### 1. 启动数据库

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. 启动后端 (端口 8080)

```bash
cd backend
go run ./cmd/server
```

### 3. 启动前端 (端口 3000)

```bash
cd frontend
npm run dev
```

访问 http://localhost:3000

## API 一览 (`/api/v1`)

| Method | Path | 说明 |
|---|---|---|
| POST | /auth/register | 注册 |
| POST | /auth/login | 登录 |
| POST | /auth/refresh | 刷新 token |
| GET | /auth/me | 当前用户 (需鉴权) |
| GET | /articles | 文章列表 (公开，默认已发布) |
| GET | /articles/:id | 文章详情 |
| GET | /articles/slug/:slug | 按 slug 查询 |
| POST | /articles | 创建 (需鉴权) |
| PUT | /articles/:id | 更新 (作者) |
| DELETE | /articles/:id | 删除 (作者) |

## 目录结构

```
backend/
  cmd/server/        # 入口
  internal/
    handler/         # HTTP 层
    service/         # 业务逻辑 + JWT
    repository/      # GORM 数据访问
    middleware/      # Auth / CORS
    model/           # User / Article
  pkg/config/        # 环境变量配置
frontend/
  app/               # 页面 (首页/详情/登录/注册/后台)
  components/        # Navbar / 编辑器 / Providers
  lib/               # api client / auth context / types
```

## 环境变量 (后端)

| 变量 | 默认值 |
|---|---|
| PORT | 8080 |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | localhost / 5432 / blog / blog_dev_password / blog_platform |
| JWT_SECRET | dev-only-secret-change-in-production |
| FRONTEND_URL | http://localhost:3000 (CORS 白名单) |

## 路线图

- P1 ✅ 骨架：注册/登录/JWT、文章 CRUD、前后端联调
- P2 博客核心：标签分类、评论、点赞收藏、浏览统计、RSS
- P3 平台化：RBAC、审核流、OAuth、MinIO 图片、通知邮件 (Redis)
- P4 上线：搜索 (Meilisearch)、限流、管理面板、Docker 部署、CI/CD
