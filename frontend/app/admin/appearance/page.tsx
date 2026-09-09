'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutList, PanelLeft, Plus, Trash2 } from 'lucide-react'
import { updateAdminSettings, ApiError } from '@/lib/api'
import { useNotify } from '@/components/toast'
import type { NavMenuItem, SidebarWidget, WidgetType } from '@/components/site-config-context'
import { fetchSiteConfig } from '@/lib/api'

const easeOut = [0.16, 1, 0.3, 1] as const

const WIDGET_TYPES: { type: WidgetType; label: string; desc: string }[] = [
  { type: 'about', label: '关于本站', desc: '一段文字介绍' },
  { type: 'hot', label: '热门文章', desc: '按浏览量排行' },
  { type: 'tags', label: '标签云', desc: '展示所有标签' },
  { type: 'search', label: '搜索框', desc: '文章关键词搜索' },
  { type: 'html', label: '自定义 HTML', desc: '自由嵌入内容' },
]

const widgetTypeLabel = (t: WidgetType) =>
  WIDGET_TYPES.find((w) => w.type === t)?.label ?? t

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

function MoveButtons({
  index,
  count,
  onMove,
}: {
  index: number
  count: number
  onMove: (from: number, to: number) => void
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        title="上移"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="下移"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  )
}

function MenuTab() {
  const notify = useNotify()
  const [items, setItems] = useState<NavMenuItem[]>([])

  useEffect(() => {
    fetchSiteConfig().then((raw) => {
      if (Array.isArray(raw.nav_menu)) setItems(raw.nav_menu as NavMenuItem[])
    })
  }, [])

  const save = useMutation({
    mutationFn: () =>
      updateAdminSettings({ nav_menu: items } as unknown as Record<string, unknown>),
    onSuccess: () => notify.success('导航菜单已保存，前台刷新即可看到'),
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const move = (from: number, to: number) => {
    setItems((arr) => {
      const next = [...arr]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        自定义顶部导航栏菜单，留空则显示默认的「首页」。支持站内路径（如 /p/about）或完整外链。
      </p>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          尚未自定义，前台显示默认菜单
        </div>
      )}

      {items.map((item, i) => (
        <motion.div
          key={`${item.label}-${i}`}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
        >
          <input
            value={item.label}
            onChange={(e) =>
              setItems((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            placeholder="菜单名称"
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={item.url}
            onChange={(e) =>
              setItems((arr) => arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
            }
            placeholder="/p/about 或 https://..."
            className={`${inputClass} flex-1`}
          />
          <MoveButtons index={i} count={items.length} onMove={move} />
          <button
            type="button"
            title="删除"
            onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
            className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </motion.div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setItems((arr) => [...arr, { label: '', url: '' }])}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
        >
          <Plus className="h-4 w-4" /> 添加菜单项
        </button>
        <motion.button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="ml-auto rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          {save.isPending ? '保存中...' : '保存菜单'}
        </motion.button>
      </div>
    </div>
  )
}

function WidgetsTab() {
  const notify = useNotify()
  const [widgets, setWidgets] = useState<SidebarWidget[]>([])
  const [addType, setAddType] = useState<WidgetType>('about')

  useEffect(() => {
    fetchSiteConfig().then((raw) => {
      if (Array.isArray(raw.sidebar_widgets)) setWidgets(raw.sidebar_widgets as SidebarWidget[])
    })
  }, [])

  const save = useMutation({
    mutationFn: () =>
      updateAdminSettings({ sidebar_widgets: widgets } as unknown as Record<string, unknown>),
    onSuccess: () => notify.success('侧边栏小工具已保存，前台刷新即可看到'),
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const move = (from: number, to: number) => {
    setWidgets((arr) => {
      const next = [...arr]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const addWidget = () => {
    const preset = WIDGET_TYPES.find((w) => w.type === addType)
    if (!preset) return
    setWidgets((arr) => [
      ...arr,
      { type: addType, title: preset.label, content: '', limit: addType === 'hot' ? 5 : addType === 'tags' ? 20 : undefined },
    ])
  }

  const updateWidget = (i: number, patch: Partial<SidebarWidget>) =>
    setWidgets((arr) => arr.map((w, j) => (j === i ? { ...w, ...patch } : w)))

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        配置首页右侧边栏的小工具，可调整顺序与参数。不配置则首页为通栏布局。
      </p>

      {widgets.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          尚未添加小工具
        </div>
      )}

      {widgets.map((w, i) => (
        <motion.div
          key={`${w.type}-${i}`}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
              {widgetTypeLabel(w.type)}
            </span>
            <input
              value={w.title}
              onChange={(e) => updateWidget(i, { title: e.target.value })}
              placeholder="小工具标题"
              className="w-40 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <div className="ml-auto flex items-center">
              <MoveButtons index={i} count={widgets.length} onMove={move} />
              <button
                type="button"
                title="删除"
                onClick={() => setWidgets((arr) => arr.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3">
            {w.type === 'about' && (
              <textarea
                value={w.content ?? ''}
                onChange={(e) => updateWidget(i, { content: e.target.value })}
                placeholder="介绍文字..."
                rows={3}
                className={`${inputClass} resize-y`}
              />
            )}
            {w.type === 'hot' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                显示条数
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={w.limit ?? 5}
                  onChange={(e) => updateWidget(i, { limit: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </label>
            )}
            {w.type === 'tags' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                显示个数
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={w.limit ?? 20}
                  onChange={(e) => updateWidget(i, { limit: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </label>
            )}
            {w.type === 'html' && (
              <textarea
                value={w.content ?? ''}
                onChange={(e) => updateWidget(i, { content: e.target.value })}
                placeholder="<p>支持 HTML...</p>"
                rows={4}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            )}
            {w.type === 'search' && (
              <p className="text-xs text-muted-foreground">无需额外配置</p>
            )}
          </div>
        </motion.div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value as WidgetType)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {WIDGET_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label} — {t.desc}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addWidget}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
        >
          <Plus className="h-4 w-4" /> 添加小工具
        </button>
        <motion.button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="ml-auto rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          {save.isPending ? '保存中...' : '保存小工具'}
        </motion.button>
      </div>
    </div>
  )
}

export default function AdminAppearancePage() {
  const [tab, setTab] = useState<'menu' | 'widgets'>('menu')
  const tabs = [
    { key: 'menu' as const, label: '顶部菜单', icon: LayoutList },
    { key: 'widgets' as const, label: '侧边栏小工具', icon: PanelLeft },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">外观管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">自定义前台顶部菜单与侧边栏小工具</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm transition-colors ${
                tab === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="appearance-tab"
                  className="absolute inset-0 rounded-md bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon className="relative h-4 w-4" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOut }}
        className="mt-6 rounded-xl border border-border bg-card p-5"
      >
        {tab === 'menu' ? <MenuTab /> : <WidgetsTab />}
      </motion.div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        保存后刷新前台页面即可看到效果
      </div>
    </div>
  )
}
