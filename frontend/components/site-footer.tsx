'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { GitBranch, Heart, Rss } from 'lucide-react'
import { useSiteConfig } from '@/components/site-config-context'
import { MenuIcon } from '@/components/menu-icon'

const easeOut = [0.16, 1, 0.3, 1] as const

export function SiteFooter() {
  const site = useSiteConfig()
  const year = new Date().getFullYear()

  // 页脚导航：优先使用自定义菜单，未配置时给默认项
  const links =
    site.navMenu.length > 0
      ? site.navMenu.map((m) => ({ label: m.label, href: m.url, icon: m.icon }))
      : [
          { label: '首页', href: '/', icon: 'home' },
          { label: '友情链接', href: '/links', icon: 'link' },
          { label: 'RSS 订阅', href: '/feed.xml', icon: 'rss' },
        ]

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="relative mt-16 border-t border-border bg-card/60 backdrop-blur"
    >
      {/* 顶部渐变装饰线 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* 品牌区 */}
          <div className="max-w-xs">
            <Link href="/" className="group inline-flex items-center gap-2.5">
              {site.siteLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={site.siteLogo}
                  alt={site.siteName}
                  className="h-9 w-9 rounded-lg object-cover transition-transform group-hover:scale-110"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-black text-white">
                  {site.siteName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-base font-bold tracking-tight transition-colors group-hover:text-accent">
                {site.siteName}
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {site.siteDescription || '记录思考，分享创作'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href="/feed.xml"
                target="_blank"
                rel="noreferrer"
                title="RSS 订阅"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Rss className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/shenwei234/inkstone"
                target="_blank"
                rel="noreferrer"
                title="开源仓库"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
              >
                <GitBranch className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* 导航区 */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-2.5 sm:gap-x-16">
            <p className="col-span-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              导航
            </p>
            {links.map((item) => (
              <Link
                key={item.label + item.href}
                href={item.href}
                className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-accent"
              >
                <MenuIcon name={item.icon} className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 底部分隔线 */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
            <span>© {year} {site.siteName}</span>
            <span className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              Powered by
              <a
                href="https://github.com/shenwei234/inkstone"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground/80 transition-colors hover:text-accent"
              >
                InkStone
              </a>
            </span>
          </p>

          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {site.siteIcp && (
              <>
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {site.siteIcp}
                </a>
                <span className="opacity-40">·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              Made with
              <Heart className="h-3 w-3 fill-current text-red-400" />
              by shenwei
            </span>
          </p>
        </div>
      </div>
    </motion.footer>
  )
}
