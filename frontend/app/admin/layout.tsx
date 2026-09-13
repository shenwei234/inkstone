'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  FileStack,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Link2,
  Lock,
  MessageSquare,
  Paintbrush,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const navItems = [
  { href: '/admin', label: '概览', icon: LayoutDashboard },
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/articles', label: '文章管理', icon: FileText },
  { href: '/admin/pages', label: '页面管理', icon: FileStack },
  { href: '/admin/comments', label: '评论管理', icon: MessageSquare },
  { href: '/admin/files', label: '文件管理', icon: FolderOpen },
  { href: '/admin/links', label: '友情链接', icon: Link2 },
  { href: '/admin/appearance', label: '外观管理', icon: Paintbrush },
  { href: '/admin/security', label: '安全防护', icon: ShieldCheck },
  { href: '/admin/settings', label: '网站管理', icon: Settings },
  { href: '/admin/updates', label: '系统更新', icon: RefreshCw },
  { href: '/admin/about', label: '关于系统', icon: Info },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }
  if (!user) return null

  if (user.role !== 'admin') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-xl font-bold">需要管理员权限</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          管理后台仅对管理员开放。你可以浏览首页文章，如需权限请联系站长。
        </p>
        <Link
          href="/"
          className="mt-8 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-transform hover:scale-105"
        >
          返回首页
        </Link>
      </div>
    )
  }

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
                <span className="relative">
                  <item.icon className="h-4 w-4" />
                </span>
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
            <ArrowLeft className="h-4 w-4" /> 返回前台
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
