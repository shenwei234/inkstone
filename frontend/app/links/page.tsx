'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertTriangle, ExternalLink, Link2, ShieldOff } from 'lucide-react'
import { fetchFriendLinks } from '@/lib/api'
import { PageTransition, StaggerList, StaggerItem, HoverLift } from '@/components/motion'
import { useSiteConfig } from '@/components/site-config-context'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function LinksPage() {
  const site = useSiteConfig()
  const { data, isLoading } = useQuery({
    queryKey: ['friend-links'],
    queryFn: fetchFriendLinks,
  })

  const links = data?.links ?? []

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* 页头 */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOut }}
          className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-8 text-center"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-3xl" />
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30"
          >
            <Link2 className="h-7 w-7" />
          </motion.div>
          <h1 className="relative mt-4 text-2xl font-bold tracking-tight sm:text-3xl">友情链接</h1>
          <p className="relative mt-2 text-sm text-muted-foreground">
            {site.siteName} 的朋友们 · 共 {links.length} 个站点
          </p>
        </motion.header>

        {/* 列表 */}
        {isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-xl border border-dashed p-16 text-center"
          >
            <Link2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">还没有添加友情链接</p>
          </motion.div>
        ) : (
          <StaggerList className="mt-8 grid gap-4 sm:grid-cols-2">
            {links.map((link) => (
              <StaggerItem key={link.id}>
                {link.available && link.url ? (
                  <HoverLift>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5"
                    >
                      <LinkAvatar icon={link.icon_url} name={link.name} dim={false} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-medium transition-colors group-hover:text-accent">
                          {link.name}
                          <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {link.description || link.masked_url}
                        </p>
                      </div>
                    </a>
                  </HoverLift>
                ) : (
                  /* 失效友链：禁止跳转 + 脱敏展示 */
                  <div
                    className="flex cursor-not-allowed items-center gap-4 rounded-xl border border-dashed border-border bg-muted/40 p-4 opacity-70"
                    title="该站点暂时无法访问，已暂停跳转"
                  >
                    <LinkAvatar icon={link.icon_url} name={link.name} dim />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium text-muted-foreground">
                        {link.name}
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          链接失效
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground/70">
                        <ShieldOff className="h-3 w-3 shrink-0" />
                        已脱敏：{link.masked_url}
                      </p>
                    </div>
                  </div>
                )}
              </StaggerItem>
            ))}
          </StaggerList>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-center text-xs text-muted-foreground"
        >
          友情链接每日自动检测，失效站点将暂停跳转以保护访问安全
        </motion.p>
      </div>
    </PageTransition>
  )
}

function LinkAvatar({
  icon,
  name,
  dim,
}: {
  icon?: string
  name: string
  dim: boolean
}) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-sm font-bold ${
        dim ? 'grayscale' : ''
      }`}
    >
      {icon ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={icon}
          alt={name}
          className="h-full w-full object-cover"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <span className="text-accent">{name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}
