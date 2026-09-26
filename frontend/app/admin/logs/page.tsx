'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  KeyRound,
  Link2,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Settings,
  Tags,
  Upload,
  User,
  XCircle,
} from 'lucide-react'
import { downloadLogs, fetchLogOverview, fetchLogs } from '@/lib/api'
import type { OperationLog } from '@/lib/api'
import { useNotify } from '@/components/toast'
import { PageTransition, StaggerList, StaggerItem } from '@/components/motion'
import { truncate } from '@/lib/ui'

const easeOut = [0.16, 1, 0.3, 1] as const

const PAGE_SIZE = 30

const CATEGORIES: { key: string; label: string; icon: typeof User }[] = [
  { key: '', label: '全部', icon: ScrollText },
  { key: 'auth', label: '登录认证', icon: KeyRound },
  { key: 'article', label: '文章', icon: FileText },
  { key: 'user', label: '用户', icon: User },
  { key: 'comment', label: '评论', icon: MessageSquare },
  { key: 'setting', label: '设置', icon: Settings },
  { key: 'file', label: '文件', icon: Upload },
  { key: 'link', label: '友链', icon: Link2 },
  { key: 'page', label: '页面', icon: FileText },
  { key: 'taxonomy', label: '分类标签', icon: Tags },
  { key: 'system', label: '系统', icon: Server },
]

// 时间范围 → from 参数（YYYY-MM-DD，本地时区）
const RANGES: { key: string; label: string }[] = [
  { key: '', label: '全部时间' },
  { key: 'today', label: '今天' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
]

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: '全部结果' },
  { key: 'success', label: '仅成功' },
  { key: 'failed', label: '仅失败' },
]

function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function rangeToFrom(range: string): string | undefined {
  if (!range) return undefined
  if (range === 'today') return formatDate(new Date())
  const days = range === '7d' ? 7 : 30
  const d = new Date()
  d.setDate(d.getDate() - days)
  return formatDate(d)
}

export default function AdminLogsPage() {
  const notify = useNotify()

  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [range, setRange] = useState('')
  const [page, setPage] = useState(1)
  const [expandedID, setExpandedID] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  const from = rangeToFrom(range)

  const logsQuery = useQuery({
    queryKey: ['admin', 'logs', category, query, status, range, page],
    queryFn: () =>
      fetchLogs({
        page,
        page_size: PAGE_SIZE,
        category: category || undefined,
        q: query || undefined,
        from,
        success: status ? status === 'success' : undefined,
      }),
    refetchOnWindowFocus: false,
  })

  const overviewQuery = useQuery({
    queryKey: ['admin', 'logs', 'overview'],
    queryFn: fetchLogOverview,
    refetchOnWindowFocus: false,
  })

  const logs = logsQuery.data?.logs ?? []
  const total = logsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const overview = overviewQuery.data?.overview

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await downloadLogs({
        category: category || undefined,
        q: query || undefined,
        from,
        success: status ? status === 'success' : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inkstone-logs-${formatDate(new Date())}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify.success('日志已导出为 CSV 文件')
    } catch (e) {
      notify.error(e instanceof Error ? `导出失败：${e.message}` : '导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">网站日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            记录管理员与用户的关键操作，保留最近 90 天，支持按条件筛选与导出
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-accent disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? '导出中…' : '导出 CSV'}
          </button>
          <button
            onClick={() => logsQuery.refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '日志总数', value: overview?.total, icon: ScrollText },
          { label: '今日新增', value: overview?.today, icon: CalendarDays },
          { label: '失败操作', value: overview?.failed, icon: XCircle },
          {
            label: '当前筛选',
            value: total,
            icon: Search,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <card.icon className="h-3.5 w-3.5" />
              {card.label}
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {card.value === undefined ? (
                <span className="skeleton inline-block h-6 w-12 rounded align-middle" />
              ) : (
                card.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* 分类筛选 + 搜索 + 状态/时间 */}
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => {
            const count = c.key ? overview?.by_category[c.key] : overview?.total
            return (
              <button
                key={c.key}
                onClick={() => {
                  setCategory(c.key)
                  setPage(1)
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  category === c.key
                    ? 'bg-accent text-white'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <c.icon className="h-3.5 w-3.5" />
                {c.label}
                {count !== undefined && count > 0 && <span className="opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
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
              placeholder="搜索操作 / 详情 / IP，回车"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 日志列表 */}
      {logsQuery.isLoading ? (
        <div className="mt-5 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-16 text-center">
          <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">暂无符合条件的日志记录</p>
        </div>
      ) : (
        <StaggerList className="mt-5 space-y-2">
          {logs.map((log: OperationLog, i: number) => {
            const expanded = expandedID === log.id
            const longDetail = log.detail.length > 48
            return (
              <StaggerItem key={log.id}>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25, ease: easeOut }}
                  className="rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-accent/30"
                >
                  <div className="flex items-start gap-3">
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
                        {!log.success && (
                          <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                            失败
                          </span>
                        )}
                      </div>

                      {log.detail && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {expanded || !longDetail ? log.detail : truncate(log.detail, 48)}
                          {longDetail && (
                            <button
                              onClick={() => setExpandedID(expanded ? null : log.id)}
                              className="ml-1.5 text-accent hover:underline"
                            >
                              {expanded ? '收起' : '展开'}
                            </button>
                          )}
                        </p>
                      )}

                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                        {log.username && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.username}
                            <span className="opacity-60">#{log.user_id}</span>
                          </span>
                        )}
                        {log.ip && <span>IP：{log.ip}</span>}
                        <span>{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                      </p>

                      {log.user_agent && (
                        <p
                          className="mt-0.5 truncate text-[10px] text-muted-foreground/60"
                          title={log.user_agent}
                        >
                          UA：{log.user_agent}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </StaggerItem>
            )
          })}
        </StaggerList>
      )}

      {/* 分页 */}
      {total > PAGE_SIZE && (
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
