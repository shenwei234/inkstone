import { marked } from 'marked'
import TurndownService from 'turndown'

// HTML → Markdown（编辑已有文章时把存量 HTML 转成 MD 供编辑器使用）
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
})

/** Markdown → HTML（保存时转换并交由后端 bluemonday 消毒） */
export function markdownToHtml(md: string): string {
  if (!md.trim()) return ''
  return marked.parse(md, { async: false, gfm: true, breaks: true }) as string
}

/** HTML → Markdown */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return ''
  try {
    return turndown.turndown(html)
  } catch {
    return html
  }
}

export interface TocItem {
  level: number // 1-6
  text: string
  /** 在 Markdown 源文本中的字符偏移，用于编辑器跳转 */
  offset: number
}

/** 从 Markdown 提取标题大纲（忽略代码块内的 #） */
export function extractToc(md: string): TocItem[] {
  const items: TocItem[] = []
  let inFence = false
  let offset = 0
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (m) items.push({ level: m[1].length, text: m[2], offset })
    }
    offset += line.length + 1
  }
  return items
}
