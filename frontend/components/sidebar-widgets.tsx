'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { fetchArticles, fetchTags } from '@/lib/api'
import type { SidebarWidget } from '@/components/site-config-context'

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function HotWidget({ limit, title }: { limit?: number; title: string }) {
  const { data } = useQuery({
    queryKey: ['articles', 'hot', limit],
    queryFn: () => fetchArticles({ page: 1, page_size: limit ?? 5, order: 'views' }),
  })
  const articles = data?.articles ?? []
  return (
    <WidgetCard title={title}>
      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无数据</p>
      ) : (
        <ol className="space-y-2.5">
          {articles.map((a, i) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                  i < 3 ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </span>
              <Link
                href={`/posts/${a.slug}`}
                className="line-clamp-1 text-sm text-foreground/90 transition-colors hover:text-accent"
              >
                {a.title}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  )
}

function TagsWidget({ limit, title }: { limit?: number; title: string }) {
  const { data } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
  })
  const tags = (data?.tags ?? []).slice(0, limit ?? 20)
  return (
    <WidgetCard title={title}>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无标签</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={`/?tag=${t.slug}`}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              {t.name}
              <span className="ml-1 opacity-60">{t.article_count}</span>
            </Link>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

function SearchWidget({ title }: { title: string }) {
  return (
    <WidgetCard title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement) ?? null
          if (input) window.location.href = input.value.trim() ? `/?q=${encodeURIComponent(input.value.trim())}` : '/'
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          placeholder="输入关键词回车搜索..."
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>
    </WidgetCard>
  )
}

function HtmlWidget({ title, content }: { title: string; content?: string }) {
  return (
    <WidgetCard title={title}>
      <div
        className="text-sm leading-relaxed text-foreground/80 [&_a]:text-accent [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: content || '' }}
      />
    </WidgetCard>
  )
}

export function WidgetRenderer({ widget }: { widget: SidebarWidget }) {
  switch (widget.type) {
    case 'about':
      return (
        <WidgetCard title={widget.title}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {widget.content || '站点简介'}
          </p>
        </WidgetCard>
      )
    case 'hot':
      return <HotWidget limit={widget.limit} title={widget.title} />
    case 'tags':
      return <TagsWidget limit={widget.limit} title={widget.title} />
    case 'search':
      return <SearchWidget title={widget.title} />
    case 'html':
      return <HtmlWidget title={widget.title} content={widget.content} />
    default:
      return null
  }
}
