'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Globe,
  Loader2,
  LogOut,
  Package,
  Rocket,
  Settings2,
} from 'lucide-react'
import {
  ensureBranch,
  fetchScopes,
  fetchUser,
  getManifest,
  getMirrors,
  listReleases,
} from '@/lib/github'
import type { GitHubUser, Manifest, ReleaseInfo } from '@/lib/types'
import { LoginCard, sessionStore, type Session } from '@/components/login-card'
import { PublishTab } from '@/components/publish-tab'
import { VersionsTab } from '@/components/versions-tab'
import { MirrorsTab } from '@/components/mirrors-tab'
import { SettingsTab } from '@/components/settings-tab'
import { GhostButton, ScopeBadge } from '@/components/ui'

const easeOut = [0.16, 1, 0.3, 1] as const

type Tab = 'publish' | 'versions' | 'mirrors' | 'settings'

function Hub({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('publish')
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestSHA, setManifestSHA] = useState('')
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [mirrorsData, setMirrorsData] = useState<{ mirrors: string[]; sha: string }>({ mirrors: [], sha: '' })
  const [scopes, setScopes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 先探测默认分支（master 仓库否则 contents API 404）
      await ensureBranch(session.token, session.repo)
      const [u, m, r, mi, sc] = await Promise.all([
        fetchUser(session.token),
        getManifest(session.token, session.repo),
        listReleases(session.token, session.repo),
        getMirrors(session.token, session.repo),
        fetchScopes(session.token).catch(() => [] as string[]),
      ])
      setUser(u)
      setManifest(m?.manifest ?? null)
      setManifestSHA(m?.sha ?? '')
      setReleases(r)
      setMirrorsData(mi)
      setScopes(sc)
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
        <div className="flex items-center gap-2">
          {!loading && <ScopeBadge scopes={scopes} />}
          <GhostButton onClick={onLogout} danger>
            <LogOut className="h-3.5 w-3.5" />
            退出
          </GhostButton>
        </div>
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
                  manifestSha={manifestSHA}
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

export default function UpdateHubPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)

  // 挂载后从 sessionStorage 恢复会话（SSR 输出一致的 loading 态，避免 hydration 冲突）
  useEffect(() => {
    const t = setTimeout(() => {
      setSession(sessionStore.load())
      setBooting(false)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const login = (s: Session) => {
    sessionStore.save(s)
    setSession(s)
  }
  const logout = () => {
    sessionStore.clear()
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
