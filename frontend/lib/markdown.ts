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
