'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  CloudDownload,
  Download,
  Gauge,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  Rocket,
  ScrollText,
  Server,
  Settings2,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react'
import type {
  UpdateRecord,
  UpdateState,
  UpdateSettingsInput,
  MirrorLatency,
  ChangelogEntry,
} from '@/lib/types'
import {
  ApiError,
  checkUpdate,
  fetchChangelog,
  fetchUpdateStatus,
  rollbackUpdate,
  runUpdate,
  saveUpdateSettings,
  testUpdateMirrors,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import { PageTransition } from '@/components/motion'
import { formatSize, inputClass, relativeTime } from '@/lib/ui'

const easeOut = [0.16, 1, 0.3, 1] as const

const phaseLabels: Record<string, string> = {
  checking: '正在检查新版本',
  downloading: '正在下载镜像包',
  verifying: '正在校验完整性',
  loading: '正在加载镜像',
  deploying: '正在替换容器并重启',
  done: '已完成',
}

const triggerLabels: Record<string, string> = {
  auto: '自动',
  manual: '手动',
  rollback: '回滚',
}

function Section({
  icon,
  title,
  extra,
  children,
  delay = 0,
}: {
  icon: React.ReactNode
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.section
      // 进入视口才播放入场（长页面不会一次性全播），hover 微浮增强层次
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      whileHover={{ y: -2 }}
      transition={{ delay, duration: 0.4, ease: easeOut }}
      className="rounded-xl border border-border bg-card transition-shadow hover:shadow-md hover:shadow-accent/5"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </motion.section>
  )
}

/** 更新五阶段步骤条：当前步脉冲高亮，已完成步打勾 */
const updateSteps = [
  { key: 'checking', label: '检查' },
  { key: 'downloading', label: '下载' },
  { key: 'verifying', label: '校验' },
  { key: 'loading', label: '加载' },
  { key: 'deploying', label: '部署' },
]

function StepProgress({ phase }: { phase: string }) {
  const current = updateSteps.findIndex((s) => s.key === phase)
  return (
    <ol className="flex items-center gap-1">
      {updateSteps.map((step, i) => {
        const done = current > i || phase === 'done'
        const active = current === i
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-accent text-white'
                      : 'bg-muted text-muted-foreground'
                } ${active ? 'animate-pulse' : ''}`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-accent' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < updateSteps.length - 1 && (
              <span
                className={`mb-4 h-0.5 flex-1 rounded-full transition-colors ${
                  done ? 'bg-emerald-500' : 'bg-muted'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-border'
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
        />
      </button>
    </div>
  )
}

function GhostButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        danger
          ? 'text-muted-foreground hover:border-red-500/40 hover:text-red-500'
          : 'text-muted-foreground hover:border-accent/40 hover:text-accent'
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: UpdateRecord['status'] }) {
  if (status === 'running') {
    return <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">进行中</span>
  }
  if (status === 'success') {
    return <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">成功</span>
  }
  return <span className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">失败</span>
}

/** 更新说明按行渲染：- / • / 数字. 开头转列表项，其余纯文本 */
function NotesBlock({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      {lines.map((line, i) => {
        const m = line.match(/^([-*•]|\d+[.、)])\s*(.*)$/)
        if (m) {
          return (
            <p key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />
              <span>{m[2]}</span>
            </p>
          )
        }
        return (
          <p key={i} className="text-xs leading-relaxed text-muted-foreground">
            {line}
          </p>
        )
      })}
    </div>
  )
}

export default function AdminUpdatesPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<UpdateSettingsInput | null>(null)

  const statusQuery = useQuery({
    queryKey: ['update', 'status'],
    queryFn: fetchUpdateStatus,
    refetchInterval: (query) => (query.state.data?.update.task ? 2000 : 30000),
    // 切 tab 回来不立即重复拉取（30s 轮询已覆盖新鲜度），减少无谓请求
    refetchOnWindowFocus: false,
  })
  const state: UpdateState | undefined = statusQuery.data?.update
  const running = !!state?.task

  // 内置 changelog（5 分钟缓存，更新流程不依赖它）
  const changelogQuery = useQuery({
    queryKey: ['update', 'changelog'],
    queryFn: fetchChangelog,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // 加速源延迟探测结果（url → 探测项；latency_ms < 0 表示不可用）
  const [latencyMap, setLatencyMap] = useState<Record<string, MirrorLatency>>({})

  // 表单初始化（延迟一个 tick 执行，避免 effect 内同步 setState）。
  // initializedRef 保证只初始化一次：30s 轮询会让 remoteSettings 引用变化，
  // 若不 guarded 会把用户正在编辑的表单重置掉。
  const initializedRef = useRef(false)
  const remoteSettings = state?.settings
  useEffect(() => {
    if (initializedRef.current || !remoteSettings) return
    const t = setTimeout(() => {
      setForm({
        auto_update: remoteSettings.auto_update,
        interval_mins: remoteSettings.interval_mins,
        repo: remoteSettings.repo,
        mirrors: remoteSettings.mirrors,
      })
      initializedRef.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [remoteSettings])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['update', 'status'] })

  const checkMut = useMutation({
    mutationFn: checkUpdate,
    onSuccess: (res) => {
      invalidate()
      if (res.remote.version === state?.current_version) {
        notify.success('当前已是最新版本')
      } else {
        notify.success(`发现新版本 ${res.remote.version}`)
      }
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '检查失败'),
  })

  const runMut = useMutation({
    mutationFn: runUpdate,
    onSuccess: () => {
      invalidate()
      notify.success('更新已启动，容器替换期间服务会短暂重启')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '启动更新失败'),
  })

  const rollbackMut = useMutation({
    mutationFn: rollbackUpdate,
    onSuccess: () => {
      invalidate()
      notify.success('回滚已启动')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '启动回滚失败'),
  })

  const saveMut = useMutation({
    mutationFn: (input: UpdateSettingsInput) => saveUpdateSettings(input),
    onSuccess: () => {
      invalidate()
      notify.success('更新设置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const mirrorTestMut = useMutation({
    mutationFn: testUpdateMirrors,
    onSuccess: (res) => {
      const map: Record<string, MirrorLatency> = {}
      for (const item of res.mirrors) {
        if (!item.direct) map[item.url] = item
      }
      setLatencyMap(map)
      const best = res.mirrors.find((m) => m.latency_ms >= 0)
      notify.success(best ? `最快源 ${best.latency_ms}ms：${best.url}` : '所有源均不可达')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '测速失败'),
  })

  const onRun = async () => {
    const ok = await notify.confirm({
      title: '确认立即更新系统',
      message: '将自动下载镜像包并替换 backend / frontend 容器，过程约 1-3 分钟，期间站点会短暂无法访问。更新失败会自动回滚。',
      confirmText: '立即更新',
    })
    if (ok) runMut.mutate()
  }

  const onRollback = async () => {
    const ok = await notify.confirm({
      title: '确认回滚系统',
      message: '将把系统回退到上一次更新前的版本，容器同样会自动替换重启。',
      confirmText: '回滚',
      danger: true,
    })
    if (ok) rollbackMut.mutate()
  }

  if (statusQuery.isLoading || !state || !form) {
    // 渐进加载：页头与操作按钮常驻，仅数据区出骨架（避免整页 skeleton 跳变）
    return (
      <PageTransition>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              全自动更新：定时检查新版本并自动完成 下载 → 校验 → 加载 → 容器替换，无需登录服务器
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            加载中
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
        <div className="mt-4 skeleton h-28 rounded-xl" />
      </PageTransition>
    )
  }

  const remote = state?.remote

  return (
    <PageTransition>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全自动更新：定时检查新版本并自动完成 下载 → 校验 → 加载 → 容器替换，无需登录服务器
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => checkMut.mutate()}
          disabled={checkMut.isPending || running}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${checkMut.isPending ? 'animate-spin' : ''}`} />
          检查更新
        </motion.button>
      </div>

      {/* Docker 环境不可用警示 */}
      {!state.docker.available && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOut }}
          className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            自动更新不可用
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            backend 容器未挂载 Docker 套接字：{state.docker.message || '未检测到 docker.sock'}。
            请在宿主机的 docker-compose 文件中为 backend 服务增加挂载后重建：
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
{`services:
  backend:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro`}
          </pre>
        </motion.div>
      )}

      {/* 新版本横幅（最醒目的状态引导） */}
      {state.has_update && remote && !running && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOut }}
          className="mt-4 flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-r from-accent/15 via-accent/5 to-purple-500/10 p-4"
        >
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30"
          >
            <ArrowUpCircle className="h-6 w-6" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              发现新版本 {remote.version}
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                建议更新
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {state.settings.auto_update
                ? '自动更新已开启，系统将在下一个检查周期（' + state.settings.interval_mins + ' 分钟内）自动完成；也可立即手动更新。'
                : '自动更新已关闭，可点击下方按钮手动更新。'}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onRun}
            disabled={!state.docker.available}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            <ArrowUpCircle className="h-4 w-4" />
            立即更新
          </motion.button>
        </motion.div>
      )}

      {/* 版本对比 */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Section icon={<Server className="h-4 w-4 text-accent" />} title="当前运行版本">
          <div className="flex items-center gap-3">
            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              {state.current_version}
            </span>
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              运行中
            </motion.span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p>{state.checked_at ? `上次检查：${relativeTime(state.checked_at)}` : '尚未检查远端版本'}</p>
            <p className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-1.5 w-1.5 rounded-full ${
                  state.docker.available ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              {state.docker.available ? 'Docker 已连接，自动更新就绪' : 'Docker 未连接，自动更新不可用'}
            </p>
          </div>
        </Section>

        <Section
          icon={<CloudDownload className="h-4 w-4 text-accent" />}
          title="最新发布版本"
          extra={
            state.has_update ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                有可用更新
              </span>
            ) : remote ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                已是最新
              </span>
            ) : null
          }
        >
          {remote ? (
            <>
              <div className="flex items-center gap-3">
                <span className="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {remote.version}
                </span>
                {remote.released_at && (
                  <span className="text-xs text-muted-foreground">{remote.released_at.slice(0, 10)} 发布</span>
                )}
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>镜像包大小：{remote.size > 0 ? formatSize(remote.size) : '未知'}</p>
                <p className="truncate" title={remote.sha256}>
                  SHA256：{remote.sha256 ? remote.sha256.slice(0, 24) + '…' : '未提供'}
                </p>
                <p className="truncate" title={remote.mirror}>
                  清单来源：{remote.mirror}
                </p>
              </div>
              {remote.notes && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-muted px-3 py-2">
                  <NotesBlock text={remote.notes} />
                </div>
              )}
              {state.has_update && (
                <GhostButton onClick={onRun} disabled={running || !state.docker.available}>
                  <ArrowUpCircle className="h-4 w-4" />
                  更新到 {remote.version}
                </GhostButton>
              )}
            </>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {state.last_error ? (
                <span className="text-red-500">{state.last_error}</span>
              ) : (
                '点击右上角「检查更新」获取最新版本'
              )}
            </div>
          )}
        </Section>
      </div>

      {/* 进行中的任务 */}
      {running && state.task && (
        <Section
          icon={<Gauge className="h-4 w-4 text-accent" />}
          title={`正在${state.task.type === 'rollback' ? '回滚' : '更新'} → ${state.task.to_version}`}
          extra={<StatusBadge status={state.task.status} />}
          delay={0.05}
        >
          {/* 五阶段步骤条 */}
          <StepProgress phase={state.task.phase} />
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{phaseLabels[state.task.phase] ?? state.task.phase}</span>
            <span className="font-mono font-bold text-accent">{state.task.progress}%</span>
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            {/* scaleX 走合成层，比 width 动画不触发 layout/paint */}
            <motion.div
              className="h-full w-full origin-left rounded-full bg-accent"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.max(state.task.progress, 3) / 100 }}
              transition={{ duration: 0.4, ease: easeOut }}
            />
            {/* 流光叠加：明确「正在进行」 */}
            {state.task.status === 'running' && (
              <div className="pointer-events-none absolute inset-0 skeleton rounded-full opacity-40" />
            )}
          </div>
          {state.task.detail && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{state.task.detail}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            容器替换期间站点会短暂无法访问，请稍候；完成后本页会自动刷新。
          </p>
        </Section>
      )}

      {/* 更新历史 */}
      <div className="mt-4">
        <Section
          icon={<History className="h-4 w-4 text-accent" />}
          title="更新历史"
          delay={0.1}
          extra={
            state.rollback_tag && !running && state.docker.available ? (
              <button
                type="button"
                onClick={onRollback}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                回滚到上一版本
              </button>
            ) : null
          }
        >
          {state.history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无更新记录</p>
          ) : (
            <ul className="list-stagger divide-y divide-border">
              {state.history.map((rec) => (
                <li key={rec.id} className="flex gap-3 py-3">
                  {/* 左侧状态色条 */}
                  <span
                    className={`mt-0.5 w-1 shrink-0 self-stretch rounded-full ${
                      rec.status === 'success'
                        ? 'bg-emerald-500'
                        : rec.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-amber-500'
                    }`}
                  />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white ${
                        rec.type === 'rollback' ? 'bg-amber-500' : 'bg-accent'
                      }`}
                    >
                      {rec.type === 'rollback' ? <RotateCcw className="h-3 w-3" /> : null}
                      {rec.type === 'rollback' ? ' 回滚' : '更新'}
                    </span>
                    <span className="text-sm font-medium">
                      {rec.from_version} <ArrowUpCircle className="inline h-3 w-3 text-muted-foreground" /> {rec.to_version}
                    </span>
                    <StatusBadge status={rec.status} />
                    <span className="text-xs text-muted-foreground">
                      {triggerLabels[rec.triggered_by] ?? rec.triggered_by} · {relativeTime(rec.started_at)}
                    </span>
                    {rec.detail && (
                      <p className="w-full text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 版本更新记录（内置 changelog） */}
      <div className="mt-4">
        <Section icon={<ScrollText className="h-4 w-4 text-accent" />} title="版本更新记录" delay={0.12}>
          {changelogQuery.isLoading ? (
            <div className="skeleton h-24 rounded-lg" />
          ) : changelogQuery.data?.changelog?.length ? (
            <ol className="list-stagger space-y-3">
              {changelogQuery.data.changelog.slice(0, 6).map((entry: ChangelogEntry) => {
                const isCurrent = entry.version === changelogQuery.data?.current
                return (
                  <li
                    key={entry.version}
                    className={`rounded-lg px-4 py-3 transition-colors ${
                      isCurrent
                        ? 'border border-accent/30 bg-accent/5'
                        : 'border border-border bg-background hover:border-accent/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{entry.version}</span>
                      {isCurrent && (
                        <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                          当前
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                    <NotesBlock text={entry.items.map((i) => `- ${i}`).join('\n')} className="mt-1.5" />
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无更新记录</p>
          )}
        </Section>
      </div>

      {/* 更新设置 */}
      <div className="mt-4">
        <Section
          icon={<Settings2 className="h-4 w-4 text-accent" />}
          title="更新设置"
          delay={0.15}
          extra={
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() =>
                saveMut.mutate({
                  auto_update: form.auto_update,
                  interval_mins: Number(form.interval_mins) || 15,
                  repo: form.repo,
                  mirrors: (form.mirrors ?? []).map((s) => s.trim()).filter(Boolean),
                })
              }
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              保存设置
            </motion.button>
          }
        >
          <Toggle
            checked={!!form.auto_update}
            onChange={(v) => setForm((f) => (f ? { ...f, auto_update: v } : f))}
            label="自动更新"
            desc="开启后按下面间隔自动检查，发现新版本自动完成下载与部署；关闭则只在后台手动更新"
          />
          <div className="grid gap-4 border-t border-border py-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">检查间隔（分钟）</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={form.interval_mins ?? 15}
                onChange={(e) => setForm((f) => (f ? { ...f, interval_mins: Number(e.target.value) } : f))}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">发布仓库（owner/repo）</span>
              <input
                type="text"
                value={form.repo ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, repo: e.target.value } : f))}
                placeholder="shenwei234/inkstone"
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <div className="border-t border-border py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">GitHub 加速源</span>
              <button
                type="button"
                onClick={() => mirrorTestMut.mutate()}
                disabled={mirrorTestMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                <Timer className={`h-3.5 w-3.5 ${mirrorTestMut.isPending ? 'animate-spin' : ''}`} />
                {mirrorTestMut.isPending ? '测速中…' : '测试延迟'}
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {(form.mirrors ?? []).map((m, i) => {
                const latency = latencyMap[m]
                return (
                  <li key={`${m}-${i}`} className="flex items-center gap-2">
                    <input
                      value={m}
                      onChange={(e) =>
                        setForm((f) =>
                          f ? { ...f, mirrors: (f.mirrors ?? []).map((x, j) => (j === i ? e.target.value : x)) } : f
                        )
                      }
                      placeholder="https://ghfast.top/"
                      className={`${inputClass} font-mono text-xs`}
                    />
                    {latency &&
                      (latency.latency_ms >= 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Zap className="h-3 w-3" />
                          {latency.latency_ms}ms
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                          不可达
                        </span>
                      ))}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => (f ? { ...f, mirrors: (f.mirrors ?? []).filter((_, j) => j !== i) } : f))
                      }
                      className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                      aria-label="删除该加速源"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3">
              <GhostButton onClick={() => setForm((f) => (f ? { ...f, mirrors: [...(f.mirrors ?? []), ''] } : f))}>
                <Plus className="h-3.5 w-3.5" />
                添加一行
              </GhostButton>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              实例端下载 GitHub 镜像包时自动测速并优先使用最快的源，失败自动切换重试；列表为空时使用内置加速源。
            </p>
          </div>
        </Section>
      </div>

      {/* 发布指引 */}
      <div className="mt-4">
        <Section icon={<Rocket className="h-4 w-4 text-accent" />} title="如何发布新版本" delay={0.2}>
          <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
            <li>在本地运行发布脚本构建镜像包：<code className="rounded bg-muted px-1">scripts\release.ps1 -Version Beta1.15</code></li>
            <li>
              打开独立的「更新推送后台」（update-hub），登录后在发布页上传镜像包
              <code className="rounded bg-muted px-1">inkstone-images.tar</code>，填写版本号与更新说明。
            </li>
            <li>发布后所有实例会在下一个检查周期（默认 15 分钟）内自动拉取更新，本页会显示进度。</li>
            <li>更新失败会自动回滚到更新前版本；也可在「更新历史」中一键手动回滚。</li>
          </ol>
        </Section>
      </div>
    </PageTransition>
  )
}
