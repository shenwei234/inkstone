'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Archive,
  BookOpen,
  Bookmark,
  Calendar,
  Camera,
  Clock,
  Code,
  Coffee,
  FileText,
  Flame,
  Folder,
  Gamepad2,
  Gift,
  GitBranch,
  Globe,
  Heart,
  Home,
  Image,
  Info,
  Leaf,
  Link,
  Mail,
  MapPin,
  MessageSquare,
  Music,
  PenLine,
  Phone,
  Rss,
  Search,
  Settings,
  Sparkles,
  Star,
  Tag,
  User,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'

export const MENU_ICONS: Record<string, LucideIcon> = {
  home: Home,
  file: FileText,
  info: Info,
  mail: Mail,
  heart: Heart,
  star: Star,
  bookmark: Bookmark,
  tag: Tag,
  folder: Folder,
  archive: Archive,
  user: User,
  users: Users,
  message: MessageSquare,
  image: Image,
  camera: Camera,
  music: Music,
  video: Video,
  game: Gamepad2,
  code: Code,
  book: BookOpen,
  pen: PenLine,
  link: Link,
  github: GitBranch,
  rss: Rss,
  settings: Settings,
  search: Search,
  map: MapPin,
  phone: Phone,
  calendar: Calendar,
  clock: Clock,
  gift: Gift,
  coffee: Coffee,
  leaf: Leaf,
  flame: Flame,
  sparkles: Sparkles,
  globe: Globe,
}

export const MENU_ICON_NAMES = Object.keys(MENU_ICONS)

export function MenuIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && MENU_ICONS[name]) || null
  if (!Icon) return null
  return <Icon className={className ?? 'h-4 w-4'} />
}

export function IconPicker({
  value,
  onChange,
}: {
  value?: string
  onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = value && MENU_ICONS[value] ? value : null
  const CurrentIcon = current ? MENU_ICONS[current] : null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="选择图标"
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          CurrentIcon
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-dashed border-border text-muted-foreground hover:border-accent/40 hover:text-accent'
        }`}
      >
        {CurrentIcon ? <CurrentIcon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </button>

      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full z-[90] mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/15"
          >
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">选择菜单图标（可选）</p>
            <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                title="无图标"
                className={`flex h-9 items-center justify-center rounded-md text-[10px] transition-colors ${
                  !value ? 'bg-accent text-white' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                无
              </button>
              {MENU_ICON_NAMES.map((name) => {
                const Icon = MENU_ICONS[name]
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => {
                      onChange(name)
                      setOpen(false)
                    }}
                    className={`flex h-9 items-center justify-center rounded-md transition-colors ${
                      value === name
                        ? 'bg-accent text-white'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}
