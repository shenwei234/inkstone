# 前端架构详解

Next.js（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + React Query + Framer Motion + TipTap。

## 目录结构

```
app/                          # 路由（App Router）
├── layout.tsx                # 根布局：Providers + Navbar + 壁纸 + Footer
├── page.tsx                  # 首页（文章列表 + 侧边栏小工具）
├── login/page.tsx            # 登录
├── register/page.tsx         # 注册
├── me/page.tsx               # 用户中心（账户/我的文章/我的评论）
├── links/page.tsx            # 友情链接页
├── posts/[slug]/page.tsx     # 文章详情
├── p/[slug]/page.tsx         # 独立页面（3 种模板）
└── admin/                    # 管理后台（独立布局）
    ├── layout.tsx            # 侧边栏 + 权限守卫
    ├── page.tsx              # 概览（统计卡 + 资源监控 + 趋势图）
    ├── users/                # 用户管理
    ├── articles/             # 文章管理 + 编辑器
    ├── tags/                 # 标签管理
    ├── pages/                # 页面管理
    ├── comments/             # 评论管理
    ├── files/                # 文件管理
    ├── links/                # 友情链接
    ├── appearance/           # 外观（菜单/小工具/侧边栏位置）
    ├── security/             # 安全防护（验证码/限流/邮箱验证）
    ├── settings/             # 网站管理（站点信息/壁纸/SMTP）
    ├── updates/              # 系统更新（推送后台连接/检查/立即更新/日志/变更日志）
    ├── logs/                 # 网站日志（统计卡片/多维筛选/详情展开/CSV 导出）
    └── about/                # 关于系统

components/                   # 组件
lib/                          # 工具与状态
```

---

## 全局状态（Context）

### 1. SiteConfigProvider（`components/site-config-context.tsx`）
站点配置全局上下文，**应用启动时拉取一次 `/site-config`**。

```tsx
const site = useSiteConfig()
// site.siteName, site.siteLogo, site.navMenu, site.widgets
// site.sidebarPosition, site.wallpaper, site.captcha, site.emailCode
```

**⚠️ 新增 site-config 字段必须在这里手动解构**：
```tsx
captcha: {
  provider: (cfg.captcha?.provider ?? 'none') as CaptchaConfig['provider'],
  site_key: cfg.captcha?.site_key ?? '',
  geetest_captcha_id: cfg.captcha?.geetest_captcha_id ?? '',  // ← 曾漏过导致极验失效
  ...
}
```

### 2. AuthProvider（`lib/auth-context.tsx`）
```tsx
const { user, loading, login, register, logout } = useAuth()
// login/register 返回 Promise<User>，可用于判断角色跳转
```

### 3. NotifyProvider（`components/toast.tsx`）
```tsx
const notify = useNotify()
notify.success('操作成功')
notify.error('失败了')
const ok = await notify.confirm({ title: '确定删除？', danger: true })
```
**禁止使用 `alert` / `confirm` / `window.prompt`**，全部走 `useNotify`。

---

## 数据获取（React Query）

```tsx
const { data, isLoading } = useQuery({
  queryKey: ['articles', 'published', page, category, tag, q],  // 依赖项都要进 key
  queryFn: () => fetchArticles({ page, page_size: 10, category, tag, q }),
})

const mutation = useMutation({
  mutationFn: (id: number) => deleteArticle(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['articles'] })  // 失效缓存触发重取
    notify.success('已删除')
  },
  onError: (e) => notify.error(e instanceof ApiError ? e.message : '操作失败'),
})
```

**queryKey 约定**（保持前缀一致便于批量失效）：
| 前缀 | 数据 |
|---|---|
| `['articles', ...]` | 文章列表 |
| `['article', id]` / `['article', 'slug', slug]` | 文章详情 |
| `['admin', ...]` | 所有管理端数据 |
| `['site-config']` | 站点配置 |
| `['categories']` / `['tags']` | 分类与标签 |
| `['reactions', id]` / `['comments', id]` | 互动数据 |
| `['me', ...]` | 用户中心数据 |

---

## API 客户端（`lib/api.ts`）

**所有 HTTP 请求必须经过这里**，不要直接 `fetch`（除了文件上传用 XHR 带进度）。

```ts
// 通用请求封装，自动处理 token、401 刷新、错误抛出
api<T>(path, { method, body, auth })
```

**关键机制**：
- `auth: true` 时自动带 `Authorization` 头
- 收到 401 会**自动尝试 refresh token**，成功后重放请求
- 失败抛出 `ApiError(status, message)`，message 是后端中文错误

**新增 API 的标准写法**：
```ts
export function fetchFoo(params: { page?: number } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  const qs = search.toString()
  return api<{ foos: Foo[] }>(`/foos${qs ? `?${qs}` : ''}`, { auth: true })
}
```

**文件上传**（需要进度时用 XHR）：
```ts
export function uploadFile(file: File, onProgress?: (p: number) => void)
export function uploadImage(file: File): Promise<string>  // 返回 url
export function downloadFile(id: number, filename: string)  // 鉴权下载
```

---

## 核心组件

### 富文本编辑器（`components/rich-editor.tsx`）
基于 TipTap 的 **Gutenberg 风格区块编辑器**。

功能：
- 工具栏：正文/H2/H3、加粗、斜体、链接、列表、引用
- `/` 斜杠命令插入区块（SlashCommandExtension）
- 空行左侧 `+` 按钮插块
- 浮动区块工具栏（跟随当前块）
- 内置弹窗（链接/图片 URL 输入，替代 `window.prompt`）

```tsx
<RichEditor content={html} onChange={setHtml} variant="plain" />
```
> `content` 和存储的都是 **HTML**（不是 Markdown）。`variant="plain"` 用于无边框的写作区。

### Markdown 编辑器（`components/markdown-editor.tsx`）
文章正文编辑器（textarea 自研方案，保存时转 HTML）。

```tsx
<MarkdownEditor value={markdown} onChange={setMarkdown} onSaveRequest={() => doPublish()} />
```

功能清单：
- **工具栏**：加粗/斜体/删除线、H1-H3、有序/无序/任务列表、表格（3x3 模板）、引用、行内代码/代码块、链接、图片、分割线
- **快捷键**：`Ctrl/Cmd+B/I/K/U`、`Ctrl+Shift+X` 删除线、`Ctrl+F` 查找替换、`Ctrl+S` 保存（回调 `onSaveRequest`，阻止浏览器保存网页）
- **智能输入**：回车自动续写列表/任务列表（空项时结束列表）、`Tab`/`Shift+Tab` 缩进（多行整体）、行首 `#`/`>`/`-`/`1.` 按空格自动补全
- **图片**：工具栏上传、`Ctrl+V` 粘贴、拖入文件（`.md` 文件拖入插入文本内容）
- **预览增强**（DOM 后处理，仅影响显示，不入库）：
  - highlight.js 语法高亮（`highlight.js/lib/common` 按需语言；主题 CSS 在 `globals.css`，跟随系统深色）
  - 代码块 header：语言标签 + 一键复制按钮（`.md-codeblock`）
  - 任务列表复选框**可点击**，点击后反向改写 Markdown 源码（` [ ]` ↔ `[x]`）
- **目录大纲 TOC**：`extractToc()`（`lib/markdown.ts`）提取标题，侧栏可点击跳转，随编辑区滚动高亮当前标题
- **全屏专注模式**：`fixed inset-0`，`Esc` 退出，锁定 body 滚动
- **滚动同步**：编辑区 ↔ 预览区按滚动比例双向同步（工具栏开关）
- **查找替换**：面板支持区分大小写/正则、上一个/下一个、替换当前、全部替换
- **状态栏**：`Ln/Col`、选中字数、总行数、总字符数、标题数

> 预览后处理放在 `useEffect` 里直接操作 DOM（hljs 高亮、checkbox 增强），
> 因此保存与后端存储的 HTML 保持纯净（仍由后端 bluemonday 消毒）。

### 文章编辑器（`components/article-editor.tsx`）
完整写作页（标题 + 分类 + 标签 + 封面 + 正文 + 状态）。

- **自动保存**：草稿模式停手 2 秒自动保存（开关可记忆）
- **标签选择器**：点选已有标签 or 手输新建
- **封面设置**：上传/URL，留空自动取正文首图
- **发布**：`publish` mutation，触发人机验证；`Ctrl+S` 或编辑器保存按钮同样触发
- 内部用 Markdown 状态，保存/自动保存时经 `markdownToHtml()` 转 HTML

### 人机验证（`components/captcha.tsx`）
```tsx
<Captcha config={site.captcha} action="comment" onChange={setCaptchaResult} />
```
- `action`: `"register" | "login" | "comment" | "article"`
- 自动按 `site.captcha` 配置选择组件（Turnstile / 极验弹窗 / 算式）
- **加载失败自动降级为算式验证**（带提示）
- 回调 `onChange({ captcha_token, captcha_answer })`

### 侧边栏小工具（`components/sidebar-widgets.tsx`）
11 种小工具，通过 `type` 分发：

| type | 说明 | 配置项 |
|---|---|---|
| `about` | 关于本站 | content |
| `hot` | 热门文章（按浏览量） | limit |
| `tags` | 标签云 | limit |
| `search` | 搜索框 | — |
| `html` | 自定义 HTML | content |
| `profile` | 站长信息 | avatar, content |
| `weather` | 天气（Open-Meteo，无需 Key） | city |
| `countdown` | 节日倒计时 | date, eventName |
| `clock` | 实时时钟 | — |
| `stats` | 站点统计 | — |
| `hitokoto` | 一言 | — |

```tsx
<WidgetRenderer widget={w} />
```

**样式约定**：所有小工具统一 `rounded-xl border border-border bg-card p-5`（白底卡片）。

### 通知与确认（`components/toast.tsx`）
- Toast 堆叠在**右下角**（`bottom-10 right-6`），4 秒自动消失
- 确认弹窗支持 `danger` 红样式，Enter 确认 / Esc 取消

### 敏感输入（`components/secret-input.tsx`）
```tsx
<SecretInput value={pass} onChange={setPass} isSet={form.smtp_pass_set} />
```
- 右侧小眼睛切换明文/密文
- 已保存且未输入新值时显示 `••••••••••••`

### 动画工具（`components/motion.tsx`）
```tsx
<PageTransition>...</PageTransition>          // 页面淡入上移
<StaggerList className="grid gap-4">
  <StaggerItem>卡片</StaggerItem>              // 交错入场
</StaggerList>
<HoverLift>悬浮上浮</HoverLift>
easeOut  // 统一缓动曲线 [0.16, 1, 0.3, 1]
```
**⚠️ 性能**：长列表项**不要用** `layout` 属性（会导致卡顿），只用 `initial`/`animate`。

### 壁纸（`components/site-wallpaper.tsx`）
从 `site.wallpaper` 读取，固定背景层。有壁纸时 `body.has-wallpaper` 类生效，卡片变半透明（`globals.css`）。

### 菜单图标（`components/menu-icon.tsx`）
36 个 lucide 图标的注册表 + `IconPicker` 选择器。`MenuIcon({name})` 按名字渲染。
> **注意**：`Github` 等品牌图标已被新版 lucide 移除，用 `GitBranch` 替代。

---

## 页面说明

### 首页（`app/page.tsx`）
- 顶部 `max-w-7xl`，有侧边栏小工具时两栏布局
- 文章卡片：左封面（176×112）+ 右内容
- 搜索框在导航栏右侧（不在首页）
- 支持 `?category=`、`?tag=`、`?q=` 筛选

### 文章详情（`app/posts/[slug]/page.tsx`）
三层卡片结构：
1. **正文卡片**：分类 + 标题 + 元信息 + 标签 + 正文（`prose` 样式）
2. **互动卡片**：点赞 / 收藏 / 返回
3. **评论卡片**：输入框 + 评论列表

宽度：`max-w-4xl`（无侧栏）/ `max-w-7xl`（有侧栏，两列）

### 管理后台（`app/admin/`）
- `layout.tsx` 做**权限守卫**：未登录跳 `/login`，非管理员显示「需要管理员权限」
- 侧边栏 11 个入口，用 `layoutId="admin-nav-pill"` 做滑动高亮

#### 系统更新页（`app/admin/updates/page.tsx`）
连接「更新推送后台」的实例端界面：
- 主卡片：当前版本、推送后台在线状态（绿点）、「检查更新」/「立即更新」按钮（更新用 `notify.confirm` 二次确认）
- 待更新任务卡：展示新版本号、更新说明（多行）、镜像仓库地址/分支/镜像包/编排文件名
- 进度与日志：`GsapProgress` 不确定进度条 + 等宽字体日志框（running 时 2s 轮询并自动滚底）
- 推送服务配置（折叠）：`server_url`、`token`（已设置显示占位符，留空=保持原值）、`auto` 自动更新开关（开启=推送后台发版即自动更新）、`repo_dir`、`compose_file`、`mirror_urls`（备用镜像仓库地址，分号分隔）、`direct` + `direct_branch`（仓库自治模式，高级）
- 底部：changelog 列表（来自 `GET /admin/updates`）

#### 网站日志页（`app/admin/logs/page.tsx`，Beta1.12 增强）
- 统计卡片：日志总数 / 今日新增 / 失败操作 / 当前筛选数（数据来自 `GET /admin/logs/overview`）
- 筛选：分类 tab（带分类计数）+ 关键词搜索（操作/详情/IP，回车触发）+ 结果下拉（全部/仅成功/仅失败）+ 时间范围下拉（全部/今天/近 7 天/近 30 天 → `from=YYYY-MM-DD`）
- 列表：成功/失败图标、分类徽章、操作、详情（超 48 字折叠 + 「展开/收起」）、用户名#ID、IP、时间、UA（截断 + title 全文）
- 导出 CSV：`downloadLogs()` 用 `fetch + Bearer` 直接取 blob（**不能走 `api()` JSON 客户端**），401 时 `tryRefresh()` 刷新重试；通过 `a[download]` + `URL.createObjectURL` 触发浏览器下载
- 分页：每页 30 条

### 用户中心（`app/me/page.tsx`）
所有登录用户可用：账户安全（改用户名/密码）、我的文章、我的评论。

---

## 样式规范

### 统一的设计令牌（`app/globals.css`）
```css
--background, --foreground, --muted, --muted-foreground,
--border, --card, --accent
```
Tailwind 中直接用 `bg-card`、`text-muted-foreground`、`border-border`、`text-accent` 等。

### 常用样式组合
```
卡片：    rounded-xl border border-border bg-card p-5
按钮(主)：rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25
按钮(次)：rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/40 hover:text-accent
输入框：  lib/ui.ts 的 inputClass
骨架屏：  skeleton class（自定义 shimmer 动画）
```

### 深色模式
全部用 `dark:` 前缀，不需要额外配置（跟随系统）。

---

## 常见修改场景

### 新增一个页面
1. `app/新路径/page.tsx`
2. `'use client'`（需要交互时）
3. 用 `<PageTransition>` 包裹
4. 数据用 `useQuery` + `lib/api.ts` 的函数

### 新增一个管理页
1. `app/admin/新路径/page.tsx`
2. 在 `app/admin/layout.tsx` 的 `navItems` 数组加菜单项（含 lucide 图标）
3. 页内用 `useNotify()` 做反馈、`notify.confirm()` 做删除确认

### 修改站点配置字段
1. 后端 `settings_service.go` 加常量
2. `admin/settings/page.tsx` 的 **payload 白名单**手动加字段（关键！）
3. `site-config-context.tsx` 手动解构成字段
4. 使用处 `useSiteConfig()` 取值

### 调试站点配置
```ts
// 浏览器控制台
fetch('/api/v1/site-config').then(r => r.json()).then(console.log)
```
