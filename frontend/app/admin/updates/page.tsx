'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, GitBranch, RefreshCw, Rocket } from 'lucide-react'
import {
  checkSystemUpdates,
  fetchUpdateInfo,
  saveUpdateManifest,
  ApiError,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import type { ChangelogEntry, UpdateCheckResult } from '@/lib/api'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function AdminUpdatesPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [manifestUrl, setManifestUrl] = useState('')
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null)

  const infoQuery = useQuery({ queryKey: ['admin', 'updates'], queryFn: fetchUpdateInfo })

  useEffect(() => {
    const manifest = infoQuery.data?.manifest_url
    if (manifest === undefined) return
    const t = setTimeout(() => setManifestUrl(manifest), 0)
    return () => clearTimeout(t)
  }, [infoQuery.data])

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

  const changelog: ChangelogEntry[] = infoQuery.data?.changelog ?? []
  const current = infoQuery.data?.current ?? '…'
  const hasUpdate = checkResult?.has_update

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统更新</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看当前版本、变更日志并检查新版本</p>
      </div>

      {/* 当前版本卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
        className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-5"
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

        {checkResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
              hasUpdate
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-border bg-background text-muted-foreground'
            }`}
          >
            {hasUpdate ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {checkResult.message}
          </motion.div>
        )}

        <motion.button
          type="button"
          onClick={() => check.mutate()}
          disabled={check.isPending}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${check.isPending ? 'animate-spin' : ''}`} />
          {check.isPending ? '检查中...' : '检查更新'}
        </motion.button>
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
              <Download className="h-4 w-4" /> 获取新版本
            </a>
          )}
          <p className="mt-2 text-xs text-emerald-600/70 dark:text-emerald-400/70">
            部署提示：拉取新代码后重新构建 Docker 镜像并重启服务即可完成更新。
          </p>
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
              transition={{ delay: 0.25 + i * 0.08, duration: 0.4, ease: easeOut }}
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
