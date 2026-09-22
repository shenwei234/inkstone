'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ClipboardCopy,
  GitBranch,
  Play,
  Rocket,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react'
import {
  applySystemUpdate,
  fetchUpdateInfo,
  fetchUpdateScript,
  fetchUpdateStatus,
  saveUpdateConfig,
  saveUpdateManifest,
  ApiError,
  type UpdateStatus,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import { GsapPulse, GsapProgress, GsapReveal, GsapSpinner } from '@/components/gsap'

export default function AdminUpdatesPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const logRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef<string | undefined>(undefined)

  // 高级设置（更新源 / 脚本路径 / 自动重启）
  const [manifestUrl, setManifestUrl] = useState('')
  const [scriptPath, setScriptPath] = useState('/usr/local/bin/inkstone-update.sh')
  const [autoRestart, setAutoRestart] = useState(true)
  const [copied, setCopied] = useState(false)

  const infoQuery = useQuery({ queryKey: ['admin', 'updates'], queryFn: fetchUpdateInfo })
  const statusQuery = useQuery({
    queryKey: ['admin', 'updates', 'status'],
    queryFn: fetchUpdateStatus,
    refetchInterval: (query) => (query.state.data?.status?.phase === 'running' ? 2000 : false),
    refetchOnWindowFocus: false,
  })
  const scriptQuery = useQuery({ queryKey: ['admin', 'updates', 'script'], queryFn: fetchUpdateScript })

  const status: UpdateStatus | undefined = statusQuery.data?.status
  const running = status?.running ?? false
  const scriptInstalled = status?.script_exists ?? false
  const current = infoQuery.data?.current ?? '…'

  useEffect(() => {
    const manifest = infoQuery.data?.manifest_url
    if (manifest === undefined) return
    const t = setTimeout(() => setManifestUrl(manifest), 0)
    return () => clearTimeout(t)
  }, [infoQuery.data])

  // 更新中自动滚动日志到底部
  useEffect(() => {
    if (running) {
      const el = logRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [status?.logs, running])

  // 更新完成 / 失败时提示一次
  useEffect(() => {
    const phase = status?.phase
    if (!phase || phase === prevPhase.current) return
    prevPhase.current = phase
    if (phase === 'success') notify.success('更新完成，服务已重启')
    if (phase === 'failed') notify.error('更新失败，请查看运行日志')
  }, [status?.phase, notify])

  const apply = useMutation({
    mutationFn: applySystemUpdate,
    onSuccess: () => {
      notify.success('已开始更新，请等待完成')
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates', 'status'] })
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '启动更新失败'),
  })

  const saveCfg = useMutation({
    mutationFn: () =>
      saveUpdateConfig({ script_path: scriptPath || undefined, auto_restart: autoRestart }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates', 'status'] })
      notify.success('更新配置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存配置失败'),
  })

  const saveManifest = useMutation({
    mutationFn: () => saveUpdateManifest(manifestUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] })
      notify.success('更新源已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const handleUpdate = async () => {
    const ok = await notify.confirm({
      title: '确认立即更新？',
      message: '将执行服务器更新脚本（拉取最新版本并重启服务），期间前台可能短暂中断。',
      confirmText: '立即更新',
    })
    if (ok) apply.mutate()
  }

  const copyScript = async () => {
    const script = scriptQuery.data?.script ?? ''
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      notify.error('复制失败，请手动复制')
    }
  }

  const timeLabel = (s?: string) => {
    if (!s) return '—'
    return new Date(s).toLocaleString('zh-CN')
  }

  const phaseBadge = () => {
    if (!status) return null
    const base = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm'
    if (status.phase === 'success')
      return (
        <span className={`${base} border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300`}>
          <CheckCircle2 className="h-3.5 w-3.5" /> {status.message}
        </span>
      )
    if (status.phase === 'failed')
      return (
        <span className={`${base} border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300`}>
          <XCircle className="h-3.5 w-3.5" /> {status.message}
        </span>
      )
    if (status.phase === 'running')
      return (
        <span className={`${base} border-accent/40 bg-accent/5 text-accent`}>
          <GsapSpinner size={14} className="border-current border-t-transparent" /> {status.message}
        </span>
      )
    return <span className={`${base} border-border bg-background text-muted-foreground`}>{status.message}</span>
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
        <p className="mt-1 text-sm text-muted-foreground">一键拉取最新版本并重启服务</p>
      </div>

      {/* ===== 一键更新主卡片 ===== */}
      <GsapReveal
        y={16}
        className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-5"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30">
            <Rocket className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">当前版本</p>
            <p className="text-2xl font-bold tracking-tight">v{current}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {phaseBadge()}
          <GsapPulse active={!running && scriptInstalled} color="16, 185, 129">
            <button
              type="button"
              onClick={handleUpdate}
              disabled={running || apply.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? (
                <>
                  <GsapSpinner size={16} className="border-current border-t-transparent" />
                  更新中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  一键全部更新
                </>
              )}
            </button>
          </GsapPulse>
        </div>
      </GsapReveal>

      {/* ===== 未安装脚本提示 ===== */}
      {!scriptInstalled && (
        <GsapReveal
          y={12}
          delay={0.05}
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <Wrench className="h-4 w-4" />
            尚未检测到更新脚本
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/80">
            首次使用需在服务器安装更新脚本（负责拉取最新版本并重启服务）。展开下方「部署设置」查看安装命令。
          </p>
        </GsapReveal>
      )}

      {/* ===== 进度 + 运行日志 ===== */}
      {(running || (status?.logs ?? []).length > 0) && (
        <GsapReveal y={12} className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" />
              更新进度
            </p>
            {status?.finished_at && (
              <span className="text-xs text-muted-foreground">
                上次更新：{timeLabel(status.finished_at)}
                {status.phase === 'success' ? ' ✅' : status.phase === 'failed' ? ' ❌' : ''}
              </span>
            )}
          </div>

          <GsapProgress className="mt-3" indeterminate={running} value={running ? undefined : 100} />

          <div
            ref={logRef}
            className="mt-4 max-h-72 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 dark:bg-black/50"
          >
            {(status?.logs ?? []).length === 0 ? (
              <span className="text-gray-400">等待脚本输出...</span>
            ) : (
              (status?.logs ?? []).map((line, i) => (
                <div key={i} className={line.includes('失败') || line.includes('error') ? 'text-red-400' : ''}>
                  {line}
                </div>
              ))
            )}
          </div>
        </GsapReveal>
      )}

      {/* ===== 部署设置（高级，默认折叠） ===== */}
      <GsapReveal y={12} delay={0.1} className="mt-4 rounded-2xl border border-border bg-card p-5">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-accent" />
            部署设置
            <span className="text-xs font-normal text-muted-foreground">（更新源 / 脚本路径 / 安装）</span>
          </summary>

          <div className="mt-4 space-y-5">
            {/* 更新脚本路径 + 自动重启 */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">更新脚本路径</span>
                <input
                  type="text"
                  value={scriptPath}
                  onChange={(e) => setScriptPath(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <div className="flex items-end gap-3">
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoRestart}
                    onChange={(e) => setAutoRestart(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  更新后自动重启服务
                </label>
                <button
                  type="button"
                  onClick={() => saveCfg.mutate()}
                  disabled={saveCfg.isPending}
                  className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {saveCfg.isPending ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>

            {/* 更新源 */}
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                更新源（可选，用于记录新版本信息）
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={manifestUrl}
                  onChange={(e) => setManifestUrl(e.target.value)}
                  placeholder="https://example.com/blog/manifest.json"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3.5 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!manifestUrl.trim()) {
                      notify.error('请填写清单地址')
                      return
                    }
                    saveManifest.mutate()
                  }}
                  disabled={saveManifest.isPending}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {saveManifest.isPending ? '保存中...' : '保存更新源'}
                </button>
              </div>
            </div>

            {/* 安装脚本 */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">安装更新脚本</p>
                <button
                  type="button"
                  onClick={copyScript}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-95"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copied ? '已复制' : '复制脚本'}
                </button>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100 dark:bg-black/50">
                {`sudo mkdir -p "$(dirname ${status?.script_path ?? scriptPath})" && \\
sudo cat > ${status?.script_path ?? scriptPath} <<'EOF'
${scriptQuery.data?.script ?? ''}
EOF
sudo chmod +x ${status?.script_path ?? scriptPath}
echo "已安装更新脚本"`}
              </pre>
            </div>
          </div>
        </details>
      </GsapReveal>
    </div>
  )
}
