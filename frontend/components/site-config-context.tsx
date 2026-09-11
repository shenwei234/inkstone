'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchSiteConfig } from '@/lib/api'

export interface NavMenuItem {
  label: string
  url: string
  icon?: string
}

export type WidgetType =
  | 'about'
  | 'hot'
  | 'tags'
  | 'search'
  | 'html'
  | 'profile'
  | 'weather'
  | 'countdown'
  | 'clock'
  | 'stats'
  | 'hitokoto'

export interface SidebarWidget {
  type: WidgetType
  title: string
  content?: string
  limit?: number
  city?: string
  avatar?: string
  date?: string
  eventName?: string
}

export interface SiteConfig {
  siteName: string
  siteDescription: string
  siteLogo: string
  siteFavicon: string
  siteIcp: string
  navMenu: NavMenuItem[]
  widgets: SidebarWidget[]
  sidebarPosition: 'left' | 'right'
  allowRegistration: boolean
  loaded: boolean
}

const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'Blog 平台',
  siteDescription: '多用户博客平台',
  siteLogo: '',
  siteFavicon: '',
  siteIcp: '',
  navMenu: [],
  widgets: [],
  sidebarPosition: 'right',
  allowRegistration: true,
  loaded: false,
}

const SiteConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG)

interface RawSiteConfig {
  site_name?: string
  site_description?: string
  site_logo?: string
  site_favicon?: string
  site_icp?: string
  allow_registration?: boolean
  nav_menu?: unknown
  sidebar_widgets?: unknown
  sidebar_position?: string
}

function parseItems<T>(raw: unknown, validate: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => validate(item))
    .filter((item): item is T => item !== null)
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    let cancelled = false
    fetchSiteConfig()
      .then((raw) => {
        if (cancelled) return
        const cfg = raw as RawSiteConfig
        const next: SiteConfig = {
          siteName: cfg.site_name || DEFAULT_CONFIG.siteName,
          siteDescription: cfg.site_description || DEFAULT_CONFIG.siteDescription,
          siteLogo: cfg.site_logo || '',
          siteFavicon: cfg.site_favicon || '',
          siteIcp: cfg.site_icp || '',
          navMenu: parseItems(cfg.nav_menu, (item) => {
            const m = item as { label?: string; url?: string; icon?: string }
            if (m && typeof m.label === 'string' && typeof m.url === 'string') {
              return {
                label: m.label,
                url: m.url,
                icon: typeof m.icon === 'string' ? m.icon : undefined,
              }
            }
            return null
          }),
          widgets: parseItems(cfg.sidebar_widgets, (item) => {
            const w = item as {
              type?: string
              title?: string
              content?: string
              limit?: number
              city?: string
              avatar?: string
              date?: string
              eventName?: string
            }
            if (w && typeof w.type === 'string' && typeof w.title === 'string') {
              return {
                type: w.type as WidgetType,
                title: w.title,
                content: typeof w.content === 'string' ? w.content : '',
                limit: typeof w.limit === 'number' ? w.limit : undefined,
                city: typeof w.city === 'string' ? w.city : undefined,
                avatar: typeof w.avatar === 'string' ? w.avatar : undefined,
                date: typeof w.date === 'string' ? w.date : undefined,
                eventName: typeof w.eventName === 'string' ? w.eventName : undefined,
              }
            }
            return null
          }),
          allowRegistration: cfg.allow_registration !== false,
          sidebarPosition: cfg.sidebar_position === 'left' ? 'left' : 'right',
          loaded: true,
        }
        setConfig(next)

        // Apply browser tab title and favicon dynamically.
        document.title = next.siteName
        if (next.siteFavicon) {
          let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
          if (!link) {
            link = document.createElement('link')
            link.rel = 'icon'
            document.head.appendChild(link)
          }
          link.href = next.siteFavicon
        }
      })
      .catch(() => setConfig((c) => ({ ...c, loaded: true })))
    return () => {
      cancelled = true
    }
  }, [])

  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>
}

export function useSiteConfig() {
  return useContext(SiteConfigContext)
}
