'use client'

import { Copy, LogOut, Settings2, Terminal, User as UserIcon } from 'lucide-react'
import type { GitHubUser } from '@/lib/types'
import type { Session } from './login-card'
import { Card, GhostButton } from './ui'

export function SettingsTab({
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

      <Card icon={<Terminal className="h-4 w-4 text-accent" />} title="部署这个推送后台">
        <p className="text-xs leading-relaxed text-muted-foreground">
          纯静态站点，所有操作在浏览器直连 GitHub API，无需任何服务器：
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
{`cd update-hub
npm install
npm run build      # 产物在 out/

# GitHub Pages：把 out/ 推到 gh-pages 分支即可
# 或任意静态托管：Vercel / Netlify / COS / OSS
# 当前实例部署于服务器 /opt/update-hub（nginx 静态托管），
# 一键发布更新：D:\\blog-platform\\scripts\\deploy-update-hub.ps1`}
        </pre>
      </Card>

      <Card icon={<Settings2 className="h-4 w-4 text-accent" />} title="实例端对接">
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            实例端后台「系统更新 → 更新设置」中把发布仓库改为你的 <code className="rounded bg-muted px-1">owner/repo</code>
          </li>
          <li>保持「自动更新」开启（默认开启，检查间隔 15 分钟）</li>
          <li>本后台发布新版本后，实例自动下载镜像包并替换容器，全程无需登录服务器</li>
          <li>
            发布错误的版本时：到「版本管理 → 回退到此版」把清单指回上一个 Release（自动计算历史资产
            SHA256；自动下载失败可拖入本地 tar 兜底）
          </li>
          <li>fork 部署时把 release.ps1 产出的镜像包传到自己的仓库 Releases</li>
        </ol>
      </Card>
    </div>
  )
}
