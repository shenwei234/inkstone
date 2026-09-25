'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  User,
  UserPlus,
  X,
} from 'lucide-react'
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
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [lastPath, setLastPath] = useState(pathname)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 路由切换后关闭移动端菜单/搜索（渲染期调整，避免 effect 内 setState）
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setNavOpen(false)
    setSearchOpen(false)
    setMenuOpen(false)
  }

  // 打开搜索栏时自动聚焦
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  // 移动端菜单打开时锁定背景滚动（后面的画面不动）
  useEffect(() => {
    if (!navOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [navOpen])

  const submitSearch = (value: string) => {
    const v = value.trim()
    setNavOpen(false)
    setSearchOpen(false)
    router.push(v ? `/?q=${encodeURIComponent(v)}` : '/')
  }

  const menuItems =
    site.navMenu.length > 0
      ? site.navMenu.map((m) => ({ label: m.label, href: m.url, icon: m.icon }))
      : [{ label: '首页', href: '/', icon: undefined as string | undefined }]

  const isActive = (href: string) => {
    if (href.startsWith('http')) return false
    return (
      pathname === href ||
      (href !== '/' && (pathname === `${href}/` || pathname.startsWith(`${href}/`)))
    )
  }

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent active:scale-95'

  const menuLink =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

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
          <nav className="hidden items-center gap-1 md:flex">
            {menuItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.label + item.href}
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                  className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
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

        <div className="flex items-center gap-2 sm:gap-3">
          {/* 桌面搜索框（sm 起显示） */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitSearch(search)
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

          {/* 手机搜索图标（sm 起隐藏，展开顶部搜索栏） */}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((o) => !o)
              setNavOpen(false)
            }}
            aria-label="搜索"
            aria-expanded={searchOpen}
            className={`${iconBtn} sm:hidden`}
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>

          {loading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <div className="relative" onMouseEnter={() => setMenuOpen(true)} onMouseLeave={() => setMenuOpen(false)}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="用户菜单"
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:border-accent/40 sm:pr-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm font-medium sm:inline">{user.username}</span>
                <motion.span
                  animate={{ rotate: menuOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="hidden text-muted-foreground sm:inline"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: easeOut }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-border bg-card/95 p-2 shadow-2xl shadow-black/10 backdrop-blur-xl"
                  >
                    <div className="mb-1 flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{user.username}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <Link href="/me" onClick={() => setMenuOpen(false)} className={menuLink}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                        <User className="h-4 w-4" />
                      </span>
                      我的账户
                    </Link>
                    {user.role === 'admin' && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)} className={menuLink}>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                          <LayoutDashboard className="h-4 w-4" />
                        </span>
                        后台管理
                      </Link>
                    )}
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        logout()
                        router.push('/')
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
                        <LogOut className="h-4 w-4" />
                      </span>
                      退出登录
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                href="/login"
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                登录
              </Link>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href="/register"
                  className="inline-block rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent/30"
                >
                  注册
                </Link>
              </motion.div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setNavOpen((o) => !o)
              setSearchOpen(false)
            }}
            aria-label="菜单"
            aria-expanded={navOpen}
            className={`${iconBtn} md:hidden`}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 手机端顶部搜索栏 */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: easeOut }}
            className="border-t border-border bg-card sm:hidden"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitSearch(search)
              }}
              className="mx-auto max-w-5xl px-4 py-3"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索文章..."
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 手机端菜单：背景冻结 + 毛玻璃弹出 */}
      <AnimatePresence>
        {navOpen && (
          <>
            {/* 遮罩：背景变暗 + 模糊，点击关闭 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setNavOpen(false)}
              aria-hidden
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            />
            {/* 毛玻璃菜单面板 */}
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.24, ease: easeOut }}
              className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-card/80 backdrop-blur-2xl md:hidden"
            >
              <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
                <nav className="space-y-1">
                  {menuItems.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.label + item.href}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                        onClick={() => setNavOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-accent/10 font-medium text-accent'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            active ? 'bg-accent/15 text-accent' : 'bg-muted text-foreground'
                          }`}
                        >
                          <MenuIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        {item.label}
                      </Link>
                    )
                  })}
                </nav>

                <div className="border-t border-border" />

                {user ? (
                  <div className="space-y-1">
                    <Link href="/me" onClick={() => setNavOpen(false)} className={menuLink}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                        <User className="h-4 w-4" />
                      </span>
                      我的账户
                    </Link>
                    {user.role === 'admin' && (
                      <Link href="/admin" onClick={() => setNavOpen(false)} className={menuLink}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                          <LayoutDashboard className="h-4 w-4" />
                        </span>
                        后台管理
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setNavOpen(false)
                        logout()
                        router.push('/')
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                        <LogOut className="h-4 w-4" />
                      </span>
                      退出登录
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      onClick={() => setNavOpen(false)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      <User className="h-4 w-4" />
                      登录
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setNavOpen(false)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-medium text-white shadow-sm shadow-accent/30"
                    >
                      <UserPlus className="h-4 w-4" />
                      注册
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
