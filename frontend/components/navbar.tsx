'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, LayoutDashboard, LogOut, Search, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSiteConfig } from '@/components/site-config-context'
import { easeOut } from '@/components/motion'
import { MenuIcon } from '@/components/menu-icon'


export function Navbar() {
  const { user, loading, logout } = useAuth()
  const site = useSiteConfig()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')

  const menuItems =
    site.navMenu.length > 0
      ? site.navMenu.map((m) => ({ label: m.label, href: m.url, icon: m.icon }))
      : [{ label: '首页', href: '/', icon: undefined as string | undefined }]

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2 text-lg font-bold tracking-tight">
            {site.siteLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={site.siteLogo}
                alt={site.siteName}
                className="h-8 w-8 rounded-lg object-cover transition-transform group-hover:scale-110"
              />
            ) : (
              <motion.span
                whileHover={{ rotate: 12, scale: 1.15 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-white"
              >
                {site.siteName.charAt(0).toUpperCase()}
              </motion.span>
            )}
            <span className="transition-colors group-hover:text-accent">{site.siteName}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {menuItems.map((item) => {
              const external = item.href.startsWith('http')
              const active =
                !external &&
                (pathname === item.href ||
                  (item.href !== '/' &&
                    (pathname === `${item.href}/` ||
                      pathname.startsWith(`${item.href}/`))))
              return (
                <Link
                  key={item.label + item.href}
                  href={item.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noreferrer' : undefined}
                  className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MenuIcon name={item.icon} className="mr-1 inline h-4 w-4 align-[-2px]" />
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* 顶部搜索框（最右侧，用户头像之前） */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const value = search.trim()
              router.push(value ? `/?q=${encodeURIComponent(value)}` : '/')
            }}
            className="relative hidden sm:block"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文章..."
              className="w-44 rounded-lg border border-border bg-card py-1.5 pl-9 pr-3 text-sm outline-none transition-all focus:w-56 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </form>

          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <div
              className="relative"
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 transition-colors hover:border-accent/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium">{user.username}</span>
                <motion.span
                  animate={{ rotate: menuOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: easeOut }}
                    className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl shadow-black/10"
                  >
                    <div className="mb-1 border-b border-border px-3 pb-2 pt-1.5">
                      <p className="text-sm font-medium">{user.username}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Link
                      href="/me"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <User className="h-4 w-4" />
                      我的账户
                    </Link>
                    {user.role === 'admin' && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        后台管理
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        logout()
                        router.push('/')
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                      退出登录
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                登录
              </Link>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href="/register"
                  className="inline-block rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent/30"
                >
                  注册
                </Link>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  )
}
