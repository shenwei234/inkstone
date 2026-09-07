'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createArticle, fetchArticle, updateArticle, ApiError } from '@/lib/api'
import { PageTransition } from '@/components/motion'

const easeOut = [0.16, 1, 0.3, 1] as const

function ArticleForm({
  articleId,
  initial,
}: {
  articleId?: number
  initial?: { title: string; content: string; status: string }
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (articleId) {
        return updateArticle(articleId, { title, content, status })
      }
      return createArticle({ title, content, status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['article', articleId] })
      router.push('/dashboard')
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : '保存失败，请稍后重试')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-card px-4 py-3 outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题..."
          className={`${inputClass} text-xl font-semibold`}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: easeOut }}
        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
      >
        <div className="flex items-center gap-1">
          {(['draft', 'published'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`relative rounded-md px-3.5 py-1.5 text-sm transition-colors ${
                status === s ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === s && (
                <motion.span
                  layoutId="status-pill"
                  className={`absolute inset-0 rounded-md ${
                    s === 'published' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{s === 'published' ? '发布' : '草稿'}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{content.length} 字</span>
          <span>·</span>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="rounded-md px-2.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
          >
            {preview ? '✏️ 编辑' : '👁 预览'}
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16, ease: easeOut }}
        className="relative"
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="min-h-[480px] rounded-lg border border-border bg-card p-8"
            >
              <div className="prose prose-neutral dark:prose-invert max-w-none prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content || '*暂无内容，切回编辑开始写作*'}
                </ReactMarkdown>
              </div>
            </motion.div>
          ) : (
            <motion.textarea
              key="editor"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# 标题&#10;&#10;开始你的 Markdown 创作..."
              rows={22}
              className={`${inputClass} resize-y font-mono text-sm leading-relaxed`}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        <motion.button
          type="submit"
          disabled={mutation.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-lg bg-accent px-8 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/25 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              保存中...
            </span>
          ) : articleId ? (
            '保存修改'
          ) : (
            '发布文章'
          )}
        </motion.button>
        <Link
          href="/dashboard"
          className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          取消
        </Link>
      </div>
    </form>
  )
}

export function NewArticlePage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">写文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">支持 Markdown 语法</p>
        </div>
        <ArticleForm />
      </div>
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
      <div className="mx-auto max-w-4xl px-4 py-10">
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
        className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground"
      >
        文章不存在或无权访问
      </motion.div>
    )
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">编辑文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.article.title}</p>
        </div>
        <ArticleForm
          key={data.article.id}
          articleId={data.article.id}
          initial={{
            title: data.article.title,
            content: data.article.content,
            status: data.article.status,
          }}
        />
      </div>
    </PageTransition>
  )
}
