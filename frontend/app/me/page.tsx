'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  FileText,
  KeyRound,
  Lock,
  MessageSquare,
  Trash2,
  User,
  UserRoundCog,
} from 'lucide-react'
import {
  changePassword,
  deleteComment,
  fetchArticles,
  fetchMyComments,
  fetchReactions,
  updateProfile,
  ApiError,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useNotify } from '@/components/toast'
import { PageTransition } from '@/components/motion'
import type { Article } from '@/lib/types'

const easeOut = [0.16, 1, 0.3, 1] as const

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

function AccountTab() {
  const { user } = useAuth()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(user?.username ?? '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')

  useEffect(() => {
    if (user?.username) setUsername(user.username)
  }, [user?.username])

  const rename = useMutation({
    mutationFn: () => updateProfile(username),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      notify.success(`用户名已更新为「${res.user.username}」`)
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '修改失败'),
  })

  const changePw = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: () => {
      setCurrentPw('')
      setNewPw('')
      notify.success('密码已更新，下次登录请使用新密码')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '修改失败'),
  })

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRoundCog className="h-4 w-4 text-accent" />
          个人资料
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">邮箱（登录账号，不可修改）</label>
            <input value={user?.email ?? ''} disabled className={`${inputClass} opacity-60`} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <motion.button
            type="button"
            onClick={() => {
              if (!username.trim()) {
                notify.error('用户名不能为空')
                return
              }
              rename.mutate()
            }}
            disabled={rename.isPending || username === user?.username}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {rename.isPending ? '保存中...' : '保存资料'}
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4, ease: easeOut }}
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-accent" />
          修改密码
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">当前密码</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">新密码（至少 8 位）</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <motion.button
            type="button"
            onClick={() => {
              if (!currentPw || !newPw) {
                notify.error('请填写当前密码和新密码')
                return
              }
              changePw.mutate()
            }}
            disabled={changePw.isPending}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {changePw.isPending ? '提交中...' : '更新密码'}
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.4, ease: easeOut }}
        className="flex items-start gap-2.5 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground"
      >
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>账户安全提示：密码至少 8 位，建议混合字母、数字与符号；不要与其他网站使用相同密码。</span>
      </motion.div>
    </div>
  )
}

function MyArticlesTab() {
  const { user } = useAuth()
  const notify = useNotify()
  const queryClient = useQueryClient()

  const draftsQuery = useQuery({
    queryKey: ['me', 'articles', 'draft'],
    queryFn: () => fetchArticles({ page: 1, page_size: 50, status: 'draft' }),
  })
  const publishedQuery = useQuery({
    queryKey: ['me', 'articles', 'published'],
    queryFn: () => fetchArticles({ page: 1, page_size: 50 }),
  })

  const mine = (publishedQuery.data?.articles ?? [])
    .filter((a) => a.author.id === user?.id)
    .concat(draftsQuery.data?.articles ?? [])

  if (draftsQuery.isLoading || publishedQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          还没有发布过文章
        </div>
      ) : (
        mine.map((article: Article, i) => (
          <motion.div
            key={article.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/posts/${article.slug}`}
                  className="truncate font-medium transition-colors hover:text-accent"
                >
                  {article.title}
                </Link>
                {article.status === 'published' ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    已发布
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                    草稿
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {article.views}
                </span>
                <span>
                  更新于 {new Date(article.updated_at).toLocaleDateString('zh-CN')}
                </span>
              </p>
            </div>
            <div className="ml-4 shrink-0 text-xs text-muted-foreground">
              <Link href={`/posts/${article.slug}`} className="transition-colors hover:text-accent">
                查看
              </Link>
            </div>
          </motion.div>
        ))
      )}
    </div>
  )
}

function MyCommentsTab() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'comments'],
    queryFn: () => fetchMyComments({ page: 1, page_size: 50 }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'comments'] })
      notify.success('评论已删除')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    )
  }

  const comments = data?.comments ?? []
  if (comments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        还没有发表过评论
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {comments.map((c, i) => (
        <motion.div
          key={c.id}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {c.article_slug ? (
                <Link
                  href={`/posts/${c.article_slug}`}
                  className="font-medium text-foreground transition-colors hover:text-accent"
                >
                  {c.article_title}
                </Link>
              ) : (
                (c.article_title ?? '文章')
              )}
              {' · '}
              {new Date(c.created_at).toLocaleString('zh-CN')}
            </p>
            <button
              onClick={async () => {
                const ok = await notify.confirm({
                  title: '删除这条评论？',
                  message: '删除后无法恢复。',
                  confirmText: '删除',
                  danger: true,
                })
                if (ok) deleteMutation.mutate(c.id)
              }}
              disabled={deleteMutation.isPending}
              className="text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-50"
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{c.content}</p>
        </motion.div>
      ))}
    </div>
  )
}

export default function MePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'account' | 'articles' | 'comments'>('account')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="skeleton h-40 rounded-xl" />
      </div>
    )
  }

  const tabs = [
    { key: 'account' as const, label: '账户安全', icon: UserRoundCog },
    { key: 'articles' as const, label: '我的文章', icon: FileText },
    { key: 'comments' as const, label: '我的评论', icon: MessageSquare },
  ]

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-6"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent/15 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-2xl font-black text-accent">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{user.username}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
            </div>
            {user.role === 'admin' && (
              <span className="ml-auto rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                管理员
              </span>
            )}
          </div>
        </motion.div>

        <div className="mt-6 flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm transition-colors ${
                tab === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="me-tab-pill"
                  className="absolute inset-0 rounded-md bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon className="relative h-4 w-4" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOut }}
          className="mt-4"
        >
          {tab === 'account' ? <AccountTab /> : tab === 'articles' ? <MyArticlesTab /> : <MyCommentsTab />}
        </motion.div>
      </div>
    </PageTransition>
  )
}
