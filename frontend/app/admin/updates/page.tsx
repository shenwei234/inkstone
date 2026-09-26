'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  CloudUpload,
  Download,
  GitBranch,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Terminal,
  XCircle,
} from 'lucide-react'
import {
  applySystemUpdate,
  checkSystemUpdates,
  fetchUpdateInfo,
  fetchUpdateStatus,
  saveUpdateConfig,
  ApiError,
  type UpdateConfig,
  type UpdateStatus,
  type UpdateTask,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import { GsapPulse, GsapProgress, GsapReveal, GsapSpinner } from '@/components/gsap'

export default function AdminUpdatesPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const logRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef<string | undefined>(undefined)

  // 推送服务配置表单（从 config 视图同步，令牌留空 = 保持原值）
  const [serverURL, setServerURL] = useState('')
  const [token, setToken] = useState('')
  const [auto, setAuto] = useState(true)
  const [repoDir, setRepoDir] = useState('/opt/inkstone-images')
  const [composeFile, setComposeFile] = useState('docker-compose.offline.yml')
  const [mirrorURLs, setMirrorURLs] = useState('')

  const infoQuery = useQuery({ queryKey: ['admin', 'updates'], queryFn: fetchUpdateInfo })
  const statusQuery = useQuery({
    queryKey: ['admin', 'updates', 'status'],
    queryFn: fetchUpdateStatus,
    refetchInterval: (query) => (query.state.data?.status?.running ? 2000 : false),
    refetchOnWindowFocus: false,
  })

  const status: UpdateStatus | undefined = statusQuery.data?.status
  const config: UpdateConfig | undefined = infoQuery.data?.config
  const running = status?.running ?? false
  const configured = config?.configured ?? false
  const current = infoQuery.data?.current ?? '…'
  const task: UpdateTask | null = status?.task ?? null

  useEffect(() => {
    if (config === undefined) return
    const t = setTimeout(() => {
      setServerURL(config.server_url ?? '')
      setAuto(config.auto ?? true)
      setRepoDir(config.repo_dir ?? '')
      setComposeFile(config.compose_file ?? '')
      setMirrorURLs((config.mirror_urls ?? []).join(';'))
      setToken('')
    }, 0)
    return () => clearTimeout(t)
  }, [config])

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
    if (phase === 'success') {
      notify.success('更新完成，镜像已替换部署')
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] })
    }
    if (phase === 'failed') notify.error('更新失败，请查看运行日志')
  }, [status?.phase, notify, queryClient])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] })
  }

  const check = useMutation({
    mutationFn: checkSystemUpdates,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates', 'status'] })
      notify.success(data.message || '检查完成')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '检查更新失败'),
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
      saveUpdateConfig({
        server_url: serverURL,
        token: token || undefined,
        auto,
        repo_dir: repoDir,
        compose_file: composeFile,
        mirror_urls: mirrorURLs,
      }),
    onSuccess: () => {
      invalidateAll()
      notify.success('更新配置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存配置失败'),
  })

  const handleApply = () => {
    if (!configured) {
      notify.error('请先配置并保存推送服务地址与访问令牌')
      return
    }
    if (!task) {
      notify.error('没有待更新的版本，请先「检查更新」')
      return
    }
    void notify
      .confirm({
        title: `确认更新到 ${task.version}？`,
        message:
          '将从镜像包 git 仓库拉取最新镜像并替换部署（docker load + compose up -d），期间前台可能短暂中断。',
        confirmText: '立即更新',
      })
      .then((ok) => {
        if (ok) apply.mutate()
      })
  }

  const handleCheck = () => {
    if (!configured) {
      notify.error('请先配置并保存推送服务地址与访问令牌')
      return
    }
    check.mutate()
  }

  const handleSaveConfig = () => {
    if (!serverURL.trim()) {
      notify.error('请填写推送后台服务地址')
      return
    }
    if (config?.token_set && !token.trim()) {
      notify.error('请填写访问令牌（如需保持不变，请重新粘贴当前令牌）')
      return
    }
    if (!config?.token_set && !token.trim()) {
      notify.error('请填写访问令牌（在推送后台「注册令牌」页生成）')
      return
    }
    saveCfg.mutate()
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

  const notes = (task?.notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          连接「更新推送后台」接收新版本，自动 git 拉取镜像包仓库并 docker 替换部署
        </p>
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
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status?.online ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                }`}
              />
              {configured ? `${config?.server_url || '推送后台'}` : '未配置推送后台'}
              {status?.last_check_at ? ` · 最近检查 ${timeLabel(status.last_check_at)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {phaseBadge()}
          <button
            type="button"
            onClick={handleCheck}
            disabled={check.isPending || running}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {check.isPending ? (
              <GsapSpinner size={15} className="border-current border-t-transparent" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            检查更新
          </button>
          <GsapPulse active={configured && !running} color="16, 185, 129">
            <button
              type="button"
              onClick={handleApply}
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
                  立即更新
                </>
              )}
            </button>
          </GsapPulse>
        </div>
      </GsapReveal>

      {/* ===== 未配置引导 ===== */}
      {!configured && (
        <GsapReveal
          y={12}
          delay={0.05}
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <Server className="h-4 w-4" />
            尚未连接更新推送后台
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/80">
            在「更新推送后台」生成注册令牌，展开下方「推送服务配置」填写服务地址与令牌，保存后即可自动接收新版本推送。
          </p>
        </GsapReveal>
      )}

      {/* ===== 待更新任务 ===== */}
      {task && (
        <GsapReveal y={12} delay={0.08} className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CloudUpload className="h-4 w-4 text-accent" />
              发现新版本 v{task.version}
            </p>
            <button
              type="button"
              onClick={() => apply.mutate()}
              disabled={running || apply.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              更新至此版本
            </button>
          </div>
          {notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
              {notes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              <span className="font-mono">{task.repo_url}</span>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono">{task.branch}</span>
            </span>
            <span>镜像包：{task.tar_name}</span>
            <span>编排：{task.compose_file}</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            更新流程：git 同步（origin 失败自动回退备用源）→ 校验镜像包 sha256 →{' '}
            <span className="font-mono">docker load</span>（与当前镜像对比，无变化将直接报错）→{' '}
            打回滚点 + 记录待验证状态 → <span className="font-mono">docker compose up -d</span>{' '}
            替换部署 → 重启后自动校验版本（不符将自动回滚）
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
              <span className="text-gray-400">等待输出...</span>
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

      {/* ===== 推送服务配置 ===== */}
      <GsapReveal y={12} delay={0.1} className="mt-4 rounded-2xl border border-border bg-card p-5">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4 text-accent" />
            推送服务配置
            <span className="text-xs font-normal text-muted-foreground">（更新推送后台地址 / 访问令牌 / 仓库目录）</span>
          </summary>

          <div className="mt-4 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">推送后台服务地址</span>
                <input
                  type="text"
                  value={serverURL}
                  onChange={(e) => setServerURL(e.target.value)}
                  placeholder="https://update.example.com"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  访问令牌{config?.token_set ? '（已设置，留空保持不变）' : '（在推送后台「注册令牌」生成）'}
                </span>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={config?.token_set ? '••••••（已保存）' : 'inkstone-...'}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">镜像包 git 仓库检出目录（服务器）</span>
                <input
                  type="text"
                  value={repoDir}
                  onChange={(e) => setRepoDir(e.target.value)}
                  placeholder="/opt/inkstone-images"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">docker compose 编排文件名</span>
                <input
                  type="text"
                  value={composeFile}
                  onChange={(e) => setComposeFile(e.target.value)}
                  placeholder="docker-compose.offline.yml"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground">
                  备用镜像仓库地址（origin 拉取失败时按顺序回退，分号分隔）
                </span>
                <input
                  type="text"
                  value={mirrorURLs}
                  onChange={(e) => setMirrorURLs(e.target.value)}
                  placeholder="file:///srv/git/inkstone-images.git"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                开启自动更新（推送后台一发版，本站自动完成更新，无需任何操作；关闭则只在后台提醒、需手动「立即更新」）
              </label>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saveCfg.isPending}
                className="ml-auto rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {saveCfg.isPending ? '保存中...' : '保存配置'}
              </button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              说明：保存后每隔 60 秒自动向推送后台轮询一次；更新执行时服务自身会被替换重启，日志可能随进程重启清空，
              最终状态以推送后台「客户端实例」页显示的版本为准。每次更新前会自动打{' '}
              <span className="font-mono">rollback-日期时间</span> 回滚镜像；若新镜像版本与发布版本不符，重启后将自动回滚。
            </p>
          </div>
        </details>
      </GsapReveal>

      {/* ===== 更新日志 ===== */}
      <GsapReveal y={12} delay={0.15} className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">更新日志</h2>
        <ul className="mt-3 space-y-3">
          {(infoQuery.data?.changelog ?? []).map((entry) => (
            <li key={entry.version} className="border-l-2 border-accent/40 pl-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                v{entry.version}
                <span className="text-xs font-normal text-muted-foreground">{entry.date}</span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </GsapReveal>
    </div>
  )
}
