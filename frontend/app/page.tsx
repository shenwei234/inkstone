'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchArticles } from '@/lib/api'
import type { Article } from '@/lib/types'

function ArticleCard({ article }: { article: Article }) {
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')

  return (
    <article className="group rounded-lg border p-5 transition-colors hover:border-foreground/30">
      <Link href={`/posts/${article.slug}`}>
        <h2 className="text-xl font-semibold tracking-tight group-hover:underline underline-offset-4">
          {article.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {article.content.slice(0, 160)}
        </p>
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{article.author.username}</span>
          <span>·</span>
          <time dateTime={article.published_at ?? article.created_at}>{date}</time>
        </div>
      </Link>
    </article>
  )
}

export default function HomePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['articles', 'published', 1],
    queryFn: () => fetchArticles({ page: 1, page_size: 10 }),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">最新文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `共 ${data.total} 篇` : '加载中...'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">加载失败</p>
          <p className="mt-1">{error instanceof Error ? error.message : '请确认后端服务已启动'}</p>
        </div>
      ) : data && data.articles.length > 0 ? (
        <div className="grid gap-4">
          {data.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">还没有文章，快来发布第一篇吧</p>
        </div>
      )}
    </div>
  )
}
