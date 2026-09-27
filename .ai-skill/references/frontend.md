# 前端架构详解

Next.js（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + React Query + Framer Motion + TipTap。

## 目录结构

```
app/                          # 路由（App Router）
├── layout.tsx                # 根布局：Providers + Navbar + 壁纸 + Footer + SiteHead
├── page.tsx                  # 首页（文章列表 + 侧边栏小工具）
├── login/page.tsx            # 登录
├── register/page.tsx         # 注册
├── me/page.tsx               # 用户中心（账户/我的文章/我的评论）
├── links/page.tsx            # 友情链接页
├── posts/[slug]/page.tsx     # 文章详情（正文 + 目录 + 分享 + 回顶）
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
    ├── sitemap/              # 站点地图（URL 列表 + 统计 + robots 预览）
    ├── links/                # 友情链接
    ├── appearance/           # 外观（菜单/小工具/侧边栏位置）
    ├── security/             # 安全防护（验证码/限流/邮箱验证）
    ├── settings/             # 网站管理（站点信息/壁纸/SMTP）
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

> 浏览器标题与标签页图标（favicon）由 `components/site-head.tsx` 以 React 19 metadata hoist 渲染；原来在 context 里运行时改 DOM link 的方式在 React 19 下会被覆盖，导致后台改了 favicon 前台不生效。

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
<MarkdownEditor value={markdown} onChange={setMarkdown} onSaveRequest={() => saveDraft.mutate()} />
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
- **保存草稿**（Beta1.15 改语义）：`saveDraft` mutation（status: draft）；
  - 工具条「存草稿」按钮 + `Ctrl+S`（编辑器保存按钮）均触发它，**不再直接发布**（旧行为会把草稿直接发布，易惊吓）
  - new 模式：先落库为 draft，`router.replace` 跳转编辑页，之后由自动保存接管
- **本地草稿**（new 模式）：标题/正文等变更防抖 800ms 写入 `localStorage.blog_article_new_draft`；
  刷新/误关后进入新建页自动恢复并显示提示条（可一键丢弃）；成功创建/发布/删除草稿时清除
- **离开保护**：表单与「上次保存快照」（baseline state）比对，dirty 时刷新/关窗前弹浏览器确认；
  点「文章列表」返回时用 `notify.confirm` 拦截 Next 客户端路由
- 内部用 Markdown 状态，保存/自动保存时经 `markdownToHtml()` 转 HTML

> baseline 快照含 `{t, c, g, s, v}`（title/content/category/tags/cover），
> 任何保存动作（自动保存/存草稿/发布）成功后刷新，避免误报 dirty。

### 人机验证（`components/geetest-captcha.tsx`）
极验 GT4 hook（旧版 `components/captcha.tsx` 已被替换）：

```tsx
const captcha = useGeetestCaptcha('login') // 'login' | 'register' | 'comment'
{...}
{captcha.dialog}  // 常驻 DOM 的验证弹窗（display 切换显隐）
```

- 弹窗**必须 `createPortal` 到 `document.body`**：调用方页面（如友链申请表单）外层常是
  带 `transform` 动画的 `motion.div`，内联渲染 `fixed inset-0` 会被 transform 包含块困住，
  遮罩只覆盖表单卡片区域 → 「只有提交窗口模糊」。portal 用 `useSyncExternalStore`
  感知挂载（SSR 首帧 false，hydration 后 true），避免 hydration mismatch 与
  `react-hooks/set-state-in-effect` 规则
- 开关由 `site-config` 的 `geetest.on_login/on_register/on_comment` 按场景控制

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
2. **互动卡片**：点赞 / 收藏 / 分享（`ArticleShare`）/ 返回
3. **评论卡片**：输入框 + 评论列表

宽度：`max-w-4xl`（无侧栏）/ `max-w-7xl`（有侧栏，两列）

**文章目录（`components/article-toc.tsx`）**：`parseToc()` 在 `useMemo` 里对正文 HTML 做 DOMParser 提取 h1-h3
（`useIsMounted` gate：SSR 无 document 返回空，hydration 后出现），ArticleToc 组件负责补锚点 id + 滚动高亮 +
点击跳转。布局联动：**目录贴「没有侧边栏的一侧」**——无侧栏→右侧（`max-w-5xl` 两列）、侧栏在右→目录在左、
侧栏在左→目录在右（`max-w-7xl` 三列）；正文无标题则整列隐藏退回两列/单列。

**分享（`components/article-share.tsx`）**：移动端优先 `navigator.share` 原生面板，桌面端下拉菜单
（复制链接/微博/Twitter/邮件）；`useIsMounted` 不需要——`navigator.share` 运行时判定即可。

**回顶（`components/back-to-top.tsx`）**：滚动超过 480px 显示 `fixed bottom-6 right-6` 悬浮按钮，
`AnimatePresence` 出入场，点击平滑回顶。目前挂在文章页（组件通用，可按需全局挂载）。

### 站点 head（`components/site-head.tsx`）
在根布局渲染 `<title>` / `<link rel="icon">`（React 19 metadata hoist 到 head），
`site_favicon` 有值用自定义图标、为空回退 `/icon.svg`。
**不要再在 site-config-context 里用 querySelector/appendChild 改 favicon**——运行时 DOM 操作会被
React 19 metadata 管理覆盖/清理，后台改了前台不生效（踩过）。

### 管理后台（`app/admin/`）
- `layout.tsx` 做**权限守卫**：未登录跳 `/login`，非管理员显示「需要管理员权限」
- 侧边栏导航入口，用 `layoutId="admin-nav-pill"` 做滑动高亮

#### 站点地图页（`app/admin/sitemap/page.tsx`）
- 数据：`useQuery(['admin','sitemap'], fetchSitemapData)`（GET `/admin/sitemap`）
- 统计卡：URL 总数 + 分组计数徽章；sitemap.xml 入口卡（打开/复制地址）；robots.txt 预览卡（复制内容）
- 分组列表：基础页面/文章/独立页/分类/标签（后端 `collectEntries()` 分组顺序），条目表格（名称/地址/频率/权重/最后更新）
- 顶部搜索框按名称或地址前端过滤（服务端数据一次性拿全）

#### 网站日志页（`app/admin/logs/page.tsx`，Beta1.12 增强）
- 统计卡片：日志总数 / 今日新增 / 失败操作 / 当前筛选数（数据来自 `GET /admin/logs/overview`）
- 筛选：分类 tab（带分类计数）+ 关键词搜索（操作/详情/IP，回车触发）+ 结果下拉（全部/仅成功/仅失败）+ 时间范围下拉（全部/今天/近 7 天/近 30 天 → `from=YYYY-MM-DD`）
- 列表：成功/失败图标、分类徽章、操作、详情（超 48 字折叠 + 「展开/收起」）、用户名#ID、IP、时间、UA（截断 + title 全文）
- 导出 CSV：`downloadLogs()` 用 `fetch + Bearer` 直接取 blob（**不能走 `api()` JSON 客户端**），401 时 `tryRefresh()` 刷新重试；通过 `a[download]` + `URL.createObjectURL` 触发浏览器下载
- 分页：每页 30 条

#### 系统更新页（`app/admin/updates/page.tsx`，Beta1.15）

- 数据：`useQuery(['update','status'], fetchUpdateStatus)`，**进行中任务时 2s 轮询，否则 30s**（refetchInterval 回调按 `task` 是否存在切换）
- 版本对比卡：当前运行版本（大字号 + 运行中徽章）vs 最新发布版本（发布时间/大小/SHA256 截断/清单来源/更新说明 pre-wrap），有新版时出主按钮「立即更新到 x.y.z」
- 任务进度卡：phase 中文映射（checking/downloading/verifying/loading/deploying）+ `motion` 宽度进度条 + detail 说明
- 更新历史：type 徽章（更新/回滚）+ `from → to` + 状态徽章 + 触发方式 + 时间（`relativeTime`）+ detail；`rollback_tag` 存在时出「回滚到上一版本」按钮
- 更新设置卡：自动更新 Toggle、检查间隔、发布仓库、加速源 textarea（每行一个，保存时 split/filter）
- Docker 未挂载警示卡：给出 compose volumes 片段 (`/var/run/docker.sock:/var/run/docker.sock:ro`)
- 加速源为**列表编辑**（非 textarea）：每行一个源 + 延迟徽章（绿 `xxms` / 红「不可达」）+ 删除；「测试延迟」按钮调 `testUpdateMirrors()`（POST mirror-test），结果按 url 映射展示
- 版本更新记录卡：`fetchChangelog()`（GET /admin/updates）展示内置 changelog 最近 6 条，当前版本带徽章；更新说明用 `NotesBlock` 组件按行渲染（`-`/`•`/`1.` 开头转列表项，不引入 markdown 依赖）
- 危险操作全部走 `notify.confirm()`（立即更新/回滚），API 函数在 `lib/api.ts`：`fetchUpdateStatus / checkUpdate / runUpdate / rollbackUpdate / saveUpdateSettings / testUpdateMirrors / fetchChangelog`

### 用户中心（`app/me/page.tsx`）
所有登录用户可用：账户安全（改用户名/密码）、我的文章、我的评论。

---

## 样式规范

### 动画与感知性能（Beta1.15 更新页实践）
- **进度条用 `scaleX` 不用 `width`**：`origin-left` + `animate={{scaleX: pct/100}}`，走合成层不触发 layout/paint
- **纯 CSS 优先于 framer-motion**：列表逐项淡入（`.list-stagger > li` 30ms 阶梯）、骨架屏 shimmer（`.skeleton`）、tab 切换淡入（`.tab-enter`）全部是 keyframes，不为每项创建 motion 组件
- **`prefers-reduced-motion: reduce` 全局降级**：`.animate-fade-*`/`.skeleton`/`.list-stagger`/`.tab-enter` 动画全部关闭（主 frontend 与 update-hub 两个 globals.css 均已加）
- **渐进骨架**：首屏页头/按钮常驻，仅数据区 skeleton（`/admin/updates` loading 态），避免整页 skeleton → 整页内容的跳变
- **轮询优化**：`refetchOnWindowFocus: false`（30s 轮询已保新鲜，切 tab 回来不再立即请求）；任务运行中 2s、空闲 30s
- update-hub 是独立 Next 应用，globals.css 需自带上述 `.skeleton`/`.tab-enter`/`.list-stagger`（不与主 frontend 共享 CSS）

### 视觉层次约定（Beta1.15 更新系统实践）
- **状态可视化优先**：任务进度用「五阶段步骤条」`StepProgress`（当前步 `animate-pulse` + 完成步打勾）+ 进度条 shimmer 流光叠加（`.skeleton opacity-40`）；历史项左侧 6px 状态色条（成功 emerald/失败 red/进行 amber）
- **单一主动线**：重要 CTA 只出现一次（`/admin/updates` 顶部「新版本横幅」放立即更新，卡片内按钮降为 ghost 次级），避免双按钮抢焦点
- **渐变强调**：版本号大字用 `bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent`；Docker 运行状态用 ping 脉冲圆点
- **入场时机**：Section 用 `whileInView` + `viewport={{once:true}}`（长页面进入视口才播）+ `whileHover={{y:-2}}` 微浮；framer `layoutId` 滑块只用于 tab 指示器（单个元素，非列表）
- update-hub：登录页背景 blur-3xl 光斑 + 卡片 `bg-card/80 backdrop-blur-sm`；header `sticky backdrop-blur-md`；上传区支持点击/拖放（dragOver/drop 高亮）

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
