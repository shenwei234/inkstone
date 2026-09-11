'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Code2,
  Database,
  FileText,
  Gauge,
  Info,
  MessageSquare,
  Palette,
  ShieldCheck,
  User,
} from 'lucide-react'
import { fetchSystemInfo } from '@/lib/api'
import { useSiteConfig } from '@/components/site-config-context'

const easeOut = [0.16, 1, 0.3, 1] as const

const techStack = [
  { name: 'Go + Gin + GORM', desc: '高性能后端框架', icon: Code2, color: 'text-cyan-500' },
  { name: 'PostgreSQL', desc: '可靠的关系型数据库', icon: Database, color: 'text-blue-500' },
  { name: 'Next.js 15', desc: 'React 全栈前端框架', icon: Gauge, color: 'text-foreground' },
  { name: 'Tailwind CSS', desc: '原子化样式系统', icon: Palette, color: 'text-sky-500' },
]

const features = [
  { icon: FileText, title: '文章与页面', desc: '区块编辑器、草稿发布、自定义页面模板' },
  { icon: MessageSquare, title: '互动系统', desc: '评论、点赞收藏、浏览统计、RSS 订阅' },
  { icon: User, title: '多用户', desc: 'RBAC 权限、注册开关、用户封禁' },
  { icon: Palette, title: '外观自定义', desc: '导航菜单、侧边栏小工具、站点图标' },
  { icon: ShieldCheck, title: '安全', desc: 'JWT 双令牌、限流设计、操作确认' },
]

export default function AdminAboutPage() {
  const site = useSiteConfig()
  const infoQuery = useQuery({ queryKey: ['system', 'info'], queryFn: fetchSystemInfo })
  const info = infoQuery.data?.info

  return (
    <div>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-6"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-black text-white shadow-lg shadow-accent/30">
            {site.siteName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{site.siteName}</h1>
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                v{info?.version ?? '…'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {site.siteDescription} · 一套现代化的多用户博客系统
            </p>
          </div>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <p>作者：{info?.author ?? '—'}</p>
            <p className="mt-0.5">已稳定运行 {info?.uptime ?? '—'}</p>
          </div>
        </div>
      </motion.div>

      {/* 系统介绍 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-accent" />
          系统介绍
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {site.siteName} 是一套前后端分离的多用户博客平台：后端基于 Go（Gin + GORM）提供 RESTful
          API，前端基于 Next.js 15（App Router）。支持多用户写作、评论互动、点赞收藏、独立页面、
          主题外观自定义与站点配置，内置 JWT 双令牌认证与 RBAC 权限体系，
          部署采用 Docker Compose，可运行在任何 VPS 上。
        </p>
      </motion.section>

      {/* 技术栈 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Code2 className="h-4 w-4 text-accent" />
          技术栈
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {techStack.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06, duration: 0.35 }}
              whileHover={{ x: 3 }}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
            >
              <t.icon className={`h-5 w-5 ${t.color}`} />
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">运行环境：{info?.go_version ?? '—'}</p>
      </motion.section>

      {/* 功能特性 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, duration: 0.45, ease: easeOut }}
        className="mt-4 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="text-sm font-semibold">功能特性</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.06, duration: 0.35 }}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-center gap-2">
                <f.icon className="h-4 w-4 text-accent" />
                <p className="text-sm font-medium">{f.title}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  )
}
