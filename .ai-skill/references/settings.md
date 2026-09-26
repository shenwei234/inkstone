# 设置系统（站点配置）

所有站点级配置存在 `settings` 表（键值对），带 **30 秒内存缓存**。

定义在 `internal/service/settings_service.go`。

---

## 全部设置项

### 站点信息
| Key | 默认值 | 说明 |
|---|---|---|
| `site_name` | `InkStone` | 站点名称（导航栏/页脚/浏览器标题） |
| `site_description` | `InkStone — 现代化多用户博客系统` | 站点描述 |
| `site_logo` | `""` | Logo 图片 URL（空则显示首字母） |
| `site_favicon` | `""` | 浏览器图标 URL |
| `site_icp` | `""` | ICP 备案号（页脚显示） |

### 注册与外观
| Key | 默认值 | 说明 |
|---|---|---|
| `allow_registration` | `true` | 是否开放注册 |
| `site_wallpaper` | `""` | 全站壁纸 URL |
| `wallpaper_opacity` | `100` | 壁纸不透明度（5-100） |
| `wallpaper_blur` | `0` | 壁纸模糊 px（0-20） |
| `article_sidebar` | `true` | 文章页是否显示侧边栏 |
| `sidebar_position` | `right` | 侧边栏位置 `right` / `left` |

### 导航与侧边栏（JSON）
| Key | 默认值 | 结构 |
|---|---|---|
| `nav_menu` | `[]` | `[{label, url, icon?}]` |
| `sidebar_widgets` | `[]` | `[{type, title, content?, limit?, city?, avatar?, date?, eventName?}]` |

### SMTP 邮件
| Key | 默认值 | 敏感 |
|---|---|---|
| `smtp_host` | `""` | |
| `smtp_port` | `465` | |
| `smtp_user` | `""` | |
| `smtp_pass` | `""` | ✅ 脱敏 |
| `smtp_from` | `""` | 发件人显示名 |

### 人机验证
| Key | 默认值 | 说明 |
|---|---|---|
| `captcha_provider` | `none` | `none` / `turnstile` / `geetest` / `builtin` |
| `captcha_site_key` | `""` | Turnstile Site Key（公开） |
| `captcha_secret_key` | `""` | Turnstile Secret（✅ 脱敏） |
| `geetest_captcha_id` | `""` | 极验 Captcha ID（公开） |
| `geetest_captcha_key` | `""` | 极验 Captcha Key（✅ 脱敏） |
| `captcha_on_register` | `true` | 注册开启验证 |
| `captcha_on_login` | `false` | 登录开启验证 |
| `captcha_on_comment` | `true` | 评论开启验证 |
| `captcha_on_article` | `true` | 发布文章开启验证 |

### 邮箱验证码
| Key | 默认值 | 说明 |
|---|---|---|
| `email_code_on_register` | `false` | 注册需邮箱验证码 |
| `email_code_on_login` | `false` | 登录需邮箱验证码 |
| `email_code_ttl_minutes` | `10` | 验证码有效期（分钟） |

### 安全防护
| Key | 默认值 | 说明 |
|---|---|---|
| `security_enabled` | `true` | 限流总开关 |
| `security_login_max` | `30` | 登录上限（次/15 分钟/IP） |
| `security_register_max` | `20` | 注册上限（次/小时/IP） |
| `security_comment_max` | `30` | 评论/发文上限（次/10 分钟/IP） |
| `security_api_max` | `600` | API 上限（次/分钟/IP） |
| `security_block_minutes` | `15` | 封禁时长（保留参数） |

### 文件管理
| Key | 默认值 | 说明 |
|---|---|---|
| `upload_max_mb` | `50` | 最大上传大小（MB） |
| `upload_speed_kb` | `0` | 上传限速 KB/s（0=不限） |
| `download_speed_kb` | `0` | 下载限速 KB/s（0=不限） |

### 系统更新（推送后台联动）
| Key | 默认值 | 说明 |
|---|---|---|
| `update_server_url` | `""` | 更新推送后台地址（D:\Update 部署的服务） |
| `update_token` | `""` | 推送后台颁发的客户端访问令牌（**敏感字段**） |
| `update_auto` | `true` | 收到新版本后是否自动执行更新 |
| `update_repo_dir` | `/opt/inkstone-images` | 镜像包 git 仓库在服务器上的检出目录 |
| `update_compose_file` | `docker-compose.offline.yml` | 仓库内的 docker compose 编排文件名 |
| `update_mirror_urls` | `file:///srv/git/inkstone-images.git` | 备用镜像仓库地址（origin 拉取失败时回退，分号分隔）。检出目录 origin 常是容器内路径，宿主机不可用，故默认配宿主机裸仓库路径 |
| `update_direct` | `false` | 自治模式（高级）：绕过推送后台，实例直巡镜像仓库新 commit 自动部署。默认关闭，标准流程由推送后台触发 |
| `update_direct_branch` | `main` | 自治模式监听的 git 分支 |

---

## 三个关键机制

### 1. 敏感字段脱敏（`maskKeys`）

```go
var maskKeys = map[string]bool{
    SettingSMTPPass:          true,
    SettingCaptchaSecretKey:  true,
    SettingGeeTestCaptchaKey: true,
    SettingUpdateToken:       true,
}
```

**效果**：
- `AdminView()` 返回 `xxx_set: bool`（是否已配置），**不下发明文**
- `Public()`（`/site-config`）**完全排除**这些字段
- 前端用 `<SecretInput isSet={form.xxx_set}>` 展示

### 2. 空值保护（重要）

`Update()` 对 `maskKeys` 字段做特殊处理：

```go
if maskKeys[key] && strings.TrimSpace(value) == "" {
    continue  // 空值 = 保持原值，不覆盖
}
```

**目的**：用户在后台清空密钥输入框点保存时，不会误删已配置的密钥。

### 3. JSON 字段自动编解码（`jsonSettingKeys`）

```go
var jsonSettingKeys = map[string]bool{
    SettingNavMenu:        true,
    SettingSidebarWidgets: true,
}
```

存储时序列化为字符串，`Public()`/`AdminView()` 时自动 `json.Unmarshal` 为数组。

---

## Service API

```go
All()                          // map[string]string，含默认值
Get(key) (string, error)
IntValue(key, fallback) int    // 数字读取
BoolValue(key, fallback) bool  // 布尔读取（"true"/"false"）
AllowRegistration() bool
Update(map[string]any) error   // 更新 + 失效缓存
Public() (map[string]any, error)     // 前端配置（排除 maskKeys）
AdminView() (map[string]any, error)  // 管理视图（maskKeys → xxx_set）
```

**缓存**：`All()` 结果缓存 30 秒；`Update()` 立即失效缓存（`cacheTime = time.Time{}`）。

---

## 新增设置项的完整流程

**1. 后端定义**（`settings_service.go`）
```go
// ① 加常量
const SettingFooBar = "foo_bar"

// ② 加默认值
var settingDefaults = map[string]string{
    SettingFooBar: "default-value",
}

// ③ 敏感字段加进 maskKeys（可选）
// ④ JSON 字段加进 jsonSettingKeys（可选）
```

**2. 公开下发**（`Public()`）
- 非 maskKeys 字段**自动**包含，无需改动
- 如需特殊处理（如布尔转换），在循环里加 `if k == SettingFooBar { ... }`

**3. 前端解构**（`site-config-context.tsx`）**必须手动加**
```tsx
interface RawSiteConfig {
    foo_bar?: string  // 加字段
}
// payload 构造里：
fooBar: cfg.foo_bar ?? 'default-value',
```

**4. 管理页保存**（`admin/settings/page.tsx`）**必须手动加进 payload 白名单**
```tsx
const payload: Record<string, unknown> = {
    // ...
    foo_bar: extra.foo_bar ?? 'default-value',  // 不加这行保存无效！
}
```

**5.（可选）安全防护页**
如果属于安全类设置，加到 `app/admin/security/page.tsx` 的 `SecurityForm` 接口和保存逻辑。

---

## 常见调试

```bash
# 查看当前设置
docker exec blog-postgres psql -U blog -d blog_platform -t -c \
  "SELECT key, LEFT(value, 40) FROM settings ORDER BY key;"

# 手动改设置（立即生效，需等缓存 30 秒或重启）
docker exec blog-postgres psql -U blog -d blog_platform -c \
  "UPDATE settings SET value='false' WHERE key='allow_registration';"

# 通过 API 查看（公开配置）
curl http://localhost:8080/api/v1/site-config

# 通过 API 查看（管理视图，需 token）
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/admin/settings
```

## 环境变量应急开关

| 变量 | 作用 |
|---|---|
| `INKSTONE_DISABLE_CAPTCHA=1` | 全局停用所有验证码（应急，防锁死） |
