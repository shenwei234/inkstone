'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, ShieldCheck, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createArticle,
  deleteAdminArticle,
  fetchArticle,
  fetchCategories,
  fetchTags,
  uploadImage,
  updateArticle,
  ApiError,
} from '@/lib/api'
import type { Article } from '@/lib/types'
import { PageTransition } from '@/components/motion'
import { easeOut } from '@/components/motion'
import { MarkdownEditor } from '@/components/markdown-editor'
import { markdownToHtml, htmlToMarkdown } from '@/lib/markdown'
import { useNotify } from '@/components/toast'
import { useSiteConfig } from '@/components/site-config-context'
import { useAuth } from '@/lib/auth-context'
import { ArticlePreview } from '@/components/article-preview'
import { Captcha, type CaptchaResult } from '@/components/captcha'

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
  // 编辑器内部用 Markdown；保存时转成 HTML 交给后端（与既有存储/渲染保持一致）
  const [markdown, setMarkdown] = useState(() => (article?.content ? htmlToMarkdown(article.content) : ''))
  const content = useMemo(() => markdownToHtml(markdown), [markdown])
  const [viewSlug, setViewSlug] = useState<string | null>(article?.slug ?? null)
  const [categoryId, setCategoryId] = useState<number | null>(article?.category?.id ?? null)
  const [tags, setTags] = useState<string[]>((article?.tags ?? []).map((t) => t.name))
  const [tagInput, setTagInput] = useState('')
  const [cover, setCover] = useState(article?.cover ?? '')
  const [showCover, setShowCover] = useState(Boolean(article?.cover))
  const uploadCoverRef = useRef<HTMLInputElement>(null)
  const notify = useNotify()
  const site = useSiteConfig()
  const { user } = useAuth()
  const [captcha, setCaptcha] = useState<CaptchaResult>({})
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

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

  /** 真正提交（此时人机验证已通过） */
  const commitPublish = () => {
    publish.mutate()
  }

  const publish = useMutation({
    mutationFn: async () => {
      const body = {
        title,
        content,
        status: 'published',
        category_id: categoryId,
        tags,
        cover,
        captcha_token: captcha.captcha_token,
        captcha_answer: captcha.captcha_answer,
      }
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
    const snapshot = JSON.stringify({ t: title, c: content, g: categoryId, s: tags.join(','), v: cover })
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
          cover,
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
  }, [title, content, categoryId, tags, cover, mode, article, autoSaveEnabled])

  const wordCount = htmlToText(content).replace(/\s+/g, '').length
  const readMinutes = Math.max(1, Math.round(wordCount / 400))

  // 实时预览用的派生数据
  const previewCategory =
    categoriesQuery.data?.categories.find((c) => c.id === categoryId)?.name ?? article?.category?.name ?? null
  const previewAuthor = article?.author?.username ?? user?.username ?? '我'
  const [todayLabel] = useState(() => new Date().toLocaleDateString('zh-CN'))
  const previewDate =
    article?.published_at ?? article?.created_at
      ? new Date((article?.published_at ?? article?.created_at) as string).toLocaleDateString('zh-CN')
      : todayLabel
  const previewViews = article?.views ?? 0

  // 是否需要人机验证（后台「安全防护」为发文开启时）
  const captchaRequired =
    !!site.captcha &&
    site.captcha.provider !== 'none' &&
    Boolean(site.captcha.on_article)

  // 点击「发布/更新」：先做人机验证（如开启），通过后再提交
  const doPublish = () => {
    if (!title.trim()) {
      notify.error('给文章起个标题吧')
      return
    }
    if (!wordCount) {
      notify.error('先写一点正文，再发布')
      return
    }
    if (captchaRequired) {
      setCaptchaOpen(true)
      return
    }
    commitPublish()
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
    <form onSubmit={submit} className="min-h-[60vh]">
      {/* 顶部工具条 */}
      <div className="sticky top-16 z-40 -mx-4 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
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
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">预览</span>
            </button>
            <motion.button
              type="button"
              onClick={doPublish}
              disabled={publish.isPending}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
            >
              {captchaRequired && !publish.isPending && <ShieldCheck className="h-3.5 w-3.5" />}
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

          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
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

              {/* 已选标签 */}
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent"
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} title="移除">
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
                placeholder="+ 新建标签，回车添加"
                className="w-36 rounded-lg border border-dashed border-border bg-transparent px-2.5 py-1 text-xs outline-none transition-colors focus:border-accent"
              />
            </div>

            {/* 文章封面 */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">文章封面</span>
              {showCover ? (
                <>
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={cover} alt="封面" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                        无
                      </span>
                    )}
                  </div>
                  <input
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    placeholder="图片地址，留空则自动使用正文第一张图"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => uploadCoverRef.current?.click()}
                    className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    上传
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCover('')
                      setShowCover(false)
                    }}
                    className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-red-500"
                  >
                    移除
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCover(true)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-accent/40 hover:text-accent"
                >
                  + 设置封面
                </button>
              )}
              <input
                ref={uploadCoverRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    const url = await uploadImage(file)
                    setCover(url)
                    setShowCover(true)
                    notify.success('封面已上传，记得保存')
                  } catch (err) {
                    notify.error(err instanceof ApiError ? err.message : '上传失败')
                  }
                }}
              />
            </div>

            {/* 从已有标签中选择 */}
            {(tagsQuery.data?.tags ?? []).filter((t) => !tags.includes(t.name)).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">选择已有标签：</span>
                {(tagsQuery.data?.tags ?? [])
                  .filter((t) => !tags.includes(t.name))
                  .slice(0, 20)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTags((arr) => [...arr, t.name])}
                      className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      + {t.name}
                      <span className="ml-1 opacity-60">{t.article_count}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-2">
            <MarkdownEditor value={markdown} onChange={setMarkdown} />
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

        {/* 人机验证：发布/更新时弹出（单层 gsap 弹窗，验证通过自动提交） */}
        {captchaRequired && captchaOpen && (
          <Captcha
            config={site.captcha}
            action="article"
            autoOpen
            onChange={setCaptcha}
            onVerified={commitPublish}
            onCancel={() => setCaptchaOpen(false)}
          />
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center text-xs text-muted-foreground"
        >
          {captchaRequired
            ? `提示：写完点右上角「${primaryLabel}」，会先进行人机验证再发布。草稿每 2 秒自动保存。`
            : `提示：写完点右上角「${primaryLabel}」就能发表。草稿每 2 秒自动保存，不用怕丢。`}
        </motion.p>
      </div>
      {/* 全屏实时预览 */}
      {previewOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-accent" /> 实时预览
            </span>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" /> 关闭预览
            </button>
          </div>
          <ArticlePreview
            title={title}
            categoryName={previewCategory}
            tags={tags}
            authorName={previewAuthor}
            date={previewDate}
            views={previewViews}
            contentHtml={content}
          />
        </div>
      )}
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
