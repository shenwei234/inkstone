---
name: inkstone-blog-platform
description: InkStone（砚台）多用户博客平台全栈开发指南。当需要在此代码库中开发、修改、调试功能时使用——包括后端 Go/Gin/GORM API、前端 Next.js 页面与组件、数据库模型、设置系统、认证授权、人机验证、主题外观、统计监控等。适用于新增功能、修复 bug、理解现有架构、扩展接口。
---

# InkStone 博客平台开发指南

Go + Gin + GORM + PostgreSQL 后端，Next.js 15 + React 19 前端，Docker 部署。

## 关键事实（先读这个）

| 项目 | 值 |
|---|---|
| 模块名 | `github.com/shenwei/inkstone/backend` |
| 后端端口 | `8080`（API 前缀 `/api/v1`） |
| 前端端口 | `3000`（Next.js App Router） |
| 数据库 | PostgreSQL 16（GORM AutoMigrate 自动建表） |
| 认证 | JWT 双令牌（access 15min / refresh 7d） |
| 角色 | `admin` / `user`（RBAC 中间件） |
| 用户状态 | `active` / `banned` |
| 文章状态 | `draft` / `published` |
| 敏感字段 | SMTP 密码、验证码密钥（API 只返回 `xxx_set` 布尔值，不下发明文） |

## 目录导航

```
backend/
  cmd/server/main.go              # 入口：依赖注入 + 全部路由注册
  internal/handler/               # HTTP 层：参数绑定、调用 service、错误映射
  internal/service/               # 业务逻辑层
  internal/repository/            # GORM 数据访问层
  internal/middleware/            # Auth / CORS / 限流 / 安全头 / 流量统计
  internal/model/                 # 数据模型（GORM 结构体）
  pkg/config/                     # 环境变量配置
  pkg/mailer/                     # SMTP 发信
frontend/
  app/                            # Next.js 路由（页面）
  components/                     # 可复用组件
  lib/api.ts                      # 类型化 API 客户端（唯一 API 入口）
  lib/types.ts                    # 全部 TypeScript 类型
  lib/auth-context.tsx            # 认证上下文
  lib/ui.ts                       # 共享 UI 常量（inputClass、formatSize）
  components/site-config-context.tsx  # 站点配置全局上下文
```

**详细文档：**
- 后端架构与分层约定 → `references/backend.md`
- 所有 API 接口清单 → `references/api.md`
- 前端组件与页面说明 → `references/frontend.md`
- 数据模型与数据库 → `references/data-models.md`
- 设置系统（站点配置项）→ `references/settings.md`
- 部署与运维 → `references/deployment.md`

## 开发铁律（必须遵守）

### 1. 后端严格分层，不跨层调用
```
handler → service → repository → model
```
- handler 只做**参数绑定 + 调用 service + 响应**
- 业务校验、权限判断全部在 **service**
- 数据库操作只在 **repository**
- 不要在 handler 里直接写 SQL/GORM 查询（唯一例外见 `internal/handler/admin_handler.go` 中已有的少量直接 repo 调用，属于历史遗留，新代码请走 service）

### 2. 错误处理约定
- 定义领域错误（如 `ErrForbidden`、`ErrNotFound`、`ErrUserBanned`）
- 用 `errorResponse(c, err)` 统一映射为 HTTP 响应（`internal/handler/errors.go`）
- 校验错误用 `NewValidationError("中文提示")` → 自动 400
- **所有面向用户的错误信息用中文**

### 3. 常用 handler 辅助函数
```go
parseUintParam(c, "id", "无效的 ID")   // 解析路径参数，失败自动返回 400
parseIntQuery(c, "page", 1)            // 解析查询参数带默认值
errorResponse(c, err)                  // 统一错误响应
```

### 4. 新增接口的标准流程
1. `internal/model/` 定义模型（如需新表，**必须加进 `db.go` 的 AutoMigrate 列表**）
2. `internal/repository/xxx_repo.go` 写数据访问
3. `internal/service/xxx_service.go` 写业务逻辑
4. `internal/handler/xxx_handler.go` 写 HTTP 处理
5. `cmd/server/main.go` 装配依赖 + 注册路由
6. 前端 `lib/api.ts` 加 API 函数，`lib/types.ts` 加类型

### 5. 敏感字段必须脱敏
新增密钥类设置项时：
1. 在 `settings_service.go` 的 `maskKeys` map 里登记
2. API 会自动返回 `xxx_set: bool`（表示是否已配置）
3. 前端用 `<SecretInput>` 组件展示（小眼睛切换 + 已保存显示 `*`）

### 6. 敏感设置的「空值保护」
`settings_service.Update()` 对 `maskKeys` 中的字段做了特殊处理：**提交空字符串 = 保持原值不变**（不会误删密钥）。新增敏感字段无需额外处理，登记 `maskKeys` 即可。

## 前端约定

### 全局状态用 Context，服务端数据用 React Query
- 站点配置 → `useSiteConfig()`（`site-config-context.tsx`）
- 认证状态 → `useAuth()`（`auth-context.tsx`）
- 通知/确认弹窗 → `useNotify()`（`toast.tsx`），**不要用 `alert`/`confirm`/`window.prompt`**
- API 数据 → `useQuery` / `useMutation`，queryKey 用数组如 `['articles', 'published', page]`

### 样式规范
- 全部用 Tailwind CSS，深色模式用 `dark:` 前缀
- 卡片统一：`rounded-2xl border border-border bg-card shadow-sm`
- 输入框统一用 `lib/ui.ts` 的 `inputClass`
- 动画统一用 `components/motion.tsx` 的 `easeOut` / `PageTransition` / `StaggerList`
- **长列表不要用 framer-motion 的 `layout` 属性**（会严重卡顿），只用 `initial`/`animate`

### 图标用 lucide-react
**注意**：`Github` 等品牌图标在新版 lucide 已移除，用 `GitBranch` 等替代。使用前确认图标存在。

## 环境与运行

```bash
# 数据库（Docker）
docker compose -f docker-compose.dev.yml up -d

# 后端
cd backend && go run ./cmd/server

# 前端
cd frontend && npm run dev
```

**开发环境注意事项**：
- 本项目开发机为 Windows，Docker Desktop 需要手动启动（`C:\Users\Administrator\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`）
- 若后端启动报 `failed to connect database`，通常是 Postgres 容器没运行
- Go 依赖下载需设置 `GOPROXY=https://goproxy.cn,direct`（本机已设置）

## 验证清单（改完代码必做）

```bash
# 后端
cd backend && gofmt -w . && go vet ./... && go build -o server.exe ./cmd/server

# 前端
cd frontend && npm run build && npx eslint app components lib --ext .ts,.tsx
```

三项全绿才算完成。ESLint 必须 0 错误 0 警告。

## 常见坑（踩过的）

| 坑 | 说明 |
|---|---|
| PowerShell 内联中文会损坏文件 | 用 Edit/Write 工具改文件，**不要用 PowerShell 字符串替换处理中文** |
| 前端新增 site-config 字段要双层透传 | `settings_service.Public()` 下发 + `site-config-context.tsx` 解构，缺一不可 |
| 设置保存前端要显式带上字段 | `admin/settings/page.tsx` 的 payload 是白名单，新增设置项必须手动加入 |
| 验证码配置无效应放行 | 见 `captcha_service.go`：未配置密钥/服务不可达时 `return nil`（避免锁死用户） |
| 登录限流被误伤 | 登录成功会重置限流计数，失败才累计 |
| 部署镜像需用国内源 | Dockerfile 用 `docker.m.daocloud.io`，Go 用 goproxy.cn，npm 用 npmmirror |
