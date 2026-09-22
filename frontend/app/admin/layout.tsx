'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  FileStack,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Link2,
  Lock,
  Menu,
  MessageSquare,
  Paintbrush,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const navItems = [
  { href: '/admin', label: '概览', icon: LayoutDashboard },
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/articles', label: '文章管理', icon: FileText },
  { href: '/admin/tags', label: '标签管理', icon: Tag },
  { href: '/admin/pages', label: '页面管理', icon: FileStack },
  { href: '/admin/comments', label: '评论管理', icon: MessageSquare },
  { href: '/admin/files', label: '文件管理', icon: FolderOpen },
  { href: '/admin/links', label: '友情链接', icon: Link2 },
  { href: '/admin/appearance', label: '外观管理', icon: Paintbrush },
  { href: '/admin/security', label: '安全防护', icon: ShieldCheck },
  { href: '/admin/settings', label: '网站管理', icon: Settings },
  { href: '/admin/logs', label: '网站日志', icon: ScrollText },
  { href: '/admin/updates', label: '系统更新', icon: RefreshCw },
  { href: '/admin/about', label: '关于系统', icon: Info },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  // 路由切换后自动关闭移动端抽屉（渲染期调整，避免 effect 内 setState）
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMobileNavOpen(false)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
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

  const renderNav = (closeOnClick: boolean) =>
    navItems.map((item) => {
      const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={closeOnClick ? () => setMobileNavOpen(false) : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
            active
              ? 'bg-accent text-white shadow-sm shadow-accent/25'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <item.icon className="h-4 w-4" />
          <span className="font-medium">{item.label}</span>
        </Link>
      )
    })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* 移动端顶栏：标题 + 汉堡按钮（<640px 显示） */}
      <div className="mb-4 flex items-center justify-between sm:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">管理控制台</p>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="打开导航菜单"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent"
        >
          <Menu className="h-4 w-4" /> 菜单
        </button>
      </div>

      <div className="flex gap-6">
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-24 hidden h-fit w-52 shrink-0 rounded-xl border border-border bg-card p-3 sm:block"
        >
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            管理控制台
          </p>
          <nav className="space-y-1">{renderNav(false)}</nav>
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

      {/* 移动端抽屉导航 */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-[120] sm:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col rounded-r-2xl border-r border-border bg-card p-3 shadow-2xl"
            >
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">管理控制台</p>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="关闭菜单"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">{renderNav(true)}</nav>
              <div className="mt-2 border-t border-border px-3 pb-1 pt-3">
                <Link
                  href="/"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> 返回前台
                </Link>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
