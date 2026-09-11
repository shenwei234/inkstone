'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createArticle,
  deleteAdminArticle,
  fetchArticle,
  fetchCategories,
  updateArticle,
  ApiError,
} from '@/lib/api'
import type { Article } from '@/lib/types'
import { PageTransition } from '@/components/motion'
import { RichEditor } from '@/components/rich-editor'
import { useNotify } from '@/components/toast'

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
  const [viewSlug, setViewSlug] = useState<string | null>(article?.slug ?? null)
  const [categoryId, setCategoryId] = useState<number | null>(article?.category?.id ?? null)
  const [tags, setTags] = useState<string[]>((article?.tags ?? []).map((t) => t.name))
  const [tagInput, setTagInput] = useState('')
  const notify = useNotify()

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const addTag = () => {
    const name = tagInput.trim()
    if (!name) return
    if (tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTagInput('')
      return
    }
    setTags((t) => [...t, name])
    setTagInput('')
  }

  const removeTag = (name: string) => setTags((t) => t.filter((x) => x !== name))

  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(
    mode === 'edit' && article?.status === 'draft' ? new Date(article.updated_at) : null,
  )
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const baseline = useRef(
    JSON.stringify({
      t: article?.title ?? '',
      c: article?.content ?? '',
      g: article?.category?.id ?? null,
      s: (article?.tags ?? []).map((t) => t.name).join(','),
    }),
  )

  // Restore saved preference after mount (default: on).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setAutoSaveEnabled(localStorage.getItem('blog_autosave') !== 'off')
      } catch {
        // storage unavailable: keep default
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const toggleAutoSave = () => {
    const next = !autoSaveEnabled
    setAutoSaveEnabled(next)
    try {
      localStorage.setItem('blog_autosave', next ? 'on' : 'off')
    } catch {
      // ignore persistence failure
    }
    baseline.current = JSON.stringify({ t: title, c: content })
    notify.success(next ? '自动保存已开启' : '自动保存已关闭')
  }

  const isPublished = mode === 'edit' && article?.status === 'published'

  const publish = useMutation({
    mutationFn: async () => {
      const body = { title, content, status: 'published', category_id: categoryId, tags }
      if (mode === 'edit' && article) {
        return updateArticle(article.id, body)
      }
      return createArticle(body)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['article', res.article.id] })
      if (mode === 'edit' && article) {
        setViewSlug(res.article.slug)
        notify.success(res.article.status === 'published' ? '文章已发布' : '已保存', res.article.slug)
      } else {
        notify.success('文章已发布', res.article.slug)
        router.replace(`/admin/articles/edit/${res.article.id}`)
      }
    },
    onError: (err) => notify.error(err instanceof ApiError ? err.message : '发布失败，请稍后重试'),
  })

  const trash = useMutation({
    mutationFn: () => deleteAdminArticle(article!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      notify.success('文章已删除')
      router.push('/admin/articles')
    },
    onError: (err) => notify.error(err instanceof ApiError ? err.message : '删除失败'),
  })

  // Auto-save: silently keeps drafts up to date while writing (edit mode only).
  useEffect(() => {
    if (!autoSaveEnabled) return
    if (mode !== 'edit' || article?.status !== 'draft') return
    const snapshot = JSON.stringify({ t: title, c: content, g: categoryId, s: tags.join(',') })
    if (snapshot === baseline.current) return
    if (!title.trim() || !htmlToText(content).trim()) return

    const timer = setTimeout(async () => {
      setAutoSaving(true)
      try {
        await updateArticle(article.id, {
          title,
          content,
          status: 'draft',
          category_id: categoryId,
          tags,
        })
        baseline.current = snapshot
        setAutoSavedAt(new Date())
      } catch {
        // silent failure: user can still publish manually
      } finally {
        setAutoSaving(false)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [title, content, categoryId, tags, mode, article, autoSaveEnabled])

  const wordCount = htmlToText(content).replace(/\s+/g, '').length
  const readMinutes = Math.max(1, Math.round(wordCount / 400))

  const doPublish = () => {
    if (!title.trim()) {
      notify.error('给文章起个标题吧')
      return
    }
    if (!wordCount) {
      notify.error('先写一点正文，再发布')
      return
    }
    publish.mutate()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    doPublish()
  }

  const saveIndicator = !autoSaveEnabled ? (
    <span className="text-xs text-muted-foreground">自动保存已关闭</span>
  ) : autoSaving ? (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      保存中...
    </span>
  ) : autoSavedAt ? (
    <span className="text-xs text-emerald-600 dark:text-emerald-400">
      已自动保存 {autoSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  ) : isPublished ? (
    <span className="text-xs text-muted-foreground">已发布</span>
  ) : (
    <span className="text-xs text-muted-foreground">输入内容后自动保存</span>
  )

  const autoSaveSwitch = mode === 'edit' && article?.status === 'draft' && (
    <button
      type="button"
      onClick={toggleAutoSave}
      title={autoSaveEnabled ? '关闭自动保存' : '开启自动保存'}
      className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          autoSaveEnabled ? 'bg-emerald-500' : 'bg-border'
        }`}
      >
        <motion.span
          animate={{ x: autoSaveEnabled ? 16 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
        />
      </span>
      自动保存
    </button>
  )

  const primaryLabel = mode === 'new' ? '发布文章' : isPublished ? '更新' : '发布'

  return (
    <form onSubmit={submit} className="-mx-4 -my-8">
      <div className="sticky top-16 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/articles"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 transition-transform hover:-translate-x-0.5" />
              <span className="hidden sm:inline">文章列表</span>
            </Link>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <div className="hidden items-center gap-3 sm:flex">
              {autoSaveSwitch}
              {saveIndicator}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isPublished && viewSlug && (
              <Link
                href={`/posts/${viewSlug}`}
                target="_blank"
                className="rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                查看
              </Link>
            )}
            <motion.button
              type="button"
              onClick={doPublish}
              disabled={publish.isPending}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
            >
              {publish.isPending ? '保存中...' : primaryLabel}
            </motion.button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="rounded-xl border border-border bg-card p-6 sm:p-10"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给文章起个标题吧..."
            className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
          />

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none transition-colors focus:border-accent"
            >
              <option value="">未分类</option>
              {(categoriesQuery.data?.categories ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent"
              >
                {t}
                <button type="button" onClick={() => removeTag(t)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag()
                }
              }}
              onBlur={addTag}
              placeholder="+ 标签，回车添加"
              className="w-32 rounded-lg border border-dashed border-border bg-transparent px-2.5 py-1 text-xs outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="mt-6 border-t border-border pt-2">
            <RichEditor content={content} onChange={setContent} variant="plain" />
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {wordCount} 字 · 约 {readMinutes} 分钟读完
            </span>
            <div className="flex items-center gap-4">
              <span className="sm:hidden">{autoSaveSwitch}</span>
              <span className="sm:hidden">{saveIndicator}</span>
              {mode === 'edit' && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await notify.confirm({
                      title: '删除这篇文章？',
                      message: `「${article?.title}」将被永久删除，此操作无法撤销。`,
                      confirmText: '确认删除',
                      danger: true,
                    })
                    if (ok) trash.mutate()
                  }}
                  disabled={trash.isPending}
                  className="transition-colors hover:text-red-500 disabled:opacity-50"
                >
                  删除文章
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-4 text-center text-xs text-muted-foreground"
        >
          提示：写完点右上角「{primaryLabel}」就能发表。草稿每 2 秒自动保存，不用怕丢。
        </motion.p>
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
