'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminArticle,
  fetchAdminArticles,
  setAdminArticleStatus,
  ApiError,
} from '@/lib/api'
import type { Article } from '@/lib/types'

const tabs = [
  { key: '', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿' },
] as const

function statusBadge(status: Article['status']) {
  return status === 'published' ? (
    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      已发布
    </span>
  ) : (
    <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      草稿
    </span>
  )
}

export default function AdminArticlesPage() {
  const [status, setStatus] = useState<'' | 'published' | 'draft'>('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'articles', status],
    queryFn: () => fetchAdminArticles({ page: 1, page_size: 50, status: status || undefined }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] })

  const statusMutation = useMutation({
    mutationFn: ({ id, s }: { id: number; s: 'draft' | 'published' }) => setAdminArticleStatus(id, s),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '操作失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminArticle(id),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '删除失败'),
  })

  return (
    <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">文章管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data ? `共 ${data.total} 篇` : '加载中...'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/admin/articles/new"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25"
              >
                + 写文章
              </Link>
            </motion.div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`relative rounded-md px-3.5 py-1.5 text-sm transition-colors ${
                status === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === t.key && (
                <motion.span
                  layoutId="article-tab-pill"
                  className="absolute inset-0 rounded-md bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
            </div>
          </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {(data?.articles ?? []).map((a, i) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-accent/30"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <Link
                    href={`/posts/${a.slug}`}
                    className="truncate font-medium transition-colors hover:text-accent"
                  >
                    {a.title}
                  </Link>
                  {statusBadge(a.status)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  作者 {a.author.username} · 更新于{' '}
                  {new Date(a.updated_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-1 text-xs">
                <button
                  onClick={() =>
                    statusMutation.mutate({
                      id: a.id,
                      s: a.status === 'published' ? 'draft' : 'published',
                    })
                  }
                  disabled={statusMutation.isPending}
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {a.status === 'published' ? '转为草稿' : '发布'}
                </button>
                <Link
                  href={`/admin/articles/edit/${a.id}`}
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  编辑
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`确定删除「${a.title}」？`)) deleteMutation.mutate(a.id)
                  }}
                  disabled={deleteMutation.isPending}
                  className="rounded-md px-3 py-1.5 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </motion.div>
          ))}
          {(data?.articles.length ?? 0) === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-dashed py-16 text-center text-muted-foreground"
            >
              没有符合条件的文章
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
