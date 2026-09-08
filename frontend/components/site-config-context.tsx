'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchSiteConfig } from '@/lib/api'

export interface SiteConfig {
  siteName: string
  siteDescription: string
  siteLogo: string
  siteFavicon: string
  siteIcp: string
  allowRegistration: boolean
  loaded: boolean
}

const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'Blog 平台',
  siteDescription: '多用户博客平台',
  siteLogo: '',
  siteFavicon: '',
  siteIcp: '',
  allowRegistration: true,
  loaded: false,
}

const SiteConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG)

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    let cancelled = false
    fetchSiteConfig()
      .then((cfg) => {
        if (cancelled) return
        const next: SiteConfig = {
          siteName: cfg.site_name || DEFAULT_CONFIG.siteName,
          siteDescription: cfg.site_description || DEFAULT_CONFIG.siteDescription,
          siteLogo: cfg.site_logo || '',
          siteFavicon: cfg.site_favicon || '',
          siteIcp: cfg.site_icp || '',
          allowRegistration: cfg.allow_registration !== false,
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
