'use client'

import { useEffect, useState, type RefObject } from 'react'
import { ListTree } from 'lucide-react'

export interface TocItem {
  id: string
  text: string
  level: number
}

/**
 * 从文章 HTML 提取目录（h1-h3，文档序）。
 * 在 useMemo 里对 HTML 字符串做 DOMParser 解析——不读 ref、不 setState，
 * SSR 时 document 不存在返回空数组（客户端挂载后由 mounted gate 生效）。
 */
export function parseToc(html: string): TocItem[] {
  if (typeof document === 'undefined' || !html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((h, i) => ({
      id: `toc-heading-${i}`,
      text: h.textContent?.trim() ?? '',
      level: Number(h.tagName.slice(1)),
    }))
    .filter((t) => t.text)
}

/**
 * 文章目录（自动生成）。滚动时高亮当前章节、点击平滑跳转。
 * 由父组件根据 tocItems.length 决定布局（无侧边栏时贴空的一侧，无标题则整列隐藏）。
 */
export function ArticleToc({ items, contentRef }: { items: TocItem[]; contentRef: RefObject<HTMLElement | null> }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')

  // 给真实标题补锚点 id（纯 DOM 写操作，不涉及 state）
  useEffect(() => {
    const root = contentRef.current
    if (!root || items.length === 0) return
    const headings = root.querySelectorAll('h1, h2, h3')
    items.forEach((item, i) => {
      const el = headings[i]
      if (el && !el.id) el.id = item.id
    })
  }, [items, contentRef])

  // 滚动高亮：取视口上方最近的标题（在事件回调里 setState，非 effect 同步路径）
  useEffect(() => {
    if (items.length === 0) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        let current = items[0]?.id ?? ''
        for (const item of items) {
          const el = document.getElementById(item.id)
          if (el && el.getBoundingClientRect().top <= 120) current = item.id
        }
        setActiveId(current)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [items])

  if (items.length === 0) return null

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
        <p className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <ListTree className="h-3.5 w-3.5" /> 目录
        </p>
        <nav className="space-y-0.5 border-l border-border">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              style={{ paddingLeft: `${(item.level - 1) * 10 + 10}px` }}
              className={`-ml-px block border-l-2 py-1 pr-2 text-xs leading-relaxed transition-colors ${
                activeId === item.id
                  ? 'border-accent font-medium text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}
