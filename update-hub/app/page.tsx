'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  Settings2,
  Terminal,
  Trash2,
  UploadCloud,
  User as UserIcon,
} from 'lucide-react'
import {
  createRelease,
  ensureBranch,
  fetchUser,
  formatSize,
  getManifest,
  getMirrors,
  listReleases,
  putManifest,
  putMirrors,
  sha256Hex,
  suggestNextVersion,
  uploadReleaseAsset,
  deleteReleaseAsset,
} from '@/lib/github'
import type {
  GitHubUser,
  Manifest,
  ManifestImage,
  ReleaseInfo,
} from '@/lib/types'

const easeOut = [0.16, 1, 0.3, 1] as const

const defaultImages: ManifestImage[] = [
  { repo: 'inkstone-backend', tag: 'latest', service: 'backend' },
  { repo: 'inkstone-frontend', tag: 'latest', service: 'frontend' },
]

interface Session {
  token: string
  repo: string
}

const SESSION_KEY = 'inkstone_update_hub_session'

type Tab = 'publish' | 'versions' | 'mirrors' | 'settings'

// ---------- 通用小组件 ----------

function Card({
  icon,
  title,
  extra,
  children,
  delay = 0,
}: {
  icon?: React.ReactNode
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: easeOut }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md hover:shadow-accent/5"
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

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      type={type}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 transition-opacity hover:opacity-95 disabled:opacity-50"
    >
      {children}
    </motion.button>
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

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

function StepItem({
  index,
  label,
  status,
  message,
}: {
  index: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          status === 'done'
            ? 'bg-emerald-500 text-white'
            : status === 'running'
              ? 'bg-accent text-white'
              : status === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-muted text-muted-foreground'
        }`}
      >
        {status === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          index + 1
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {message && (
          <p className={`mt-0.5 text-xs ${status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
            {message}
          </p>
        )}
      </div>
    </li>
  )
}

// ---------- 登录 ----------

function LoginCard({ onLogin }: { onLogin: (s: Session) => void }) {
  const [repo, setRepo] = useState('shenwei234/inkstone')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const submit = async () => {
    const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
    const cleanToken = token.trim()
    if (!cleanRepo.includes('/') || !cleanToken) {
      setError('请填写完整的仓库地址与访问令牌')
      return
    }
    setBusy(true)
    setError('')
    try {
      await fetchUser(cleanToken)
      onLogin({ token: cleanToken, repo: cleanRepo })
    } catch (e) {
      setError(e instanceof Error ? `令牌验证失败：${e.message}` : '令牌验证失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* 背景装饰光斑（纯 CSS 模糊圆，无布局成本） */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card/80 p-7 shadow-2xl shadow-accent/5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-500 text-white shadow-lg shadow-accent/30">
            <Rocket className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">更新推送后台</h1>
            <p className="text-xs text-muted-foreground">InkStone · 发布新版本，实例自动拉取更新</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">发布仓库</span>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">GitHub 访问令牌</span>
            <div className="mt-1 flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="ghp_... 或 github_pat_..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="shrink-0 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-accent"
              >
                {showToken ? '隐藏' : '显示'}
              </button>
            </div>
          </label>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 flex items-center gap-1.5 text-xs text-red-500"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </motion.p>
        )}

        <div className="mt-6">
          <PrimaryButton onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? '验证中…' : '进入推送后台'}
          </PrimaryButton>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="text-xs text-muted-foreground transition-colors hover:text-accent"
          >
            {showHelp ? '收起说明' : '如何获取令牌？'}
          </button>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="overflow-hidden text-xs leading-relaxed text-muted-foreground"
            >
              <ol className="mt-3 list-decimal space-y-1.5 pl-4">
                <li>GitHub → Settings → Developer settings → Personal access tokens</li>
                <li>Classic token 勾选 <code className="rounded bg-muted px-1">repo</code> 权限（fine-grained 需 Contents: Read and write）</li>
                <li>令牌仅保存在当前浏览器的 sessionStorage，关闭页面即清除，不会上传到任何服务器</li>
                <li>后台为纯静态页面，所有 API 调用均从浏览器直连 GitHub</li>
              </ol>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ---------- 发布新版本 ----------

type StepStatus = 'pending' | 'running' | 'done' | 'error'

interface Step {
  key: string
  label: string
  status: StepStatus
  message?: string
}

function PublishTab({
  session,
  manifest,
  manifestSha,
  onPublished,
}: {
  session: Session
  manifest: Manifest | null
  manifestSha: string
  onPublished: () => void
}) {
  const [version, setVersion] = useState(() =>
    manifest ? suggestNextVersion(manifest.version) : 'Beta1.16'
  )
  const [notes, setNotes] = useState('')
  const [minVersion, setMinVersion] = useState(manifest?.min_version ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [fileSHA, setFileSHA] = useState('')
  const [hashPct, setHashPct] = useState(-1) // -1=未开始；0-100 计算中
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const onFile = async (f: File | null) => {
    setFile(f)
    setFileSHA('')
    setHashPct(-1)
    if (!f) return
    setHashPct(0)
    try {
      setFileSHA(await sha256Hex(f, setHashPct))
    } finally {
      setHashPct(-1)
    }
  }

  const patchStep = (key: string, status: StepStatus, message?: string) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, message } : s)))

  const publish = async () => {
    if (!version.trim() || !file || !notes.trim()) {
      setSteps([
        { key: 'validate', label: '参数校验', status: 'error', message: '版本号、更新说明、镜像包均为必填' },
      ])
      return
    }
    // 版本号会进入 Release tag 与资产 URL，限制字符集（防手滑打出非法 tag）
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version.trim())) {
      setSteps([
        { key: 'validate', label: '参数校验', status: 'error', message: '版本号仅允许字母、数字、点、下划线、连字符' },
      ])
      return
    }
    if (!fileSHA) {
      setSteps([{ key: 'validate', label: '参数校验', status: 'error', message: '镜像包校验值计算中，请稍候' }])
      return
    }
    setDone(false)
    setRunning(true)
    setProgress(0)
    setSteps([
      { key: 'release', label: `创建 GitHub Release（tag=${version.trim()}）`, status: 'pending' },
      { key: 'asset', label: `上传镜像包 ${file.name}`, status: 'pending' },
      { key: 'manifest', label: '更新 releases/latest.json 版本清单', status: 'pending' },
    ])

    try {
      // 1. 创建 Release
      patchStep('release', 'running')
      const release = await createRelease(session.token, session.repo, version.trim(), version.trim(), notes.trim())
      patchStep('release', 'done', `${release.tag_name} 已就绪`)

      // 2. 上传镜像包（同名资产先删后传，支持重复发布）
      patchStep('asset', 'running')
      const existing = release.assets.find((a) => a.name === file.name)
      if (existing) {
        await deleteReleaseAsset(session.token, session.repo, existing.id)
      }
      const asset = await uploadReleaseAsset(
        session.token,
        release.upload_url,
        file.name,
        file,
        setProgress
      )
      patchStep('asset', 'done', `${formatSize(asset.size)} 上传完成`)

      // 3. 更新版本清单
      patchStep('manifest', 'running')
      const next: Manifest = {
        version: version.trim(),
        released_at: new Date().toISOString(),
        min_version: minVersion.trim(),
        notes: notes.trim(),
        images: manifest?.images?.length ? manifest.images : defaultImages,
        asset: {
          name: file.name,
          url: asset.url ?? '',
          sha256: fileSHA,
          size: asset.size,
        },
      }
      await putManifest(session.token, session.repo, next, manifestSha)
      patchStep('manifest', 'done', '实例将在下一个检查周期自动拉取更新')

      setDone(true)
      onPublished()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误'
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.status === 'running')
        if (idx === -1) return prev
        const copy = [...prev]
        copy[idx] = { ...copy[idx], status: 'error', message: msg }
        return copy
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card icon={<Rocket className="h-4 w-4 text-accent" />} title="发布新版本">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">新版本号</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} className={`${inputClass} mt-1`} />
            <span className="mt-1 block text-xs text-muted-foreground">
              当前发布：{manifest?.version ?? '未发布'}（建议语义递增）
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">最低可更新版本（min_version）</span>
            <input
              value={minVersion}
              onChange={(e) => setMinVersion(e.target.value)}
              placeholder="如 Beta1.5，低于它的实例仅提示不自动更新"
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium">更新说明</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="每行一条更新说明，实例端「系统更新」页会展示"
            className={`${inputClass} mt-1`}
          />
        </label>

        <div className="mt-4">
          <span className="text-sm font-medium">镜像包（inkstone-images.tar）</span>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add('border-accent', 'bg-accent/5')
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('border-accent', 'bg-accent/5')
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('border-accent', 'bg-accent/5')
              const f = e.dataTransfer.files?.[0]
              if (f) void onFile(f)
            }}
            className="mt-1 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center transition-all hover:border-accent hover:bg-accent/5 active:scale-[0.99]"
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground transition-colors" />
            {file ? (
              <div className="text-sm">
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)} ·{' '}
                  {hashPct >= 0
                    ? `SHA256 计算中 ${hashPct}%`
                    : fileSHA
                      ? `SHA256 ${fileSHA.slice(0, 16)}…`
                      : ''}
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>点击选择镜像包文件</p>
                <p className="text-xs">由 scripts/release.ps1 产出，docker save 的 tar 包</p>
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".tar,.tar.gz,application/x-tar"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <PrimaryButton onClick={publish} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {running ? '发布中…' : '发布版本'}
          </PrimaryButton>
          {progress > 0 && progress < 100 && (
            <span className="text-xs text-muted-foreground">上传进度 {progress}%</span>
          )}
        </div>
      </Card>

      {steps.length > 0 && (
        <Card icon={<Gauge className="h-4 w-4 text-accent" />} title="发布进度">
          <ul className="list-stagger divide-y divide-border">
            {steps.map((s, i) => (
              <StepItem key={s.key} index={i} label={s.label} status={s.status} message={s.message} />
            ))}
          </ul>
          {done && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" />
              发布完成！各实例会在下一个检查周期（默认 15 分钟）内自动更新。
            </motion.p>
          )}
        </Card>
      )}
    </div>
  )
}

// ---------- 版本管理 ----------

function VersionsTab({
  session,
  manifest,
  releases,
  loading,
  onRefresh,
}: {
  session: Session
  manifest: Manifest | null
  releases: ReleaseInfo[]
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="space-y-4">
      <Card
        icon={<Package className="h-4 w-4 text-accent" />}
        title="当前发布清单（releases/latest.json）"
        extra={
          <GhostButton onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </GhostButton>
        }
      >
        {manifest ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                {manifest.version}
              </span>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
                发布中
              </span>
              <span className="text-xs text-muted-foreground">
                {manifest.released_at ? new Date(manifest.released_at).toLocaleString('zh-CN') : '—'}
              </span>
            </div>
            {manifest.notes && (
              <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {manifest.notes}
              </p>
            )}
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">镜像包</dt>
                <dd className="font-medium">
                  {manifest.asset?.name ?? '—'}（{manifest.asset?.size ? formatSize(manifest.asset.size) : '未知大小'}）
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SHA256</dt>
                <dd className="truncate font-mono font-medium" title={manifest.asset?.sha256}>
                  {manifest.asset?.sha256 || '未提供'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">最低可更新版本</dt>
                <dd className="font-medium">{manifest.min_version || '不限'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">包含镜像</dt>
                <dd className="font-medium">
                  {(manifest.images ?? []).map((i) => `${i.repo}(${i.service})`).join('、') || '—'}
                </dd>
              </div>
            </dl>
            {manifest.asset?.url && (
              <a
                href={manifest.asset.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                打开镜像包下载地址
              </a>
            )}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">仓库中还没有 releases/latest.json，去「发布新版本」创建第一份。</p>
        )}
      </Card>

      <Card icon={<Package className="h-4 w-4 text-accent" />} title="仓库 Releases" delay={0.05}>
        {releases.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">暂无 Release</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Tag</th>
                  <th className="py-2 pr-3 font-medium">资产</th>
                  <th className="py-2 pr-3 font-medium">下载次数</th>
                  <th className="py-2 font-medium">发布时间</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => {
                  const total = r.assets.reduce((sum, a) => sum + a.size, 0)
                  const downloads = r.assets.reduce((sum, a) => sum + a.download_count, 0)
                  return (
                    <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                      <td className="py-2.5 pr-3">
                        <span className="font-bold">{r.tag_name}</span>
                        {manifest?.version === r.tag_name && (
                          <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            当前
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {r.assets.length} 个 · {formatSize(total)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{downloads}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {r.published_at ? new Date(r.published_at).toLocaleDateString('zh-CN') : '草稿'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          仓库：{session.repo} · 实例端默认从该仓库 main 分支的 releases/latest.json 读取版本。
        </p>
      </Card>
    </div>
  )
}

// ---------- 加速源管理 ----------

const builtinMirrors = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  'https://ghproxy.cn/',
  'https://mirror.ghproxy.com/',
]

function MirrorsTab({
  session,
  data,
  onSaved,
}: {
  session: Session
  data: { mirrors: string[]; sha: string }
  onSaved: () => void
}) {
  const [list, setList] = useState<string[]>(data.mirrors.length ? data.mirrors : [...builtinMirrors])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await putMirrors(
        session.token,
        session.repo,
        list.map((s) => s.trim()).filter(Boolean),
        data.sha
      )
      setMsg('已保存到 releases/mirrors.json，实例端下一个检查周期生效')
      onSaved()
    } catch (e) {
      setMsg(e instanceof Error ? `保存失败：${e.message}` : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card icon={<Globe className="h-4 w-4 text-accent" />} title="GitHub 加速源（实例端下载镜像包用）">
      <p className="text-xs leading-relaxed text-muted-foreground">
        实例端会按延迟测速自动选择最快的源下载 GitHub 上的镜像包，失败的源自动跳过重试。
      </p>
      <ul className="mt-4 space-y-2">
        {list.map((m, i) => (
          <li key={`${m}-${i}`} className="flex items-center gap-2">
            <input
              value={m}
              onChange={(e) => setList((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${inputClass} font-mono text-xs`}
            />
            <button
              type="button"
              onClick={() => setList((prev) => prev.filter((_, j) => j !== i))}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <GhostButton onClick={() => setList((prev) => [...prev, ''])}>
          <Plus className="h-3.5 w-3.5" />
          添加一行
        </GhostButton>
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          保存加速源
        </PrimaryButton>
      </div>
      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
    </Card>
  )
}

// ---------- 设置 / 部署说明 ----------

function SettingsTab({
  session,
  user,
  onLogout,
}: {
  session: Session
  user: GitHubUser | null
  onLogout: () => void
}) {
  return (
    <div className="space-y-4">
      <Card icon={<UserIcon className="h-4 w-4 text-accent" />} title="发布者账户">
        <div className="flex items-center gap-3">
          {user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="h-10 w-10 rounded-full" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{user?.login ?? '—'}</p>
            <p className="text-xs text-muted-foreground">GitHub 令牌已验证</p>
          </div>
          <div className="ml-auto">
            <GhostButton onClick={onLogout} danger>
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </GhostButton>
          </div>
        </div>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">发布仓库</dt>
            <dd className="flex items-center gap-1 font-medium">
              {session.repo}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(session.repo)}
                className="text-muted-foreground transition-colors hover:text-accent"
                aria-label="复制仓库名"
              >
                <Copy className="h-3 w-3" />
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">访问令牌</dt>
            <dd className="font-mono font-medium">{session.token.slice(0, 6)}••••••••（仅存于浏览器会话）</dd>
          </div>
        </dl>
      </Card>

      <Card icon={<Terminal className="h-4 w-4 text-accent" />} title="部署这个推送后台" delay={0.05}>
        <p className="text-xs leading-relaxed text-muted-foreground">
          纯静态站点，所有操作在浏览器直连 GitHub API，无需任何服务器：
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
{`cd update-hub
npm install
npm run build      # 产物在 out/

# GitHub Pages：把 out/ 推到 gh-pages 分支即可
# 或任意静态托管：Vercel / Netlify / COS / OSS`}
        </pre>
      </Card>

      <Card icon={<Settings2 className="h-4 w-4 text-accent" />} title="实例端对接" delay={0.1}>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>实例端后台「系统更新 → 更新设置」中把发布仓库改为你的 <code className="rounded bg-muted px-1">owner/repo</code></li>
          <li>保持「自动更新」开启（默认开启，检查间隔 15 分钟）</li>
          <li>本后台发布新版本后，实例自动下载镜像包并替换容器，全程无需登录服务器</li>
          <li>fork 部署时把 release.ps1 产出的镜像包传到自己的仓库 Releases</li>
        </ol>
      </Card>
    </div>
  )
}

// ---------- 主界面 ----------

function Hub({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('publish')
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestSHA, setManifestSHA] = useState('')
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [mirrorsData, setMirrorsData] = useState<{ mirrors: string[]; sha: string }>({ mirrors: [], sha: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 先探测默认分支（master 仓库否则 contents API 404）
      await ensureBranch(session.token, session.repo)
      const [u, m, r, mi] = await Promise.all([
        fetchUser(session.token),
        getManifest(session.token, session.repo),
        listReleases(session.token, session.repo),
        getMirrors(session.token, session.repo),
      ])
      setUser(u)
      setManifest(m?.manifest ?? null)
      setManifestSHA(m?.sha ?? '')
      setReleases(r)
      setMirrorsData(mi)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [session.token, session.repo])

  // 延迟一个 tick 触发加载，避免 effect 内同步 setState
  useEffect(() => {
    const t = setTimeout(() => {
      void load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'publish', label: '发布新版本', icon: <Rocket className="h-4 w-4" /> },
    { key: 'versions', label: '版本管理', icon: <Package className="h-4 w-4" /> },
    { key: 'mirrors', label: '加速源', icon: <Globe className="h-4 w-4" /> },
    { key: 'settings', label: '设置', icon: <Settings2 className="h-4 w-4" /> },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="sticky top-0 z-10 -mx-4 mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-500 text-white shadow-md shadow-accent/30">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">InkStone 更新推送后台</h1>
            <p className="text-xs text-muted-foreground">{session.repo}</p>
          </div>
        </div>
        <GhostButton onClick={onLogout} danger>
          <LogOut className="h-3.5 w-3.5" />
          退出
        </GhostButton>
      </motion.header>

      <nav className="mt-6 flex flex-wrap gap-1 rounded-xl border border-border bg-muted/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {/* 滑块指示器：单个 motion 元素 + layoutId，只在 hover/切换时合成层位移 */}
            {tab === t.key && (
              <motion.span
                layoutId="tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg border border-border bg-card shadow-sm"
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {t.icon}
              {t.label}
            </span>
          </button>
        ))}
      </nav>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-500"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </motion.p>
      )}

      <div className="mt-4">
        <div key={tab} className="tab-enter">
          {loading ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="skeleton h-40 rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              {tab === 'publish' && (
                <PublishTab
                  session={session}
                  manifest={manifest}
                  manifestSha={manifestSHA}
                  onPublished={() => void load()}
                />
              )}
              {tab === 'versions' && (
                <VersionsTab
                  session={session}
                  manifest={manifest}
                  releases={releases}
                  loading={loading}
                  onRefresh={() => void load()}
                />
              )}
              {tab === 'mirrors' && (
                <MirrorsTab session={session} data={mirrorsData} onSaved={() => void load()} />
              )}
              {tab === 'settings' && <SettingsTab session={session} user={user} onLogout={onLogout} />}
            </>
          )}
        </div>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        InkStone 更新推送后台 · 浏览器直连 GitHub，无服务端
      </footer>
    </div>
  )
}

// ---------- 入口 ----------

export default function UpdateHubPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)

  // 延迟一个 tick 恢复会话，避免 effect 内同步 setState
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        if (raw) setSession(JSON.parse(raw) as Session)
      } catch {
        // 忽略损坏的会话
      }
      setBooting(false)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const login = (s: Session) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
  }
  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!session) return <LoginCard onLogin={login} />
  return <Hub session={session} onLogout={logout} />
}
