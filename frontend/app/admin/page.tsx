'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { animate, motion } from 'framer-motion'
import { FileText, FileEdit, Users, Globe, Lightbulb } from 'lucide-react'
import { fetchAdminStats } from '@/lib/api'

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value])

  return <span ref={ref}>0</span>
}

const cards = [
  { key: 'total_users', label: '总用户数', icon: Users, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { key: 'total_articles', label: '文章总数', icon: FileText, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { key: 'published_articles', label: '已发布', icon: Globe, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'draft_articles', label: '草稿箱', icon: FileEdit, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
] as const

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchAdminStats,
    refetchInterval: 15000,
  })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">概览</h1>
      <p className="mt-1 text-sm text-muted-foreground">平台数据实时统计</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4 }}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight">
              {isLoading ? <span className="skeleton inline-block h-9 w-16 rounded" /> : <AnimatedNumber value={data?.[card.key] ?? 0} />}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.45 }}
        className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
      >
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
        <span>提示：数据每 15 秒自动刷新。左侧菜单可管理用户与文章。</span>
      </motion.div>
    </div>
  )
}
