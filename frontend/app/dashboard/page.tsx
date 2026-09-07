'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteArticle, fetchArticles } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Article } from '@/lib/types'

function statusBadge(status: Article['status']) {
  return status === 'published' ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
      已发布
    </span>
  ) : (
    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
      草稿
    </span>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'mine'],
    queryFn: () => fetchArticles({ page: 1, page_size: 50, status: 'draft' }),
    enabled: Boolean(user),
  })

  const publishedQuery = useQuery({
    queryKey: ['articles', 'mine-published'],
    queryFn: () => fetchArticles({ page: 1, page_size: 50 }),
    enabled: Boolean(user),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteArticle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
  })

  if (loading || !user) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted-foreground">加载中...</div>
  }

  const mine = [
    ...(data?.articles ?? []).map((a) => ({ ...a, status: 'draft' as const })),
    ...(publishedQuery.data?.articles ?? [])
      .filter((a) => a.author.id === user.id)
      .map((a) => ({ ...a, status: a.status as Article['status'] })),
  ].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">我的文章</h1>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          写文章
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          还没有文章，点击「写文章」开始创作
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {mine.map((article) => (
            <div key={article.id} className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/posts/${article.slug}`}
                    className="truncate font-medium hover:underline underline-offset-4"
                  >
                    {article.title}
                  </Link>
                  {statusBadge(article.status)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  更新于 {new Date(article.updated_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/dashboard/edit/${article.id}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  编辑
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`确定删除「${article.title}」吗？`)) {
                      deleteMutation.mutate(article.id)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-red-600 transition-opacity hover:opacity-80 disabled:opacity-50 dark:text-red-400"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
