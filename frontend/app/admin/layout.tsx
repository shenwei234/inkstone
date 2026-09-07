'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'

const navItems = [
  { href: '/admin', label: '概览', icon: '📊' },
  { href: '/admin/users', label: '用户管理', icon: '👥' },
  { href: '/admin/articles', label: '文章管理', icon: '📄' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const allowed = user?.role === 'admin'

  useEffect(() => {
    if (!loading && !allowed) router.push('/login')
  }, [loading, allowed, router])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }
  if (!allowed) return null

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-24 hidden h-fit w-52 shrink-0 rounded-xl border border-border bg-card p-3 sm:block"
      >
        <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          管理控制台
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? 'text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="admin-nav-pill"
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative text-base">{item.icon}</span>
                <span className="relative font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="mt-3 border-t border-border px-3 pb-1 pt-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>←</span> 返回前台
          </Link>
        </div>
      </motion.aside>

      <div className="min-w-0 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}
