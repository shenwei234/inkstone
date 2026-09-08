'use client'

import { useSiteConfig } from '@/components/site-config-context'

export function SiteFooter() {
  const site = useSiteConfig()
  return (
    <footer className="border-t border-border py-8">
      <p className="mx-auto max-w-5xl px-4 text-sm text-muted-foreground">
        {site.siteName} · Powered by Next.js + Gin
        {site.siteIcp && (
          <>
            {' · '}
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {site.siteIcp}
            </a>
          </>
        )}
      </p>
    </footer>
  )
}
