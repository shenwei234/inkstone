'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'

export function Navbar() {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const links = [
    { href: '/', label: '首页' },
    ...(user ? [{ href: '/dashboard', label: '我的文章' }] : []),
  ]

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2 text-lg font-bold tracking-tight">
            <motion.span
              whileHover={{ rotate: 12, scale: 1.15 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-white"
            >
              B
            </motion.span>
            <span className="transition-colors group-hover:text-accent">Blog平台</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {link.label}
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
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <AnimatePresence mode="popLayout">
              <motion.div
                key="user"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3"
              >
                <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium">{user.username}</span>
                </div>
                <button
                  onClick={() => {
                    logout()
                    router.push('/')
                  }}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  退出
                </button>
              </motion.div>
            </AnimatePresence>
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
