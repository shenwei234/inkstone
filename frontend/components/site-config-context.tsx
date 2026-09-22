'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchSiteConfig } from '@/lib/api'
import type { CaptchaConfig, EmailCodeConfig } from '@/lib/api'

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
  captcha: CaptchaConfig
  emailCode: EmailCodeConfig
  wallpaper: string
  wallpaperOpacity: number
  wallpaperBlur: number
  articleSidebar: boolean
  allowRegistration: boolean
  maintenanceMode: boolean
  loaded: boolean
}

const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'InkStone',
  siteDescription: 'InkStone — 现代化多用户博客系统',
  siteLogo: '',
  siteFavicon: '',
  siteIcp: '',
  navMenu: [],
  widgets: [],
  sidebarPosition: 'right',
  captcha: {
    provider: 'none',
    site_key: '',
    on_register: false,
    on_login: false,
    on_comment: false,
    on_article: false,
  },
  emailCode: { on_register: false, on_login: false },
  wallpaper: '',
  wallpaperOpacity: 100,
  wallpaperBlur: 0,
  articleSidebar: true,
  allowRegistration: true,
  maintenanceMode: false,
  loaded: false,
}

const SiteConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG)

interface SiteConfigActions {
  /** 重新拉取站点配置（如后台改动设置后刷新前台状态） */
  refresh: () => void
}
const SiteConfigActionsContext = createContext<SiteConfigActions>({ refresh: () => {} })

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
  captcha?: Partial<CaptchaConfig>
  email_code?: Partial<EmailCodeConfig>
  site_wallpaper?: string
  wallpaper_opacity?: string
  wallpaper_blur?: string
  article_sidebar?: string
  maintenance_mode?: string
}

function parseItems<T>(raw: unknown, validate: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => validate(item))
    .filter((item): item is T => item !== null)
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG)

  const loadConfig = useCallback(() => {
    fetchSiteConfig()
      .then((raw) => {
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
          captcha: {
            provider: (cfg.captcha?.provider ?? 'none') as CaptchaConfig['provider'],
            site_key: cfg.captcha?.site_key ?? '',
            geetest_captcha_id: cfg.captcha?.geetest_captcha_id ?? '',
            on_register: cfg.captcha?.on_register ?? false,
            on_login: cfg.captcha?.on_login ?? false,
            on_comment: cfg.captcha?.on_comment ?? false,
            on_article: cfg.captcha?.on_article ?? false,
          },
          emailCode: {
            on_register: cfg.email_code?.on_register ?? false,
            on_login: cfg.email_code?.on_login ?? false,
          },
          wallpaper: cfg.site_wallpaper ?? '',
          wallpaperOpacity: Number(cfg.wallpaper_opacity ?? 100) || 100,
          wallpaperBlur: Number(cfg.wallpaper_blur ?? 0) || 0,
          articleSidebar: cfg.article_sidebar !== 'false',
          maintenanceMode: cfg.maintenance_mode === 'true',
          loaded: true,
        }
        setConfig(next)

        // 有壁纸时给 body 加标记类，便于样式做半透明处理
        if (next.wallpaper) {
          document.body.classList.add('has-wallpaper')
        } else {
          document.body.classList.remove('has-wallpaper')
        }

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
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const actions = useMemo<SiteConfigActions>(() => ({ refresh: loadConfig }), [loadConfig])

  return (
    <SiteConfigContext.Provider value={config}>
      <SiteConfigActionsContext.Provider value={actions}>{children}</SiteConfigActionsContext.Provider>
    </SiteConfigContext.Provider>
  )
}

export function useSiteConfig() {
  return useContext(SiteConfigContext)
}

export function useSiteConfigActions() {
  return useContext(SiteConfigActionsContext)
}
