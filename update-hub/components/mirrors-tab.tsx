'use client'

import { useState } from 'react'
import { CheckCircle2, Globe, Loader2, Plus, Trash2, Zap } from 'lucide-react'
import { putMirrors } from '@/lib/github'
import { probeMirrors } from '@/lib/mirror-probe'
import type { Session } from './login-card'
import { Card, GhostButton, PrimaryButton, inputClass } from './ui'

const builtinMirrors = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  'https://ghproxy.cn/',
  'https://mirror.ghproxy.com/',
]

export function MirrorsTab({
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
  const [probing, setProbing] = useState(false)
  const [latency, setLatency] = useState<Record<string, number>>({})

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

  /** 浏览器直连各加速源实测延迟（Range 只取前 2KB） */
  const testAll = async () => {
    const urls = list.map((s) => s.trim()).filter((s) => s.startsWith('https://'))
    if (urls.length === 0) {
      setMsg('没有可测试的 https 加速源')
      return
    }
    setProbing(true)
    setLatency({})
    try {
      const results = await probeMirrors(urls)
      const map: Record<string, number> = {}
      for (const r of results) map[r.url] = r.latency
      setLatency(map)
      const best = results.find((r) => r.latency >= 0)
      setMsg(best ? `最快：${best.url}（${best.latency}ms）` : '所有加速源均不可达')
    } finally {
      setProbing(false)
    }
  }

  return (
    <Card icon={<Globe className="h-4 w-4 text-accent" />} title="GitHub 加速源（实例端下载镜像包用）">
      <p className="text-xs leading-relaxed text-muted-foreground">
        实例端会按延迟测速自动选择最快的源下载 GitHub 上的镜像包，失败的源自动跳过重试。
      </p>
      <ul className="mt-4 space-y-2">
        {list.map((m, i) => {
          const lat = latency[m.trim()]
          return (
            <li key={`${m}-${i}`} className="flex items-center gap-2">
              <input
                value={m}
                onChange={(e) => setList((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="https://ghfast.top/"
                className={`${inputClass} font-mono text-xs`}
              />
              {lat !== undefined &&
                (lat >= 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-3 w-3" />
                    {lat}ms
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                    不可达
                  </span>
                ))}
              <button
                type="button"
                onClick={() => setList((prev) => prev.filter((_, j) => j !== i))}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                aria-label="删除该加速源"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GhostButton onClick={() => setList((prev) => [...prev, ''])}>
          <Plus className="h-3.5 w-3.5" />
          添加一行
        </GhostButton>
        <GhostButton onClick={testAll} disabled={probing}>
          {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {probing ? '测速中…' : '测试延迟'}
        </GhostButton>
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          保存加速源
        </PrimaryButton>
      </div>
      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        保存位置：releases/mirrors.json（JSON 数组）；列表为空时实例端回退内置 5 个源。
      </p>
    </Card>
  )
}
