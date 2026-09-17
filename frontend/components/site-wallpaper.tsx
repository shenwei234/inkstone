'use client'

import { useEffect, useState } from 'react'
import { useSiteConfig } from '@/components/site-config-context'

/**
 * 全站自定义壁纸：作为固定背景层铺在内容之下。
 * 支持不透明度与模糊，避免影响正文可读性。
 */
export function SiteWallpaper() {
  const site = useSiteConfig()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!site.wallpaper) return
    const img = new Image()
    img.src = site.wallpaper
    img.onload = () => setLoaded(true)
  }, [site.wallpaper])

  if (!site.wallpaper) return null

  const opacity = Math.min(100, Math.max(0, site.wallpaperOpacity)) / 100
  const blur = Math.min(20, Math.max(0, site.wallpaperBlur))

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-700 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={site.wallpaper}
        alt=""
        className="h-full w-full object-cover"
        style={{ opacity, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      />
    </div>
  )
}
