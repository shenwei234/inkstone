'use client'

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Gauge,
  Loader2,
  Rocket,
  UploadCloud,
} from 'lucide-react'
import {
  createRelease,
  deleteReleaseAsset,
  formatSize,
  putManifest,
  sha256Hex,
  suggestNextVersion,
  updateRelease,
  uploadReleaseAsset,
  defaultImages,
} from '@/lib/github'
import type { Manifest } from '@/lib/types'
import type { Session } from './login-card'
import { Card, GhostButton, PrimaryButton, StepItem, inputClass } from './ui'

type StepStatus = 'pending' | 'running' | 'done' | 'error'

interface Step {
  key: string
  label: string
  status: StepStatus
  message?: string
}

const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function PublishTab({
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
    manifest ? suggestNextVersion(manifest.version) : 'Beta1.18'
  )
  const [notes, setNotes] = useState('')
  const [minVersion, setMinVersion] = useState(manifest?.min_version ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [fileSHA, setFileSHA] = useState('')
  const [hashPct, setHashPct] = useState(-1)
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
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

  /** 发布前清单预览（与实际写入 latest.json 的内容一致，防错） */
  const preview: Manifest = {
    version: version.trim(),
    released_at: new Date().toISOString(),
    min_version: minVersion.trim(),
    notes: notes.trim(),
    images: manifest?.images?.length ? manifest.images : defaultImages,
    asset: {
      name: file?.name ?? 'inkstone-images.tar',
      url: `https://github.com/${session.repo}/releases/download/${version.trim()}/${file?.name ?? 'inkstone-images.tar'}`,
      sha256: fileSHA,
      size: file?.size ?? 0,
    },
  }

  const publish = async () => {
    if (!version.trim() || !file || !notes.trim()) {
      setSteps([
        { key: 'validate', label: '参数校验', status: 'error', message: '版本号、更新说明、镜像包均为必填' },
      ])
      return
    }
    if (!versionPattern.test(version.trim())) {
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
      { key: 'asset', label: `上传镜像包 ${file.name}（${formatSize(file.size)}）`, status: 'pending' },
      { key: 'manifest', label: '更新 releases/latest.json 版本清单', status: 'pending' },
    ])

    try {
      // 1. 创建（或复用）Release，复用时同步更新说明
      patchStep('release', 'running')
      let release = await createRelease(session.token, session.repo, version.trim(), version.trim(), notes.trim())
      release = await updateRelease(session.token, session.repo, release.id, { name: version.trim(), body: notes.trim() })
      patchStep('release', 'done', `${release.tag_name} 就绪`)

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

      // 3. 写回版本清单（sha256/size 回填，实例端强制校验）
      patchStep('manifest', 'running')
      await putManifest(session.token, session.repo, preview, manifestSha)
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

  const canPublish = !!file && !!fileSHA && !!notes.trim() && !!version.trim() && !running

  return (
    <div className="space-y-4">
      <Card icon={<Rocket className="h-4 w-4 text-accent" />} title="发布新版本">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">新版本号</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className={`${inputClass} mt-1`}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              当前发布：{manifest?.version ?? '未发布'}（next 建议值已预填）
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
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            {file ? (
              <div className="text-sm">
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)} ·{' '}
                  {hashPct >= 0 ? `SHA256 计算中 ${hashPct}%` : fileSHA ? `SHA256 ${fileSHA.slice(0, 16)}…` : ''}
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
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* 发布前清单预览：与实际写入 GitHub 的内容一致 */}
        <div className="mt-4 rounded-xl border border-border bg-muted/40">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent"
          >
            <span>发布前清单预览（latest.json 将写入的内容）</span>
            <span>{showPreview ? '收起' : '展开'}</span>
          </button>
          {showPreview && (
            <pre className="overflow-x-auto border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              {JSON.stringify(preview, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <PrimaryButton onClick={publish} disabled={!canPublish}>
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

      {/* 仅发布 Releases（不传镜像、不切清单）：弱网环境下先发版本公告 */}
      <ReleaseOnlyCard session={session} manifest={manifest} version={version} notes={notes} />
    </div>
  )
}

/** 仅创建/更新 GitHub Release：不传镜像包资产、不更新 latest.json。
 *  适用：上传大镜像包网络失败时，先把版本与说明发布到 Releases 列表。 */
function ReleaseOnlyCard({
  session,
  manifest,
  version,
  notes,
}: {
  session: Session
  manifest: Manifest | null
  version: string
  notes: string
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok')

  const publishRelease = async () => {
    const v = version.trim()
    if (!v || !notes.trim()) {
      setMsgType('err')
      setMsg('请先填写版本号与更新说明')
      return
    }
    if (!versionPattern.test(v)) {
      setMsgType('err')
      setMsg('版本号仅允许字母、数字、点、下划线、连字符')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      let release = await createRelease(session.token, session.repo, v, v, notes.trim())
      release = await updateRelease(session.token, session.repo, release.id, { name: v, body: notes.trim() })
      setMsgType('ok')
      setMsg(
        `Release ${release.tag_name} 已发布。注意：未上传镜像包、未切换 latest.json，实例不会自动更新——后续在 GitHub 网页给该 Release 补传 inkstone-images-${v}.tar，并发布完整版本切清单。`
      )
    } catch (e) {
      setMsgType('err')
      setMsg(e instanceof Error ? e.message : '发布失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      icon={<Rocket className="h-4 w-4 text-muted-foreground" />}
      title="仅发布 Releases（不传镜像 / 不切清单）"
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        只把版本号与更新说明创建为 GitHub Release（KB 级 API 调用，弱网也能成功），
        <b>不上传镜像包资产、不更新 latest.json</b>。适合大镜像包上传失败时先发版本公告。
        当前发布版本：{manifest?.version ?? '未发布'}。
      </p>
      <div className="mt-3 flex items-center gap-3">
        <GhostButton onClick={publishRelease} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          发布 Releases（{version.trim() || '未填版本号'}）
        </GhostButton>
      </div>
      {msg && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`mt-3 text-xs leading-relaxed ${
            msgType === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
          }`}
        >
          {msg}
        </motion.p>
      )}
    </Card>
  )
}
