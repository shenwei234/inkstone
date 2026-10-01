/** 全站共享的 UI 常量与工具，确保样式统一。 */

// ---------- 表单控件 ----------

/** 表单输入框统一样式（边框、聚焦光环、占位符） */
export const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

// ---------- 徽章 ----------

const badgeBase = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium'

export const badgeSuccess = `${badgeBase} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
export const badgeWarning = `${badgeBase} bg-amber-500/10 text-amber-600 dark:text-amber-400`
export const badgeDanger = `${badgeBase} bg-red-500/10 text-red-500`

// ---------- 正文排版 ----------

/**
 * 文章/独立页正文（Markdown 渲染的 .prose 容器）统一样式。
 * 设计取舍：
 * - prose-lg + leading-1.8：中文长文阅读舒适区
 * - headings 加 scroll-mt-24：目录锚点跳转时不被 sticky 导航遮挡
 * - h2 分隔线、引用浅底色、图片边框阴影、代码块描边：结构层次更清晰
 */
export const proseBody =
  'prose prose-neutral dark:prose-invert prose-lg max-w-none overflow-x-auto ' +
  'prose-p:leading-[1.8] prose-p:text-pretty ' +
  'prose-headings:scroll-mt-24 prose-headings:font-semibold ' +
  'prose-h1:mt-10 prose-h1:text-3xl ' +
  'prose-h2:mt-10 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl ' +
  'prose-h3:mt-8 prose-h3:text-xl ' +
  'prose-a:font-medium prose-a:text-accent prose-a:no-underline prose-a:decoration-accent/40 prose-a:underline-offset-4 ' +
  'hover:prose-a:underline ' +
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-pre:shadow-sm ' +
  'prose-img:rounded-xl prose-img:border prose-img:border-border prose-img:shadow-md ' +
  'prose-blockquote:not-italic prose-blockquote:border-l-accent prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg ' +
  'prose-li:marker:text-muted-foreground/60 ' +
  'prose-hr:my-10 prose-hr:border-border'

// ---------- 工具函数 ----------

/** 字节数格式化（B / KB / MB / GB） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 截断文本 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}
