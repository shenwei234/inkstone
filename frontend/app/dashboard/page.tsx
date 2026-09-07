'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteArticle, fetchArticles } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Article } from '@/lib/types'
import { PageTransition, StaggerList, StaggerItem, HoverLift } from '@/components/motion'

const easeOut = [0.16, 1, 0.3, 1] as const

function StatusBadge({ status }: { status: Article['status'] }) {
  return status === 'published' ? (
    <motion.span
      layout
      className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
    >
      已发布
    </motion.span>
  ) : (
    <motion.span
      layout
      className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      草稿
    </motion.span>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  const draftsQuery = useQuery({
    queryKey: ['articles', 'mine-drafts'],
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
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="skeleton h-24 rounded-xl" />
      </div>
    )
  }

  const mine = [
    ...(draftsQuery.data?.articles ?? []),
    ...(publishedQuery.data?.articles ?? []).filter(
      (a) => a.author.id === user.id && a.status === 'published',
    ),
  ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const listLoading = draftsQuery.isLoading || publishedQuery.isLoading

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easeOut }}
              className="text-2xl font-bold tracking-tight"
            >
              你好，{user.username} 👋
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-1 text-sm text-muted-foreground"
            >
              {mine.length > 0 ? `共 ${mine.length} 篇文章` : '开始你的第一篇创作吧'}
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <Link
              href="/dashboard/new"
              className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/25"
            >
              + 写文章
            </Link>
          </motion.div>
        </div>

        {listLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="rounded-2xl border border-dashed p-16 text-center"
          >
            <div className="text-4xl">✍️</div>
            <p className="mt-4 text-muted-foreground">还没有文章，点击「写文章」开始创作</p>
          </motion.div>
        ) : (
          <StaggerList className="space-y-3">
            <AnimatePresence mode="popLayout">
              {mine.map((article) => (
                <StaggerItem key={article.id} className="list-none">
                  <motion.div
                    layout
                    exit={{ opacity: 0, x: -32, transition: { duration: 0.25 } }}
                  >
                    <HoverLift>
                      <div className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-accent/30">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <Link
                              href={`/posts/${article.slug}`}
                              className="truncate font-medium transition-colors hover:text-accent"
                            >
                              {article.title}
                            </Link>
                            <StatusBadge status={article.status} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            更新于 {new Date(article.updated_at).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div className="ml-4 flex shrink-0 items-center gap-1 text-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <Link
                            href={`/dashboard/edit/${article.id}`}
                            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                            className="rounded-md px-3 py-1.5 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </HoverLift>
                  </motion.div>
                </StaggerItem>
              ))}
            </AnimatePresence>
          </StaggerList>
        )}
      </div>
    </PageTransition>
  )
}
