'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudSnow,
  FileText,
  Folder,
  Quote,
  Search,
  Sun,
  Tag,
  Wind,
} from 'lucide-react'
import { fetchArticles, fetchCategories, fetchTags } from '@/lib/api'
import type { SidebarWidget } from '@/components/site-config-context'

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

/* ---------- 热门文章 ---------- */

function HotWidget({ limit, title }: { limit?: number; title: string }) {
  const { data } = useQuery({
    queryKey: ['articles', 'hot', limit],
    queryFn: () => fetchArticles({ page: 1, page_size: limit ?? 5, order: 'views' }),
  })
  const articles = data?.articles ?? []
  return (
    <WidgetCard title={title}>
      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无数据</p>
      ) : (
        <ol className="space-y-2.5">
          {articles.map((a, i) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                  i < 3 ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </span>
              <Link
                href={`/posts/${a.slug}`}
                className="line-clamp-1 text-sm text-foreground/90 transition-colors hover:text-accent"
              >
                {a.title}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  )
}

/* ---------- 标签云 ---------- */

function TagsWidget({ limit, title }: { limit?: number; title: string }) {
  const { data } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
  })
  const tags = (data?.tags ?? []).slice(0, limit ?? 20)
  return (
    <WidgetCard title={title}>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无标签</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={`/?tag=${t.slug}`}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              {t.name}
              <span className="ml-1 opacity-60">{t.article_count}</span>
            </Link>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

/* ---------- 搜索 ---------- */

function SearchWidget({ title }: { title: string }) {
  return (
    <WidgetCard title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement) ?? null
          if (input) window.location.href = input.value.trim() ? `/?q=${encodeURIComponent(input.value.trim())}` : '/'
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          placeholder="输入关键词回车搜索..."
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>
    </WidgetCard>
  )
}

/* ---------- HTML ---------- */

function HtmlWidget({ title, content }: { title: string; content?: string }) {
  return (
    <WidgetCard title={title}>
      <div
        className="text-sm leading-relaxed text-foreground/80 [&_a]:text-accent [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: content || '' }}
      />
    </WidgetCard>
  )
}

/* ---------- 站长信息 ---------- */

function ProfileWidget({ widget }: { widget: SidebarWidget }) {
  const { data } = useQuery({
    queryKey: ['articles', 'profile-count'],
    queryFn: () => fetchArticles({ page: 1, page_size: 1 }),
  })
  const total = data?.total ?? 0

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-purple-500/10 p-5"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/15 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="relative">
          {widget.avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={widget.avatar}
              alt={widget.title}
              className="h-14 w-14 rounded-full border-2 border-accent/40 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent/40 bg-accent/15 text-xl font-black text-accent">
              {widget.title.charAt(0).toUpperCase()}
            </div>
          )}
          <motion.span
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{widget.title}</p>
          <p className="text-xs text-muted-foreground">站长 · 在线</p>
        </div>
      </div>
      {widget.content && (
        <p className="relative mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {widget.content}
        </p>
      )}
      <div className="relative mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-background/60 py-2">
          <p className="text-lg font-bold text-accent">
            <motion.span key={total} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {total}
            </motion.span>
          </p>
          <p className="text-[11px] text-muted-foreground">文章</p>
        </div>
        <div className="rounded-lg bg-background/60 py-2">
          <p className="text-lg font-bold text-purple-500">∞</p>
          <p className="text-[11px] text-muted-foreground">热爱</p>
        </div>
      </div>
    </motion.div>
  )
}

/* ---------- 天气（Open-Meteo，无需 API Key） ---------- */

const WEATHER_CODES: Record<number, { desc: string; Icon: typeof Sun }> = {
  0: { desc: '晴', Icon: Sun },
  1: { desc: '基本晴', Icon: Sun },
  2: { desc: '多云', Icon: Cloud },
  3: { desc: '阴', Icon: Cloud },
  45: { desc: '雾', Icon: CloudFog },
  48: { desc: '雾凇', Icon: CloudFog },
  51: { desc: '小毛雨', Icon: CloudDrizzle },
  53: { desc: '毛雨', Icon: CloudDrizzle },
  55: { desc: '大毛雨', Icon: CloudDrizzle },
  61: { desc: '小雨', Icon: Cloud },
  63: { desc: '中雨', Icon: Cloud },
  65: { desc: '大雨', Icon: Cloud },
  71: { desc: '小雪', Icon: CloudSnow },
  73: { desc: '中雪', Icon: CloudSnow },
  75: { desc: '大雪', Icon: CloudSnow },
  80: { desc: '阵雨', Icon: Cloud },
  81: { desc: '强阵雨', Icon: Cloud },
  82: { desc: '暴雨', Icon: Cloud },
  95: { desc: '雷暴', Icon: CloudLightning },
  96: { desc: '雷暴冰雹', Icon: CloudLightning },
  99: { desc: '强雷暴', Icon: CloudLightning },
}

interface WeatherData {
  temperature: number
  humidity: number
  wind: number
  code: number
  city: string
}

function WeatherWidget({ widget }: { widget: SidebarWidget }) {
  const city = widget.city || '北京'
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
        )
        const geo = (await geoRes.json()) as {
          results?: { latitude: number; longitude: number; name: string }[]
        }
        if (!geo.results?.length) throw new Error('no geo')
        const { latitude, longitude, name } = geo.results[0]
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`,
        )
        const w = (await res.json()) as {
          current?: {
            temperature_2m: number
            relative_humidity_2m: number
            weather_code: number
            wind_speed_10m: number
          }
        }
        if (!w.current) throw new Error('no weather')
        if (cancelled) return
        setWeather({
          temperature: Math.round(w.current.temperature_2m),
          humidity: w.current.relative_humidity_2m,
          wind: Math.round(w.current.wind_speed_10m),
          code: w.current.weather_code,
          city: name,
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [city])

  const info = weather ? WEATHER_CODES[weather.code] ?? WEATHER_CODES[0] : null

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-sky-500/10 via-card to-blue-500/10 p-5">
      <div className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl" />
      <h3 className="relative mb-3 text-sm font-semibold tracking-wide">{widget.title}</h3>
      {failed ? (
        <p className="relative text-sm text-muted-foreground">天气服务暂不可用</p>
      ) : !weather || !info ? (
        <div className="relative space-y-2">
          <div className="skeleton h-8 w-24 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">
                {weather.temperature}
                <span className="text-lg">°C</span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {info.desc} · {weather.city}
              </p>
            </div>
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            >
              <info.Icon className="h-12 w-12 text-sky-500" />
            </motion.div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Wind className="h-3.5 w-3.5" />
              {weather.wind} km/h
            </span>
            <span>湿度 {weather.humidity}%</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* ---------- 节日倒计时（内置春节表自动计算） ---------- */

const SPRING_FESTIVALS: { year: number; date: string }[] = [
  { year: 2026, date: '2026-02-17' },
  { year: 2027, date: '2027-02-06' },
  { year: 2028, date: '2028-01-26' },
  { year: 2029, date: '2029-02-13' },
  { year: 2030, date: '2030-02-03' },
  { year: 2031, date: '2031-01-23' },
  { year: 2032, date: '2032-02-11' },
  { year: 2033, date: '2033-01-31' },
  { year: 2034, date: '2034-02-19' },
  { year: 2035, date: '2035-02-08' },
]

function nextSpringFestival(): { date: Date; label: string } {
  const now = new Date()
  for (const f of SPRING_FESTIVALS) {
    const d = new Date(`${f.date}T00:00:00+08:00`)
    if (d.getTime() > now.getTime()) {
      return { date: d, label: `${f.year} 年春节` }
    }
  }
  return { date: new Date(`${SPRING_FESTIVALS[0].date}T00:00:00+08:00`), label: '春节' }
}

function CountdownWidget({ widget }: { widget: SidebarWidget }) {
  const auto = nextSpringFestival()
  const target = widget.date ? new Date(`${widget.date}T00:00:00+08:00`) : auto.date
  const label = widget.eventName || auto.label

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const diff = Math.max(0, target.getTime() - now)
  const cells: { value: number; unit: string }[] = [
    { value: Math.floor(diff / 86400000), unit: '天' },
    { value: Math.floor((diff % 86400000) / 3600000), unit: '时' },
    { value: Math.floor((diff % 3600000) / 60000), unit: '分' },
    { value: Math.floor((diff % 60000) / 1000), unit: '秒' },
  ]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-red-500/15 via-card to-orange-500/10 p-5">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 24, ease: 'linear' }}
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full border-[6px] border-dashed border-red-500/20"
      />
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
        className="pointer-events-none absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-orange-400/15 blur-xl"
      />
      <h3 className="relative mb-1 flex items-center gap-2 text-sm font-semibold tracking-wide">
        <motion.span
          animate={{ rotate: [0, -12, 12, 0] }}
          transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
        >
          🧨
        </motion.span>
        距离{label}
      </h3>
      <p className="relative text-xs text-muted-foreground">
        {target.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <div className="relative mt-4 grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.unit} className="rounded-lg bg-background/70 py-2.5 text-center shadow-sm">
            <motion.p
              key={c.value}
              initial={{ scale: 1.18, color: '#f97316' }}
              animate={{ scale: 1, color: 'inherit' }}
              transition={{ duration: 0.25 }}
              className="text-xl font-bold tabular-nums"
            >
              {String(c.value).padStart(2, '0')}
            </motion.p>
            <p className="text-[11px] text-muted-foreground">{c.unit}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- 实时时钟 ---------- */

function ClockWidget({ widget }: { widget: SidebarWidget }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-indigo-500/10 via-card to-cyan-500/10 p-5">
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-indigo-400/15 blur-2xl" />
      <h3 className="relative mb-2 text-sm font-semibold tracking-wide">{widget.title}</h3>
      <p className="relative text-4xl font-bold tabular-nums tracking-tight">
        {hh}
        <motion.span
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="text-indigo-400"
        >
          :
        </motion.span>
        {mm}
        <span className="text-xl text-muted-foreground">:{ss}</span>
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">
        {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{week}
      </p>
    </div>
  )
}

/* ---------- 站点统计 ---------- */

function StatsWidget({ title }: { title: string }) {
  const articlesQuery = useQuery({
    queryKey: ['articles', 'stats-total'],
    queryFn: () => fetchArticles({ page: 1, page_size: 1 }),
  })
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

  const stats = [
    { Icon: FileText, label: '文章', value: articlesQuery.data?.total ?? 0, color: 'text-blue-500' },
    { Icon: Folder, label: '分类', value: categoriesQuery.data?.categories.length ?? 0, color: 'text-purple-500' },
    { Icon: Tag, label: '标签', value: tagsQuery.data?.tags.length ?? 0, color: 'text-emerald-500' },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold tracking-wide">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            whileHover={{ y: -3 }}
            className="rounded-lg bg-muted/60 py-3 text-center"
          >
            <s.Icon className={`mx-auto h-4 w-4 ${s.color}`} />
            <motion.p
              key={s.value}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1 text-lg font-bold"
            >
              {s.value}
            </motion.p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ---------- 一言 ---------- */

function HitokotoWidget({ widget }: { widget: SidebarWidget }) {
  const [quote, setQuote] = useState<{ text: string; from: string } | null>(null)
  const [refreshedAt, setRefreshedAt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('https://v1.hitokoto.cn/?c=i&c=k&c=d')
      .then((r) => r.json())
      .then((d: { hitokoto: string; from?: string }) => {
        if (!cancelled) setQuote({ text: d.hitokoto, from: d.from ?? '' })
      })
      .catch(() => {
        if (!cancelled) setQuote({ text: '凡是过往，皆为序章。', from: '莎士比亚' })
      })
    return () => {
      cancelled = true
    }
  }, [refreshedAt])

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
          <Quote className="h-3.5 w-3.5 text-accent" />
          {widget.title}
        </h3>
        <button
          type="button"
          onClick={() => setRefreshedAt((n) => n + 1)}
          title="换一句"
          className="text-xs text-muted-foreground transition-colors hover:text-accent"
        >
          ↻ 换一句
        </button>
      </div>
      {quote ? (
        <motion.div
          key={quote.text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-sm leading-relaxed text-foreground/85">「{quote.text}」</p>
          {quote.from && <p className="mt-2 text-right text-xs text-muted-foreground">—— {quote.from}</p>}
        </motion.div>
      ) : (
        <div className="skeleton h-12 w-full rounded" />
      )}
    </div>
  )
}

/* ---------- 渲染分发 ---------- */

export function WidgetRenderer({ widget }: { widget: SidebarWidget }) {
  switch (widget.type) {
    case 'about':
      return (
        <WidgetCard title={widget.title}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {widget.content || '站点简介'}
          </p>
        </WidgetCard>
      )
    case 'hot':
      return <HotWidget limit={widget.limit} title={widget.title} />
    case 'tags':
      return <TagsWidget limit={widget.limit} title={widget.title} />
    case 'search':
      return <SearchWidget title={widget.title} />
    case 'html':
      return <HtmlWidget title={widget.title} content={widget.content} />
    case 'profile':
      return <ProfileWidget widget={widget} />
    case 'weather':
      return <WeatherWidget widget={widget} />
    case 'countdown':
      return <CountdownWidget widget={widget} />
    case 'clock':
      return <ClockWidget widget={widget} />
    case 'stats':
      return <StatsWidget title={widget.title} />
    case 'hitokoto':
      return <HitokotoWidget widget={widget} />
    default:
      return null
  }
}
