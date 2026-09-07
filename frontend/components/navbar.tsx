'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export function Navbar() {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const navLinkClass = (href: string) =>
    `text-sm transition-colors ${
      pathname.startsWith(href)
        ? 'text-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground'
    }`

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Blog<span className="text-blue-600 dark:text-blue-400">平台</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className={navLinkClass('/')}>
              首页
            </Link>
            {user && (
              <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                我的文章
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-muted-foreground">...</span>
          ) : user ? (
            <>
              <span className="text-sm text-muted-foreground">{user.username}</span>
              <button
                onClick={() => {
                  logout()
                  router.push('/')
                }}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background transition-opacity hover:opacity-90"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
