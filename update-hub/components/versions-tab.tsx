'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  deleteRelease,
  formatSize,
  rollbackManifest,
  sha256FromURL,
  currentBranchName,
} from '@/lib/github'
import type { Manifest, ReleaseInfo } from '@/lib/types'
import type { Session } from './login-card'
import { Card, CopyButton, GhostButton, PrimaryButton, StepItem } from './ui'

/** 回退流程步骤状态 */
interface RBStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
}

export function VersionsTab({
  session,
  manifest,
  manifestSha,
  releases,
  loading,
  onRefresh,
}: {
  session: Session
  manifest: Manifest | null
  manifestSha: string
  releases: ReleaseInfo[]
  loading: boolean
  onRefresh: () => void
}) {
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseInfo | null>(null)
  const [rollbackSHA, setRollbackSHA] = useState('')
  const [hashPct, setHashPct] = useState(-1)
  const [steps, setSteps] = useState<RBStep[]>([])
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  const patch = (key: string, status: RBStep['status'], message?: string) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, message } : s)))

  /** 自动下载历史资产计算 sha256（浏览器直连 GitHub；失败引导本地文件） */
  const computeRemoteSHA = async (rel: ReleaseInfo) => {
    const asset = rel.assets.find((a) => a.name === 'inkstone-images.tar') ?? rel.assets[0]
    if (!asset) throw new Error('该 Release 没有镜像包资产')
    setHashPct(0)
    try {
      const url = `https://github.com/${session.repo}/releases/download/${rel.tag_name}/${asset.name}`
      setRollbackSHA(await sha256FromURL(url, setHashPct))
    } finally {
      setHashPct(-1)
    }
  }

  /** 本地 tar 拖入计算 sha256（自动下载因网络/CORS 失败时的兜底） */
  const computeLocalSHA = async (file: File) => {
    setHashPct(0)
    try {
      const { sha256Hex } = await import('@/lib/github')
      setRollbackSHA(await sha256Hex(file, setHashPct))
    } finally {
      setHashPct(-1)
    }
  }

  const startRollback = async (rel: ReleaseInfo) => {
    if (rel.tag_name === manifest?.version) {
      alert('该版本正是当前发布版本，无需回退')
      return
    }
    setRollbackTarget(rel)
    setRollbackSHA('')
    setDoneMsg('')
    setSteps([
      { key: 'sha', label: `计算 ${rel.tag_name} 镜像包 SHA256`, status: 'running' },
      { key: 'manifest', label: '把 latest.json 指向该版本', status: 'pending' },
    ])
    try {
      await computeRemoteSHA(rel)
      patch('sha', 'done')
    } catch {
      patch('sha', 'error', '自动下载失败（网络或 CORS），请在下方拖入本地 tar 包计算')
    }
  }

  const finishRollback = async () => {
    if (!rollbackTarget || !rollbackSHA) return
    setBusy(true)
    patch('manifest', 'running')
    try {
      await rollbackManifest(
        session.token,
        session.repo,
        rollbackTarget,
        rollbackSHA,
        manifestSha,
        manifest?.min_version ?? ''
      )
      patch('manifest', 'done')
      setDoneMsg(`已把清单回退到 ${rollbackTarget.tag_name}，各实例下一检查周期拉取该版本`)
      onRefresh()
      setRollbackTarget(null)
    } catch (e) {
      patch('manifest', 'error', e instanceof Error ? e.message : '写入失败')
    } finally {
      setBusy(false)
    }
  }

  const removeRelease = async (rel: ReleaseInfo) => {
    if (!confirm(`确定下架 Release ${rel.tag_name}？将删除 Release 与 tag（实例已拉走的版本不受影响）。`)) return
    try {
      await deleteRelease(session.token, session.repo, rel.id)
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? `删除失败：${e.message}` : '删除失败')
    }
  }

  const isCurrent = (tag: string) => manifest?.version === tag

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
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">发布中</span>
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
                <dd className="flex items-center gap-1">
                  <code className="truncate font-mono" title={manifest.asset?.sha256}>
                    {manifest.asset?.sha256 || '未提供'}
                  </code>
                  {manifest.asset?.sha256 && <CopyButton text={manifest.asset.sha256} />}
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

      {/* 回滚引导卡 */}
      {rollbackTarget && (
        <Card icon={<RotateCcw className="h-4 w-4 text-accent" />} title={`回退清单到 ${rollbackTarget.tag_name}`}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            将把 <code className="rounded bg-muted px-1">latest.json</code> 指向{' '}
            <b>{rollbackTarget.tag_name}</b>（Release 与资产必须存在）。所有实例会在下一个检查周期回退到该版本。
          </p>
          {steps.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {steps.map((s, i) => (
                <StepItem key={s.key} index={i} label={s.label} status={s.status} message={s.message} />
              ))}
            </ul>
          )}
          {hashPct >= 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              下载计算 SHA256 {hashPct}%
            </p>
          )}
          {steps[0]?.status === 'error' && (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) void computeLocalSHA(f)
              }}
              className="mt-3 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground transition-colors hover:border-accent"
            >
              <UploadCloud className="h-6 w-6" />
              自动下载失败？把 <b>{rollbackTarget.tag_name}</b> 的 inkstone-images.tar 拖到这里计算 SHA256
            </label>
          )}
          {rollbackSHA && (
            <p className="mt-2 font-mono text-xs text-emerald-600 dark:text-emerald-400">
              SHA256: {rollbackSHA}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <PrimaryButton onClick={finishRollback} disabled={!rollbackSHA || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              确认回退清单
            </PrimaryButton>
            <GhostButton onClick={() => setRollbackTarget(null)}>取消</GhostButton>
          </div>
          {doneMsg && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {doneMsg}
            </motion.p>
          )}
        </Card>
      )}

      <Card icon={<History className="h-4 w-4 text-accent" />} title="仓库 Releases（可回退清单 / 下架）">
        {releases.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              暂无 Release。GitHub 发布链路未打通——去「发布新版本」上传镜像包创建第一个 Release。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {releases.map((rel) => {
              const total = rel.assets.reduce((sum, a) => sum + a.size, 0)
              const downloads = rel.assets.reduce((sum, a) => sum + a.download_count, 0)
              return (
                <li key={rel.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="text-sm font-bold">{rel.tag_name}</span>
                  {isCurrent(rel.tag_name) && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      当前发布
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {rel.assets.length} 资产 · {formatSize(total)} · 下载 {downloads} 次 ·{' '}
                    {rel.published_at ? new Date(rel.published_at).toLocaleDateString('zh-CN') : '草稿'}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {rel.assets[0] && (
                      <a
                        href={`https://github.com/${session.repo}/releases/download/${rel.tag_name}/${rel.assets[0].name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-accent"
                      >
                        <ExternalLink className="h-3 w-3" />
                        下载
                      </a>
                    )}
                    {!isCurrent(rel.tag_name) && rel.assets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void startRollback(rel)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600"
                      >
                        <RotateCcw className="h-3 w-3" />
                        回退到此版
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void removeRelease(rel)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                      下架
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          仓库：{session.repo} · 实例端默认从该仓库 {currentBranchName()} 分支的 releases/latest.json 读取版本。
        </p>
      </Card>
    </div>
  )
}
