'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Terminal,
  XCircle,
} from 'lucide-react'
import {
  checkSystemUpdates,
  fetchUpdateInfo,
  saveUpdateManifest,
  applySystemUpdate,
  fetchUpdateScript,
  fetchUpdateStatus,
  saveUpdateConfig,
  ApiError,
  type UpdateStatus,
  type ChangelogEntry,
  type UpdateCheckResult,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import { easeOut } from '@/components/motion'

export default function AdminUpdatesPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [manifestUrl, setManifestUrl] = useState('')
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null)
  const [scriptPath, setScriptPath] = useState('/usr/local/bin/inkstone-update.sh')
  const [autoRestart, setAutoRestart] = useState(true)
  const [copied, setCopied] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const infoQuery = useQuery({ queryKey: ['admin', 'updates'], queryFn: fetchUpdateInfo })
  const statusQuery = useQuery({
    queryKey: ['admin', 'updates', 'status'],
    queryFn: fetchUpdateStatus,
    refetchInterval: (query) => {
      const phase = query.state.data?.status?.phase
      return phase === 'running' ? 2000 : false
    },
  })
  const scriptQuery = useQuery({ queryKey: ['admin', 'updates', 'script'], queryFn: fetchUpdateScript })

  const status: UpdateStatus | undefined = statusQuery.data?.status

  useEffect(() => {
    const manifest = infoQuery.data?.manifest_url
    if (manifest === undefined) return
    const t = setTimeout(() => setManifestUrl(manifest), 0)
    return () => clearTimeout(t)
  }, [infoQuery.data])

  // 更新中自动滚到底部
  useEffect(() => {
    if (status?.running) {
      const el = logRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [status?.logs, status?.running])

  const saveManifest = useMutation({
    mutationFn: () => saveUpdateManifest(manifestUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] })
      notify.success('更新源已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const check = useMutation({
    mutationFn: checkSystemUpdates,
    onSuccess: (res) => {
      setCheckResult(res)
      if (!res.has_update) notify.success(res.message)
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '检查失败'),
  })

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

  const changelog: ChangelogEntry[] = infoQuery.data?.changelog ?? []
  const current = infoQuery.data?.current ?? '…'
  const scriptInstalled = status?.script_exists

  // 简易时间
  const timeLabel = (s?: string) => {
    if (!s) return '—'
    const d = new Date(s)
    return d.toLocaleString('zh-CN')
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
        <p className="mt-1 text-sm text-muted-foreground">版本检查、变更日志与一键在线更新</p>
      </div>

      {/* 当前版本卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
        className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-5"
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30"
          >
            <Rocket className="h-7 w-7" />
          </motion.div>
          <div>
            <p className="text-sm text-muted-foreground">当前版本</p>
            <p className="text-2xl font-bold tracking-tight">v{current}</p>
          </div>
        </div>

        {status && (
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${
                status.phase === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : status.phase === 'failed'
                    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
                    : status.phase === 'running'
                      ? 'border-accent/40 bg-accent/5 text-accent'
                      : 'border-border bg-background text-muted-foreground'
              }`}
            >
              {status.phase === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status.phase === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {status.phase === 'failed' && <XCircle className="h-3.5 w-3.5" />}
              {status.message}
            </span>
          </div>
        )}

        <motion.button
          type="button"
          onClick={() => check.mutate()}
          disabled={check.isPending || status?.running}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          {check.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              检查中...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              检查更新
            </>
          )}
        </motion.button>
      </motion.div>

      {/* ===== 一键更新 ===== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Play className="h-4 w-4 text-emerald-500" />
            一键在线更新
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>脚本：{status?.script_path ?? scriptPath}</span>
          </div>
        </div>

        {!scriptInstalled ? (
          /* —— 未安装脚本：部署引导 —— */
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
              <GitBranch className="h-4 w-4" />
              尚未检测到更新脚本
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/80">
              首次使用需在服务器上安装更新脚本。后端会在「立即更新」时执行该脚本，脚本先
              <code className="mx-1 rounded bg-muted px-1 py-0.5">docker load</code>
              新镜像，再
              <code className="mx-1 rounded bg-muted px-1 py-0.5">docker compose up -d</code>
              重启服务（离线镜像方案，无需在服务器编译）。点击下方按钮复制脚本，然后在服务器上执行安装命令：
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100 dark:bg-black/50">
              {`sudo mkdir -p "$(dirname ${status?.script_path ?? scriptPath})" && \\
sudo cat > ${status?.script_path ?? scriptPath} <<'EOF'
${scriptQuery.data?.script ?? ''}
EOF
sudo chmod +x ${status?.script_path ?? scriptPath}
echo "已安装更新脚本"`}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyScript}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-95"
              >
                <ClipboardCopy className="h-4 w-4" />
                {copied ? '已复制脚本' : '复制脚本'}
              </button>
              <span className="text-xs text-amber-600/70 dark:text-amber-300/70">
                安装完成后点击下方「保存配置」或直接「立即更新」
              </span>
            </div>

            {/* 脚本路径与自动重启配置 */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">更新脚本路径</span>
                <input
                  type="text"
                  value={scriptPath}
                  onChange={(e) => setScriptPath(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <div className="flex items-end">
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
                  className="ml-3 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {saveCfg.isPending ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* —— 已安装脚本：直接更新 —— */
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || status?.running}
              whileHover={status?.running ? undefined : { scale: 1.02 }}
              whileTap={status?.running ? undefined : { scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {status?.running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  更新中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  立即更新
                </>
              )}
            </motion.button>
            {status?.finished_at && (
              <span className="text-xs text-muted-foreground">
                上次更新：{timeLabel(status.finished_at)}
                {status.phase === 'success' ? ' ✅' : status.phase === 'failed' ? ' ❌' : ''}
              </span>
            )}
            {status?.exit_code !== undefined && status.phase === 'failed' && (
              <span className="text-xs text-red-500">退出码：{status.exit_code}</span>
            )}
          </div>
        )}

        {/* 运行日志 */}
        {(status?.running || (status?.logs ?? []).length > 0) && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" />
              运行日志
              {status?.running && (
                <span className="flex items-center gap-1 text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" /> 执行中
                </span>
              )}
            </p>
            <div
              ref={logRef}
              className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 dark:bg-black/50"
            >
              {(status?.logs ?? []).length === 0 ? (
                <span className="text-gray-400">等待脚本输出...</span>
              ) : (
                (status?.logs ?? []).map((line, i) => (
                  <div key={i} className={line.startsWith('更新失败') || line.includes('失败') ? 'text-red-400' : ''}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* 检查结果详情 */}
      {checkResult?.has_update && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/40"
        >
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
            <Rocket className="h-4 w-4" />
            新版本 v{checkResult.latest} 可用（当前 v{checkResult.current}）
          </p>
          {checkResult.notes && checkResult.notes.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
              {checkResult.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {checkResult.download_url && (
            <a
              href={checkResult.download_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Download className="h-4 w-4" /> 下载更新说明
            </a>
          )}
        </motion.div>
      )}

      {/* 更新源配置 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-2xl border border-border bg-card p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="h-4 w-4 text-accent" />
          更新源
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          填写一个返回 JSON 的清单地址（字段：version、notes[]、download_url），用于检查更新。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
      </motion.div>

      {/* 变更日志 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-2xl border border-border bg-card p-5"
      >
        <h2 className="text-sm font-semibold">变更日志</h2>
        <div className="mt-4 space-y-6">
          {changelog.map((entry, i) => (
            <motion.div
              key={entry.version}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06, duration: 0.4, ease: easeOut }}
              className="relative border-l-2 border-border pl-5"
            >
              <span
                className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card ${
                  i === 0 ? 'bg-accent' : 'bg-muted-foreground/40'
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">v{entry.version}</p>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
                {i === 0 && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                    当前版本
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {entry.items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed text-muted-foreground">
                    · {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}