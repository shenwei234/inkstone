'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, KeyRound, Loader2, Rocket } from 'lucide-react'
import { fetchUser } from '@/lib/github'
import { inputClass, PrimaryButton } from './ui'

export interface Session {
  token: string
  repo: string
}

const SESSION_KEY = 'inkstone_update_hub_session'

export function LoginCard({ onLogin }: { onLogin: (s: Session) => void }) {
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
      {/* 背景装饰光斑 */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
                <li>
                  GitHub → Settings → Developer settings → Personal access tokens
                </li>
                <li>
                  Classic token 勾选 <code className="rounded bg-muted px-1">repo</code>；fine-grained
                  需 Contents:读写 + Administration:读写
                </li>
                <li>令牌仅保存在当前浏览器 sessionStorage，关闭页面即清除，不上传任何服务器</li>
                <li>本后台为纯静态页面，所有 API 调用均从浏览器直连 GitHub</li>
              </ol>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

/** 会话存取（sessionStorage，关闭即失效） */
export const sessionStore = {
  load(): Session | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  },
  save(s: Session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  },
  clear() {
    sessionStorage.removeItem(SESSION_KEY)
  },
}
