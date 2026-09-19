'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  FileText,
  Filter,
  KeyRound,
  Link2,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  User,
  XCircle,
} from 'lucide-react'
import { fetchLogs, fetchLogStats } from '@/lib/api'
import type { OperationLog } from '@/lib/api'
import { PageTransition, StaggerList, StaggerItem } from '@/components/motion'

const easeOut = [0.16, 1, 0.3, 1] as const

const CATEGORIES: { key: string; label: string; icon: typeof User }[] = [
  { key: '', label: '全部', icon: ScrollText },
  { key: 'auth', label: '登录认证', icon: KeyRound },
  { key: 'article', label: '文章', icon: FileText },
  { key: 'user', label: '用户', icon: User },
  { key: 'comment', label: '评论', icon: MessageSquare },
  { key: 'setting', label: '设置', icon: Settings },
  { key: 'file', label: '文件', icon: Filter },
  { key: 'link', label: '友链', icon: Link2 },
]

function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export default function AdminLogsPage() {
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'logs', category, query, page],
    queryFn: () =>
      fetchLogs({
        page,
        page_size: 30,
        category: category || undefined,
        q: query || undefined,
      }),
    refetchOnWindowFocus: false,
  })

  const statsQuery = useQuery({
    queryKey: ['admin', 'logs', 'stats'],
    queryFn: fetchLogStats,
    refetchOnWindowFocus: false,
  })

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <PageTransition>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">网站日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            记录管理员与用户的关键操作，保留最近 90 天
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-accent"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 分类筛选 + 搜索 */}
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => {
            const count = c.key ? statsQuery.data?.stats[c.key] : undefined
            return (
              <button
                key={c.key}
                onClick={() => {
                  setCategory(c.key)
                  setPage(1)
                }}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  category === c.key
                    ? 'bg-accent text-white'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <c.icon className="h-3.5 w-3.5" />
                {c.label}
                {count !== undefined && count > 0 && (
                  <span className="opacity-70">{count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setQuery(keyword)
                setPage(1)
              }
            }}
            placeholder="搜索操作/IP，回车"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      {/* 日志列表 */}
      {isLoading ? (
        <div className="mt-5 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-16 text-center">
          <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">暂无日志记录</p>
        </div>
      ) : (
        <StaggerList className="mt-5 space-y-2">
          {logs.map((log: OperationLog, i: number) => (
            <StaggerItem key={log.id}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25, ease: easeOut }}
                className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-accent/30"
              >
                <span
                  className={`mt-0.5 shrink-0 ${
                    log.success ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {log.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{log.action}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {categoryLabel(log.category)}
                    </span>
                  </div>
                  {log.detail && (
                    <p className="mt-1 break-all text-xs text-muted-foreground">{log.detail}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                    {log.username && <span>👤 {log.username}</span>}
                    {log.ip && <span>🌐 {log.ip}</span>}
                    <span>{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                  </p>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* 分页 */}
      {total > 30 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </PageTransition>
  )
}
