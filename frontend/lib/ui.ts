/** 全站共享的 UI 常量与工具，确保样式统一。 */

// ---------- 表单控件 ----------

/** 表单输入框统一样式（边框、聚焦光环、占位符） */
export const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

/** 卡片风格输入框（背景使用 card 色） */
export const inputClassCard =
  'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

// ---------- 容器/卡片 ----------

/** 内容卡片（大面积容器）：圆角 + 边框 + 卡片底色 + 轻阴影 */
export const cardClass = 'rounded-2xl border border-border bg-card shadow-sm'

/** 小卡片（列表项、行内卡片） */
export const cardSmClass = 'rounded-xl border border-border bg-card'

/** 空状态容器（虚线边框） */
export const emptyClass = 'rounded-xl border border-dashed p-16 text-center'

// ---------- 按钮 ----------

const btnBase =
  'inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** 主按钮（强调色） */
export const btnPrimary = `${btnBase} rounded-lg bg-accent px-5 py-2 text-white shadow-md shadow-accent/25 hover:opacity-95`

/** 次按钮（描边） */
export const btnSecondary = `${btnBase} rounded-lg border border-border px-4 py-2 text-muted-foreground hover:border-accent/40 hover:text-accent`

/** 危险按钮（红色文字） */
export const btnDanger = `${btnBase} rounded-lg px-3 py-1.5 text-red-500 hover:bg-red-500/10`

/** 小尺寸按钮 */
export const btnSm = `${btnBase} rounded-md px-2.5 py-1.5 text-xs`

// ---------- 徽章 ----------

const badgeBase =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium'

export const badgeSuccess = `${badgeBase} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
export const badgeWarning = `${badgeBase} bg-amber-500/10 text-amber-600 dark:text-amber-400`
export const badgeDanger = `${badgeBase} bg-red-500/10 text-red-500`
export const badgeAccent = `${badgeBase} bg-accent/10 text-accent`
export const badgeMuted = `${badgeBase} bg-muted text-muted-foreground`

// ---------- 页面容器 ----------

/** 后台页面统一容器（垂直节奏一致） */
export const pageClass = ''

// ---------- 工具函数 ----------

/** 字节数格式化（B / KB / MB / GB） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 相对时间（刚刚 / N 分钟前 / N 小时前 / 日期） */
export function relativeTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

/** 截断文本 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…'
}
