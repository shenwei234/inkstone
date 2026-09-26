# 后端架构详解

Go 1.27 + Gin + GORM + PostgreSQL。模块名 `github.com/shenwei/inkstone/backend`。

## 分层架构

```
cmd/server/main.go     ← 依赖装配 + 路由注册（唯一入口）
      ↓
internal/handler/      ← HTTP 层：绑定参数、调用 service、映射错误
      ↓
internal/service/      ← 业务逻辑：校验、权限、事务编排
      ↓
internal/repository/   ← 数据访问：GORM 查询
      ↓
internal/model/        ← 数据模型
```

**横切关注点**：
- `internal/middleware/` — Auth、CORS、限流、安全头、流量统计
- `pkg/config/` — 环境变量
- `pkg/mailer/` — SMTP 发信

---

## 各层职责与约定

### handler 层

```go
type FooHandler struct {
    foo *service.FooService
}

func NewFooHandler(foo *service.FooService) *FooHandler {
    return &FooHandler{foo: foo}
}

func (h *FooHandler) Create(c *gin.Context) {
    current, ok := middleware.GetCurrentUser(c)  // 拿当前用户
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
        return
    }

    var req fooRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
        return
    }

    result, err := h.foo.Create(current.ID, req.Field)
    if err != nil {
        errorResponse(c, err)   // 统一错误映射
        return
    }
    c.JSON(http.StatusCreated, gin.H{"foo": result})
}
```

**约定**：
- 请求结构体命名 `xxxRequest`，响应转换函数 `toXxxResponse()`
- 用 `binding:"required"` 做基础校验，业务校验放 service
- 路径参数用 `parseUintParam(c, "id", "无效的 ID")`
- 分页参数用 `parseIntQuery(c, "page", 1)`

### service 层

- 定义领域错误：`ErrForbidden`、`ErrInvalidCredentials`、`ErrUserBanned`、`ErrRegistrationClosed`
- 校验失败返回 `NewValidationError("中文提示")`
- 权限判断（如「只能改自己的文章」）在这里做
- 返回 `(*model.Xxx, error)`，不做 JSON 转换

### repository 层

- 定义哨兵错误：`ErrNotFound`、`ErrEmailTaken`、`ErrUsernameTaken`
- 唯一约束冲突用 `uniqueViolationField(err)` 解析 `pgconn.PgError` 的约束名
- 列表查询统一签名 `List(query) ([]model.X, int64, error)`（返回总数用于分页）

### model 层

GORM 结构体。**新增模型必须加入 `internal/repository/db.go` 的 AutoMigrate 列表**：

```go
db.AutoMigrate(
    &model.User{}, &model.Article{}, &model.Category{}, &model.Tag{},
    &model.Comment{}, &model.Reaction{}, &model.Setting{}, &model.Page{},
    &model.FriendLink{}, &model.FileAsset{}, &model.DailyStat{}, &model.VisitorDay{},
)
```

---

## 中间件详解

### Auth（`middleware/auth.go`）
```go
middleware.Auth(tokens, userStatusOK)
```
- 解析 `Authorization: Bearer <token>`
- 校验 JWT 有效性 + 类型必须是 `access`
- `userStatusOK` 回调**实时查库**校验用户未被封禁/删除（避免封禁后旧 token 仍可用），签名 `func(id uint) (username string, ok bool)`；返回的用户名写入 context 供操作日志使用
- 通过后 `c.Set(ContextUserKey, CurrentUser{ID, Role, Username})`
- 用 `middleware.GetCurrentUser(c)` 取值
- JWT claims 内置 `uname`（用户名）声明（Beta1.12 起），`GeneratePair` 签名 `(userID, username, role)`；**改动签发点必须同步三个参数**（Register/Login/Refresh）

### OptionalAuth
同 Auth，但无 token 或 token 无效时不拦截，仅匿名放行。用于文章列表等「登录后可见更多」的接口。

### RequireRole
```go
middleware.RequireRole(model.RoleAdmin)
```
检查角色，非管理员返回 403。

### Security（`middleware/security.go`）
- `SecurityHeaders()` — 全局安全响应头（X-Frame-Options 等）
- `SlidingLimiter` — 内存滑动窗口限流器
  - `Allow(key, limit, window)` — 是否允许
  - `Reset(key)` — 重置（登录成功后调用，避免误伤）
- `IPRateLimit(cfg)` — 按 IP 限流中间件，429 响应
- `ClientIP(c)` — 解析真实 IP（优先 X-Forwarded-For）

### TrafficStats（`middleware/stats.go`）
异步记录每请求流量到 `StatService`，不阻塞请求。

### CORS（`middleware/cors.go`）
白名单来自 `FRONTEND_URL`。

---

## 核心 Service 说明

### AuthService
| 方法 | 说明 |
|---|---|
| `Register(RegisterInput)` | 注册。检查注册开关；**首个用户自动成为 admin** |
| `Login(identifier, password)` | 登录。**identifier 支持邮箱或用户名**（`FindByLogin`）；封禁用户拒绝 |
| `Refresh(token)` | 刷新令牌，同时校验封禁状态 |
| `ChangePassword(userID, current, new)` | 验证当前密码 → bcrypt 哈希新密码 |
| `UpdateUsername(userID, name)` | 改用户名（唯一性校验） |

### ArticleService
| 方法 | 说明 |
|---|---|
| `Create(authorID, ArticleInput)` | 创建。`resolveCover()` 处理封面（空则取正文首图） |
| `Update(id, authorID, ArticleUpdate)` | 更新，校验作者身份 |
| `List(ArticleQuery)` | 列表，支持分类/标签/搜索/排序筛选 |
| `IncrementViews(id)` | 浏览量 +1 |

**封面逻辑**（`resolveCover`）：
```go
func resolveCover(explicit, content string) string {
    if cover := strings.TrimSpace(explicit); cover != "" {
        return cover  // 显式设置优先
    }
    return firstImageURL(content)  // 否则提取正文首个 <img src="...">
}
```

### CaptchaService（重要）
4 种提供方：`none` / `turnstile` / `geetest` / `builtin`

```go
Required(action)   // "register"|"login"|"comment"|"article" 是否需要验证
Verify(action, token, answer, remoteIP) error
NewChallenge()     // 生成算式挑战（builtin/降级用）
```

**容错设计（很重要，勿破坏）**：
1. 未配置密钥 → `return nil`（放行）
2. 客户端未加载组件（空 token）→ `return nil`（放行）
3. 第三方服务不可达 → `return nil`（放行）
4. 只有「答错/伪造」才拒绝

环境变量 `INKSTONE_DISABLE_CAPTCHA=1` 可全局紧急停用验证码。

**极验 token 格式**：前端把 4 个字段 JSON 序列化后作为 `captcha_token` 提交：
```json
{"lot_number":"...","captcha_output":"...","pass_token":"...","gen_time":"..."}
```
后端用 `captcha_key` 算 `sign_token = HMAC-SHA256(lot_number, key)` 后调 `https://gcaptcha4.geetest.com/validate`。

**内置算式**：`HMAC-SHA256` 签名的 token（`<base64payload>.<sig>`），5 分钟过期。

### SettingsService
键值设置系统，**30 秒内存缓存**。

```go
All()                          // 全部（含默认值）
Get(key)                       // 单值
IntValue(key, fallback)        // 整数读取
BoolValue(key, fallback)       // 布尔读取
Update(map[string]any)         // 更新，自动失效缓存
Public()                       // 公开配置（排除 maskKeys）
AdminView()                    // 管理视图（maskKeys 转为 xxx_set）
```

**关键机制**：
- `maskKeys` 中的字段（SMTP 密码、验证码密钥）API 只返回 `xxx_set` 布尔值
- **Update 时空值 = 保持原值**（防误删密钥）
- `jsonSettingKeys` 中的字段（nav_menu、sidebar_widgets）自动 JSON 编解码

### StatService
- `Record(bytesIn, bytesOut, clientIP)` — 异步队列记录流量（IP 存 SHA256 哈希，不存原始地址）
- `Trend(days)` — 返回 N 天趋势，**自动补零日期**
- `SystemResources()` — 系统资源（跨平台：`stat_linux.go` 读 /proc，`stat_windows.go` 用 PowerShell CIM）

### LogService（`service/log_service.go`，Beta1.12 增强）
```go
Record(Entry)   // 异步入队（1024 缓冲，满丢弃；Detail 截 500、UserAgent 截 250）
List(OperationLogQuery)   // 分页查询：category/username/keyword/from/to/success
Export(OperationLogQuery) // 全量导出（不分页，上限 5 万条）
Overview() (LogOverview)  // total/today/failed/by_category 总览
Stats()                   // 各分类计数（旧接口）
```
异步 worker 落库，`cleanupLoop` 每 24h 清理 90 天前日志。

**日志记录点**（Beta1.12 起全覆盖，handler 层统一走 `recordOp(logs, c, category, action, detail, success)`，自动带当前用户/IP/UA）：
- auth：注册成功、登录成功/失败、改密码、改资料、refresh 失败
- article：文章创建/更新/删除（更新日志含**变更字段明细**，如「变更：标题、内容」）
- user：创建/改资料/封禁/解禁/改角色/删除用户
- comment：用户删自己评论、管理员删评论
- setting：更新设置（**只记 key 名列表，绝不记录值**——设置含 SMTP 密码等密钥）、测试邮件
- file / link / page / taxonomy / system：增删改详情含标题/名称，更新前先查实体名
- Detail 长度防护：`Record` 按字符截断到 500（列宽上限），防长标题导致入库失败

### LinkService
- `StartAutoCheck()` — 启动后台协程，每 6 小时检测「超过 24 小时未检测」的友链
- `probeURL()` — HEAD 优先 → GET 回退，`status < 500` 视为可达
- `MaskURL()` — 失效链接脱敏（`https://exa****.com`）

### FileService
- `Save()` — 流式保存 + 上传限速（`CopyWithLimit`）
- `CopyWithLimit(dst, src, kbPerSec)` — 分块 + 时间片节流
- 上传大小限制由 `upload_max_mb` 设置控制

### EmailCodeService
- 内存存储（单实例），6 位数字，10 分钟过期，5 次错误锁定
- 邮件发送通过 `MailSender` 接口注入（**避免 service → mailer 循环依赖**）

### UpdateAgent（`service/update_agent.go`，更新推送后台实例端）
博客实例侧自动更新编排，`main.go` 中 `NewUpdateAgent(settingsSvc, cfg.FrontendURL).Start()` 启动。

```go
Config()                    // 推送配置视图（token 只回传 token_set；含 mirror_urls）
SaveConfig(UpdateConfigInput) // 保存（token 空 = 保持原值，走 maskKeys 机制）
CheckOnce() (*UpdateTask, error) // 立即轮询一次（不执行）
ApplyNow() error            // 轮询 + 执行；无可用更新返回 ValidationError
Status() UpdateStatus       // phase/running/logs/task（每 2s 可轮询）
VerifyPendingUpdate()       // 启动时自检上次更新（Start 内延迟 5s 调用）
```

**更新执行序列**（`runUpdateSteps`，每步输出实时进内存日志；Beta1.10 起重构为 5 步）：
1. `syncRepo`：有 `.git` → `git fetch --depth 1 <源> <branch>`，源按 `[origin, mirror_urls...]` **依次回退**（origin 常是容器内路径 `file:///opt/repo.git`，宿主机场景自动切到备用源）；`git reset --hard FETCH_HEAD`（**不动未跟踪文件**，`.env` 安全）。无 `.git` → 首次 `git clone`
2. 校验 tar 存在 + sha256（日志输出摘要与大小）
3. 本进程执行 `docker load -i tar`，比对 `docker images --no-trunc` **前后镜像 ID**：backend/frontend 均无变化 → 该 commit 已部署过则幂等跳过，否则报错终止（防「假更新」：旧 tar 也 load 成功）
4. 打 `rollback-日期时间` 回滚 tag（backend/frontend 各一个）+ 落盘 `<dataDir>/update-verify.json`（期望版本、回滚 tag、目录、编排）+ 记录已部署 commit（`deployed-commit.json`）
5. sibling 容器（`inkstone-updater`）执行 `docker compose up -d`（第 5 步会重建 backend 自身，必须在独立容器）

**自动更新触发**（`tick`，每 15s 一次）：
- 推送后台模式：`poll()` 拿到任务 且 `update_auto=true` → **直接 execute，站长无需点击任何按钮**（`update_auto=false` 时仅在页面提醒、手动「立即更新」）
- 自治模式（`update_direct`，默认 false）：`git ls-remote` 探测镜像仓库最新 commit，与 `deployed-commit.json` 不同 → 直接 execute（绕过推送后台）
- 成功后写 deployed commit；同一 commit 的重复任务幂等跳过（覆盖「更新成功→新版本上报」窗口期的补跑）

**更新后自检与自动回滚**（`VerifyPendingUpdate`，服务启动时跑）：
- 读 `update-verify.json`：无 → 跳过
- agent 模式：`AppVersion == pending.Version` → 清除状态文件，`report("success")`；不一致（打包漏改版本号的典型症状）→ `docker tag` 两个 rollback tag 回 latest → sibling 执行 `compose up -d` 回滚 → `report("failed")`
- direct 模式（`pending.IsDirect()`）：新进程能启动即视为生效，清除并上报
- 注意：若新镜像**根本起不来**（无进程跑自检），只能宿主机手动回滚——见 deployment.md 排障表

**关键设计**：
- `docker load` 放在本进程（不杀自身、可比对 ID）；只有 `compose up -d` 走 sibling 容器
- 版本号入 tag/命令前过 `versionPattern`（`^[A-Za-z0-9][A-Za-z0-9._-]*$`）防注入
- 轮询协程每 15s 一次（`updatePollInterval`），未配置 `server_url`/`token` 时静默跳过
- 命令执行统一 30 分钟超时强杀；版本比较由推送后台负责（Beta1.0 数字段解析：Beta1.0 → [1,0]）

**推送后台（D:\Update）**：独立 Go+Gin 单二进制服务（go:embed 内嵌管理页面），默认端口 9090，
`DATA_DIR`（默认 ./data）下 `store.json` 存版本/实例/管理密码。其客户端 API 契约：
`POST /api/client/poll`（心跳+取任务）、`POST /api/client/report`（进度上报），Bearer token 认证。

---

## 已知设计取舍

| 取舍 | 原因 |
|---|---|
| 验证码用内存存储 | 单实例部署够用；多实例需换 Redis |
| 流量统计用内存队列 | 避免阻塞请求；队列满时丢弃 |
| IP 存哈希不存原值 | 隐私合规 |
| 设置缓存 30 秒 | 减少 DB 查询；写操作立即失效缓存 |
| 限流计数器内存化 | 无 Redis 依赖；重启清空（可接受） |

---

## 常见修改场景

### 新增一个设置项
1. `settings_service.go` 加常量 + `settingDefaults` 默认值
2. 敏感字段加进 `maskKeys`
3. 需要 JSON 的加进 `jsonSettingKeys`
4. `Public()` 里自动下发（除非在 maskKeys）
5. **前端 `site-config-context.tsx` 手动解构**（嵌套对象要单独处理）
6. **前端设置页 payload 白名单手动加字段**

### 新增一个 API
见 `SKILL.md` 的「新增接口的标准流程」。

### 调试数据库
```bash
docker exec blog-postgres psql -U blog -d blog_platform -c "SELECT * FROM settings LIMIT 10;"
```
