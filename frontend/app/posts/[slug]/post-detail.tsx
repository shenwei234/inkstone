'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Heart,
  MessageSquare,
  Star,
  Tag as TagIcon,
  SearchX,
  Trash2,
} from 'lucide-react'
import {
  deleteComment,
  fetchArticleBySlug,
  fetchComments,
  fetchReactions,
  postComment,
  toggleReaction,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useNotify } from '@/components/toast'
import { useSiteConfig } from '@/components/site-config-context'
import type { CaptchaResult } from '@/components/captcha'
import dynamic from 'next/dynamic'
import { PageTransition, easeOut } from '@/components/motion'
import { SiteSidebar } from '@/components/site-sidebar'

// captcha 内含 gsap（拖拽滑块），懒加载以把 gsap 移出文章页首包
const Captcha = dynamic(() => import('@/components/captcha').then((m) => m.Captcha), { ssr: false })

export function PostDetail({ slug }: { slug: string }) {
  const { user } = useAuth()
  const notify = useNotify()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState('')
  const site = useSiteConfig()
  const [captcha, setCaptcha] = useState<CaptchaResult>({})

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['article', 'slug', slug],
    queryFn: () => fetchArticleBySlug(slug),
  })

  const articleId = data?.article.id

  const reactionsQuery = useQuery({
    queryKey: ['reactions', articleId],
    queryFn: () => fetchReactions(articleId!),
    enabled: Boolean(articleId),
  })

  const commentsQuery = useQuery({
    queryKey: ['comments', articleId],
    queryFn: () => fetchComments(articleId!),
    enabled: Boolean(articleId),
  })

  const toggle = useMutation({
    mutationFn: (type: 'like' | 'favorite') => toggleReaction(articleId!, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reactions', articleId] }),
    onError: (e) => notify.error(e instanceof Error ? e.message : '操作失败'),
  })

  const addComment = useMutation({
    mutationFn: () => postComment(articleId!, commentText, captcha),
    onSuccess: () => {
      setCommentText('')
      setCaptcha({})
      queryClient.invalidateQueries({ queryKey: ['comments', articleId] })
      notify.success('评论已发布')
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : '评论失败'),
  })

  const removeComment = useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', articleId] })
      notify.success('评论已删除')
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : '删除失败'),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="skeleton h-10 w-2/3 rounded-lg" />
        <div className="skeleton mt-4 h-4 w-40 rounded" />
        <div className="mt-10 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-4 rounded" style={{ width: `${95 - i * 7}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="mx-auto max-w-3xl px-4 py-24 text-center"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <SearchX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">文章不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : '请检查链接是否正确'}
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105"
        >
          返回首页
        </Link>
      </motion.div>
    )
  }

  const article = data.article
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')
  const reactions = reactionsQuery.data
  const comments = commentsQuery.data?.comments ?? []

  const requireLogin = () => {
    if (!user) {
      notify.error('请先登录')
      router.push('/login')
      return true
    }
    return false
  }

  const widgets = site.widgets.filter((w) => w.type && w.title)
  const showSidebar = site.articleSidebar && widgets.length > 0

  return (
    <PageTransition>
      <div
        className={`mx-auto px-4 py-12 ${
          showSidebar
            ? site.sidebarPosition === 'left'
              ? 'max-w-7xl lg:grid lg:grid-cols-[280px_1fr] lg:gap-10'
              : 'max-w-7xl lg:grid lg:grid-cols-[1fr_280px] lg:gap-10'
            : 'max-w-4xl'
        }`}
      >
      {showSidebar && site.sidebarPosition === 'left' && (
        <SiteSidebar widgets={widgets} position="left" />
      )}
      <div className="min-w-0">
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: easeOut }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10"
        >
          {article.cover && (
            <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-xl">
              <Image
                src={article.cover}
                alt={article.title}
                fill
                sizes="(max-width: 1024px) 100vw, 768px"
                className="object-cover"
              />
            </div>
          )}
          <motion.header
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="mb-8 border-b border-border pb-6"
          >
            {article.category && (
              <Link
                href={`/?category=${article.category.slug}`}
                className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                {article.category.name}
              </Link>
            )}
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {article.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <Link href="/" className="font-medium text-foreground hover:text-accent transition-colors">
                {article.author.username}
              </Link>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                <time dateTime={article.published_at ?? article.created_at}>{date}</time>
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {article.views} 次阅读
              </span>
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {article.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/?tag=${tag.slug}`}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </motion.header>

          <motion.article
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
            className="prose prose-neutral dark:prose-invert max-w-none overflow-x-auto prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl prose-blockquote:border-l-accent"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </motion.div>

        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45, ease: easeOut }}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <button
            type="button"
            onClick={() => {
              if (requireLogin()) return
              toggle.mutate('like')
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              reactions?.liked
                ? 'border-red-300 bg-red-500/10 text-red-500'
                : 'border-border text-muted-foreground hover:border-red-300 hover:text-red-500'
            }`}
          >
            <Heart className={`h-4 w-4 ${reactions?.liked ? 'fill-current' : ''}`} />
            {reactions?.likes ?? 0}
          </button>
          <button
            type="button"
            onClick={() => {
              if (requireLogin()) return
              toggle.mutate('favorite')
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              reactions?.favorited
                ? 'border-amber-300 bg-amber-500/10 text-amber-500'
                : 'border-border text-muted-foreground hover:border-amber-300 hover:text-amber-500'
            }`}
          >
            <Star className={`h-4 w-4 ${reactions?.favorited ? 'fill-current' : ''}`} />
            {reactions?.favorites ?? 0}
          </button>
          <Link
            href="/"
            className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> 返回首页
          </Link>
        </motion.div>

        {/* Comments */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <MessageSquare className="h-5 w-5" />
            评论
            <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
          </h2>

          {user ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!commentText.trim()) {
                  notify.error('评论内容不能为空')
                  return
                }
                addComment.mutate()
              }}
              className="mt-4"
            >
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="写下你的评论..."
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <div className="mt-2">
                <Captcha config={site.captcha} action="comment" onChange={setCaptcha} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{commentText.length}/1000</span>
                <motion.button
                  type="submit"
                  disabled={addComment.isPending}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
                >
                  {addComment.isPending ? '发布中...' : '发表评论'}
                </motion.button>
              </div>
            </form>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              <button
                onClick={() => router.push('/login')}
                className="font-medium text-accent underline underline-offset-4"
              >
                登录
              </button>
              后参与评论
            </div>
          )}

          <div className="mt-6 space-y-3">
            {commentsQuery.isLoading ? (
              [...Array(2)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)
            ) : comments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有评论，来抢沙发吧
              </p>
            ) : (
              comments.map((comment, i) => (
                <motion.div
                  key={comment.id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                    {comment.author.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{comment.author.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleString('zh-CN')}
                      </span>
                      {(user?.id === comment.author.id || user?.role === 'admin') && (
                        <button
                          onClick={() => {
                            notify
                              .confirm({
                                title: '删除这条评论？',
                                message: '删除后无法恢复。',
                                confirmText: '删除',
                                danger: true,
                              })
                              .then((ok) => {
                                if (ok) removeComment.mutate(comment.id)
                              })
                          }}
                          className="ml-auto text-muted-foreground transition-colors hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>
      </div>
      {showSidebar && site.sidebarPosition !== 'left' && (
        <SiteSidebar widgets={widgets} position="right" />
      )}
      </div>
    </PageTransition>
  )
}
