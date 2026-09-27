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

### UpdateService（Beta1.15，系统更新核心）

`internal/service/update_service.go` + `update_agent.go` + `docker_engine.go`。

```
StartScheduler()            启动每 30s tick 的调度循环（立即查一次，之后按 setting 间隔）
                            发现新版本且 auto_update 开启 → 自动执行更新
RecoverInterruptedUpdate()  启动 30s 后自检：上次更新中断（残留 running）→ 自动回滚
State()                     更新后台首页状态（docker/settings/remote/task/history/rollback）
CheckNow()                  立即检查（绕过 5 分钟缓存）
StartUpdate(triggeredBy)    异步启动更新（auto/manual）
StartRollback()             异步启动回滚
ApplySettings(payload)      保存更新设置（委托 SettingsService）
RunUpdateAgent()            子命令入口（`server update-agent`，由 agent 容器执行）
```

**docker_engine.go**：零依赖 Docker Engine API 客户端（`net/http` + unix socket，API v1.43）：
ping / images load / images json（ID 查询）/ tag / containers json（compose label 定位）/ inspect /
create（原始 body 与 inspect 复用两种）/ start / stop / remove。**没有引入 docker SDK**。

**请求头坑（Beta1.24 修复）**：Docker 新版 daemon 对带 body 的请求强制要求 `Content-Type: application/json`，
缺失报 `malformed Content-Type header (): mime: no media type`（HTTP 400）。`doJSON` 在 body 非空时统一补该头；
`docker load` 走 `doWithHeaders` 显式设 `application/x-tar`；无 body 的 POST（stop/start/tag）daemon 不校验。

**更新主流程**（`performUpdate`）：
1. 并发探测版本清单源（raw.githubusercontent.com 直连 + jsDelivr + 各加速源），第一个成功即用，缓存 5 分钟
2. 下载镜像包：加速源 HEAD 测速排序 → 顺序尝试 → 失败自动切换；流式下载同时算 SHA256 并回调进度
3. SHA256 校验（清单未提供则跳过）
4. `docker load` → **镜像 ID 比对**（与「当前运行容器」的镜像一致 = 假更新，报错终止；
   比的是运行容器而非宿主机 `latest`——上次失败的更新可能已把 latest 残留成新镜像）
5. 按「当前运行镜像」ID 打 `rollback-<recordID>` tag（回滚要回到正在跑的版本）
6. `spawnAgent`：用**当前 backend 镜像**创建一次性 agent 容器（`/app/server update-agent`，
   AutoRemove、只挂 docker.sock、不绑端口、继承 compose 网络与 DB 环境变量）
7. 记录 `deploying` → `docker stop` 自身（30s）——此后 backend 进程死亡，由 agent 收尾

**latest 残留防护（Beta1.21 事故后修复）**：`docker load` 会无条件把宿主机 `latest` 改写为新镜像。
load 之后、agent 接管之前的任何同步失败（打 tag 失败/spawnAgent 失败）或进程中断，
都会留下「latest=新镜像、运行容器=旧版本」的残留，导致重试更新被防呆误判「假更新」而永久卡死。防护：
- load 前把宿主机 latest 镜像 ID 快照写入 `UpdateRecord.OldImages`（JSON: repo→ID）
- performUpdate 的所有 load 后失败路径先调 `restoreLatestFromRecord(rec)` 还原 latest 再记失败
- `recoverInterrupted` 对「未打 rollback tag 就中断」的记录同样先还原再记失败
- 回滚素材改用**运行容器**镜像 ID（原来用宿主机 latest，残留场景会回滚错版本）

**agent 流程**（daemon 托管，backend 停掉后仍存活）：
1. sleep 5s → 先 recreate frontend → 再 rm 旧 backend + create 新 backend + start
2. 健康检查：`http://<容器名>:8080/healthz` 轮询 150s + `/api/v1/system/info` 版本核对
3. 任一失败 → `agentRollbackFrom`：rollback tag → latest → 重建两个容器 → 再健康检查
4. 写终态记录后退出（AutoRemove 自动清理）

**并发保护**：`FindRunning()` 查库判重；调度器与手动触发共用；更新期间禁回滚。

**单测**（`internal/service/update_test.go`，23 个用例）：`compareVersion`（Beta1.14>Beta1.9 等字符串比较陷阱）、`versionNumbers`、`joinMirror`（**必须保留目标 URL 的 https://，ghproxy 系解析依赖**）、`manifestToRemote`、`fetchManifestURL`（合法/缺字段/非 JSON）、`rankSources`（httptest 快/慢/503 排序）、`probeLatency`、`progressWriter` 节流、清单 JSON 往返、`DockerClient` 不可用路径、`validateUpdateSettings`（repo 路径注入/间隔越界/非 http 加速源）、`tryBeginUpdate` 互斥、`validateUpdateSettings`、`TestDownloadFileResume`（续传 SHA256 拼接对拍 + 无 Range 服务器从头重下）、`TestUpdateSettingDefaults`（默认值完整性）、`formatBytes`、`sortMirrorLatency`。改更新链路先跑 `go test ./internal/service/`。

**健壮性要点（Beta1.15 审查后补充）**：
- 清单探测有 **20s 总时限**（多源并行，不会无限等）；镜像源下载失败自动切换下一个
- `ApplySettings` 入库前校验 repo 格式（`owner/repo`，防 URL 注入）、间隔 1-1440、加速源必须 http(s)
- `main.go` 优雅停机（SIGTERM → `srv.Shutdown` 30s），保证更新停容器期间在途请求落库
- `docker load` 显式 `Content-Type: application/x-tar`；Docker 响应读取上限 32MB
- agent 回滚支持「容器已删除」场景：用 rm 前暂存的 inspect 快照重建 backend，杜绝站点消失

**可用性要点（Beta1.16 审查后补充）**：
- **周期中断自检**：调度器每 5 分钟调 `recoverInterrupted()`（不再仅启动时）——agent 崩溃/残留 running 记录会被清理或自动回滚，否则记录卡 running 会永久挡住手动更新
- **快速失败回滚**：`waitHealthy` 轮询中检测容器已退出（crash-loop）立即返回失败，不等满 150s 超时
- **磁盘预检**：下载前 `diskFreeBytes`（Linux Statfs，`update_disk_linux.go`；Windows 构建 tag 跳过）要求 镜像包大小 + 512MB 余量，不足直接报错
- 记录查询统一 `latestOne`（`Limit(1).Find`）：无记录不打 GORM not-found 日志

**安全要点（Beta1.18 审查后补充）**：
- 更新链路强制 https：加速源设置仅接受 `https://`；manifest/asset URL 均过 `requireHTTPSURL`
- **强制 SHA256**：清单未提供校验值直接拒绝下载（防镜像包被中间人替换）
- **镜像白名单**：`allowedImageRepos` 仅 `inkstone-backend/inkstone-frontend` + tag 必须 latest + service 必须已知，防恶意清单把任意镜像写进 tag/部署；agent 部署前二次校验（纵深防御）
- 更新/回滚接口独立限流 **5 次/分钟**、check/测速 10 次/分钟（apiLimiter，`Message=update/update-probe`）
- agent 容器最小权限：`Privileged=false`、`CapAdd=nil`、`CapDrop=ALL`、`no-new-privileges`、只挂 docker.sock(ro)、不绑端口、禁重启
- compose backend 同样 `cap_drop: ALL` + `no-new-privileges`（Go 静态服务无需任何 capability）
- `SecurityHeaders` 含 HSTS（max-age 1 年 + includeSubDomains）；JWT_SECRET<32 启动 Warn
- 更新清单来自 GitHub（可信源）+ TLS + 白名单 + SHA256 四层校验，任何一层不过即中止

**性能要点（Beta1.15 审查后补充）**：
- 下载/`docker load` 均用 **512KB buffer**（默认 32KB syscall 过多）；下载带 `ResponseHeaderTimeout=60s` 防挂死
- **断点续传**：下载失败换源时带 `Range: bytes=N-` 续拉，旧内容先喂 SHA256 再追加（500MB 包慢网重下不从头）；服务端不支持 Range 自动从头
- 清单/测速请求共享 `updateProbeClient`（连接池复用）+ `context` 取消（首源成功后其余请求立即中断，无 goroutine 泄漏）
- `State()` 用**单次** `List(20)` 查询推导 task/rollback/history（轮询 30s 一次，避免 3 次 DB 往返）；`DockerEnvInfo` 10s 缓存
- 测速用 `Range: bytes=0-2047` 只取 2KB，不为探测拉全量

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

### SitemapHandler（`handler/sitemap_handler.go`）
- `collectEntries()` — **单一数据源**：首页/友链/文章(已发布)/独立页(已发布)/分类(有文章)/标签(有文章)，
  返回带 `type/label/loc/lastmod/changefreq/priority` 的条目列表
- `Sitemap`（`GET /sitemap.xml`，公开）与 `SiteMapData`（`GET /api/v1/admin/sitemap`，管理员）共用它
- `robotsBody()` — robots.txt 内容（放行 crawling、屏蔽 /admin 与 /me、指向 sitemap）
- 后台「站点地图」页只读展示，无写操作；内容随文章/页面发布动态变化，无需手动重建

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
## 下载慢的治理（Beta1.20）

实例端下载 109MB 镜像包慢的根因与对策：

1. **GitHub 直连被 QoS 限速**（实测服务器出口下载仅 ~3KB/s）
2. **选源逻辑曾经按 RTT 排序**：直连 RTT ~300ms 排第一，但它带宽 KB/s；加速源 RTT 略高但带宽 MB/s → 持续选中慢源
3. **修复**：`rankSourcesBySpeed` 每个源 GET Range 取 4MB 实测带宽，按速度降序选源
4. **断流卡死修复**：`idleTimeoutReader` 2 分钟无数据即失败换源（原来 body 传输无超时会永久挂起）
5. **自检误杀修复**：本进程任务由 `updating` 标志豁免；跨进程残留窗口 10 分钟
6. 加速源均不可达时（如当前资产 404），更新会快速失败并在「更新历史」展示真实原因，不再假死

**若仍慢**：更新设置里只留实测最快的 1-2 个加速源（设置页「测试延迟」有下载延迟参考）；或将清单 asset.url 指向自有服务器（走 update_mirror_urls 同级机制）。
