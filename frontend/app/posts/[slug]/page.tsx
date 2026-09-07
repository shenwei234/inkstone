'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchArticleBySlug } from '@/lib/api'

export default function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['article', 'slug', slug],
    queryFn: () => fetchArticleBySlug(slug),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="h-10 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">文章不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : '请检查链接是否正确'}
        </p>
        <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
          返回首页
        </Link>
      </div>
    )
  }

  const article = data.article
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{article.title}</h1>
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="font-medium text-foreground hover:underline">
            {article.author.username}
          </Link>
          <span>·</span>
          <time dateTime={article.published_at ?? article.created_at}>{date}</time>
        </div>
      </header>

      <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
      </div>
    </div>
  )
}
