'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createPage,
  deletePage,
  fetchAdminPage,
  fetchAdminPages,
  updatePage,
  ApiError,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import { RichEditor } from '@/components/rich-editor'
import { PageTransition } from '@/components/motion'
import type { PageItem } from '@/lib/api'

const templates = [
  { value: 'default', label: '常规页（居中内容）' },
  { value: 'fullwidth', label: '通栏页（大标题居中）' },
  { value: 'landing', label: '自定义模板（HTML + {{content}}）' },
]

function PageEditor({
  pageId,
  initial,
}: {
  pageId?: number
  initial?: PageItem
}) {
  const router = useRouter()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [template, setTemplate] = useState(initial?.template ?? 'default')
  const [status, setStatus] = useState(initial?.status ?? 'published')
  const [showInNav, setShowInNav] = useState(initial?.show_in_nav ?? false)
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)

  const mutation = useMutation({
    mutationFn: () => {
      const body = { title, content, template, status, sort_order: sortOrder, show_in_nav: showInNav }
      if (pageId) return updatePage(pageId, body)
      return createPage(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] })
      notify.success(pageId ? '页面已保存' : '页面已创建')
      router.push('/admin/pages')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      notify.error('页面标题不能为空')
      return
    }
    mutation.mutate()
  }

  const isLanding = template === 'landing'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="页面标题..."
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3 text-xl font-semibold outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
        >
          {templates.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInNav}
            onChange={(e) => setShowInNav(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--accent)]"
          />
          加入导航菜单建议位
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          排序
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {isLanding ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          placeholder={'整页 HTML，{{content}} 会替换为富文本内容。\n例如：<div class="hero"><h1>欢迎</h1>{{content}}</div>'}
          className="w-full resize-y rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      ) : (
        <RichEditor content={content} onChange={setContent} variant="plain" />
      )}

      <div className="flex items-center gap-3">
        <motion.button
          type="submit"
          disabled={mutation.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          {mutation.isPending ? '保存中...' : pageId ? '保存页面' : '创建页面'}
        </motion.button>
        <Link
          href="/admin/pages"
          className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          取消
        </Link>
      </div>
    </form>
  )
}

export function PageList() {
  const notify = useNotify()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'pages'],
    queryFn: fetchAdminPages,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] })
      notify.success('页面已删除')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  return (
    <PageTransition>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">页面管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            独立页面（关于、友链、联系方式等），支持三种模板
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/admin/pages/new"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/25"
          >
            <Plus className="h-4 w-4" />
            新建页面
          </Link>
        </motion.div>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : (data?.pages ?? []).length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">还没有页面，点击「新建页面」创建</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {(data?.pages ?? []).map((page, i) => (
            <motion.div
              key={page.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-accent/30"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/p/${page.slug}`}
                    target="_blank"
                    className="truncate font-medium transition-colors hover:text-accent"
                  >
                    {page.title}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      page.status === 'published'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {page.status === 'published' ? '已发布' : '草稿'}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {templates.find((t) => t.value === page.template)?.label ?? page.template}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  /p/{page.slug} · 排序 {page.sort_order ?? 0}
                  {page.show_in_nav ? ' · 建议加入导航' : ''}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-1 text-sm">
                <Link
                  href={`/admin/pages/edit/${page.id}`}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> 编辑
                </Link>
                <button
                  onClick={async () => {
                    const ok = await notify.confirm({
                      title: `删除页面「${page.title}」？`,
                      message: '删除后无法恢复。',
                      confirmText: '删除',
                      danger: true,
                    })
                    if (ok) deleteMutation.mutate(page.id)
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </PageTransition>
  )
}

export function NewPageScreen() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">新建页面</h1>
        <p className="mt-1 text-sm text-muted-foreground">创建后可通过 /p/页面slug 访问</p>
        <div className="mt-6">
          <PageEditor />
        </div>
      </div>
    </PageTransition>
  )
}

export function EditPageScreen({ id }: { id: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'page', id],
    queryFn: () => fetchAdminPage(id),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="skeleton h-14 rounded-lg" />
        <div className="skeleton mt-4 h-96 rounded-lg" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground">
        页面不存在
      </div>
    )
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">编辑页面</h1>
        <p className="mt-1 text-sm text-muted-foreground">/p/{data.page.slug}</p>
        <div className="mt-6">
          <PageEditor key={data.page.id} pageId={data.page.id} initial={data.page} />
        </div>
      </div>
    </PageTransition>
  )
}
