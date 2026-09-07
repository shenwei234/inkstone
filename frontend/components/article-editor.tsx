'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createArticle,
  deleteAdminArticle,
  fetchArticle,
  updateArticle,
  ApiError,
} from '@/lib/api'
import type { Article } from '@/lib/types'
import { PageTransition } from '@/components/motion'
import { RichEditor } from '@/components/rich-editor'

const easeOut = [0.16, 1, 0.3, 1] as const

function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
}

interface EditorShellProps {
  mode: 'new' | 'edit'
  article?: Article
}

function EditorShell({ mode, article }: EditorShellProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(article?.title ?? '')
  const [content, setContent] = useState(article?.content ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(article?.status ?? 'draft')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [viewSlug, setViewSlug] = useState<string | null>(article?.slug ?? null)

  const save = useMutation({
    mutationFn: async (saveStatus: 'draft' | 'published') => {
      const body = { title, content, status: saveStatus }
      if (mode === 'edit' && article) {
        return updateArticle(article.id, body)
      }
      return createArticle(body)
    },
    onSuccess: (res, savedStatus) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      if (article) {
        queryClient.invalidateQueries({ queryKey: ['article', article.id] })
        setStatus(res.article.status)
        setViewSlug(res.article.slug)
        setNotice(savedStatus === 'published' ? '文章已发布。' : '草稿已保存。')
      } else {
        router.replace(`/admin/articles/edit/${res.article.id}`)
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : '保存失败，请稍后重试')
    },
  })

  const trash = useMutation({
    mutationFn: () => deleteAdminArticle(article!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      router.push('/admin/articles')
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
  })

  const doSave = (saveStatus: 'draft' | 'published') => {
    setError(null)
    if (!title.trim()) {
      setError('请填写文章标题')
      return
    }
    if (!htmlToText(content).trim()) {
      setError('正文不能为空')
      return
    }
    save.mutate(saveStatus)
  }

  const isPublished = status === 'published'
  const primaryLabel = mode === 'new' ? (isPublished ? '发布' : '保存草稿') : '更新'
  const wordCount = htmlToText(content).replace(/\s+/g, '').length

  const submit = (e: FormEvent) => {
    e.preventDefault()
    doSave(status)
  }

  return (
    <form onSubmit={submit} className="-mx-4 -my-8">
      <div className="sticky top-16 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/articles"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="transition-transform hover:-translate-x-0.5">←</span>
              <span className="hidden sm:inline">文章列表</span>
            </Link>
            <span className="h-4 w-px bg-border" />
            <h1 className="truncate text-sm font-medium">
              {mode === 'new' ? '写文章' : `编辑：${article?.title ?? ''}`}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {mode === 'edit' && isPublished && viewSlug && (
              <Link
                href={`/posts/${viewSlug}`}
                target="_blank"
                className="rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                查看文章
              </Link>
            )}
            <motion.button
              type="button"
              onClick={() => doSave('draft')}
              disabled={save.isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-md border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              保存草稿
            </motion.button>
            <motion.button
              type="button"
              onClick={() => doSave(isPublished ? 'published' : 'published')}
              disabled={save.isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
            >
              {save.isPending ? '保存中...' : primaryLabel}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {(error || notice) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-auto max-w-7xl px-4 pb-3">
                {error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {notice}
                    {viewSlug && (
                      <Link
                        href={`/posts/${viewSlug}`}
                        target="_blank"
                        className="font-medium underline underline-offset-4"
                      >
                        查看文章
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotice(null)}
                      className="ml-auto text-emerald-600/70 transition-colors hover:text-emerald-700 dark:text-emerald-400/70"
                    >
                      ×
                    </button>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_280px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="min-w-0 rounded-xl border border-border bg-card p-6 sm:p-10"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="添加标题"
            className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
          />
          <div className="mt-6 border-t border-border pt-2">
            <RichEditor content={content} onChange={setContent} variant="plain" />
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: easeOut }}
          className="h-fit space-y-4 lg:sticky lg:top-36"
        >
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">发布</p>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">状态</span>
                <div className="flex items-center gap-1">
                  {(['draft', 'published'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`relative rounded-md px-2.5 py-1 text-xs transition-colors ${
                        status === s ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {status === s && (
                        <motion.span
                          layoutId="wp-status-pill"
                          className={`absolute inset-0 rounded-md ${
                            s === 'published' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative">{s === 'published' ? '已发布' : '草稿'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">可见性</span>
                <span>公开</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">字数</span>
                <span>{wordCount}</span>
              </div>
              {article?.published_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">发布于</span>
                  <span className="text-xs">{new Date(article.published_at).toLocaleDateString('zh-CN')}</span>
                </div>
              )}
            </div>
            <div className="border-t border-border px-4 py-3">
              <motion.button
                type="submit"
                disabled={save.isPending}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
              >
                {isPublished ? primaryLabel : '保存'}
              </motion.button>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`确定将「${article?.title}」移到回收站吗？`)) trash.mutate()
                }}
                disabled={trash.isPending}
                className="text-sm text-red-500 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                {trash.isPending ? '删除中...' : '移到回收站'}
              </button>
            </div>
          )}
        </motion.aside>
      </div>
    </form>
  )
}

export function NewArticlePage() {
  return (
    <PageTransition>
      <EditorShell mode="new" />
    </PageTransition>
  )
}

export function EditArticlePage({ id }: { id: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['article', id],
    queryFn: () => fetchArticle(id),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="skeleton h-14 rounded-lg" />
        <div className="skeleton mt-4 h-12 rounded-lg" />
        <div className="skeleton mt-4 h-96 rounded-lg" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-5xl px-4 py-24 text-center text-muted-foreground"
      >
        文章不存在或无权访问
      </motion.div>
    )
  }

  return (
    <PageTransition>
      <EditorShell key={data.article.id} mode="edit" article={data.article} />
    </PageTransition>
  )
}
