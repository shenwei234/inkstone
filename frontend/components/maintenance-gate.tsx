'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { gsap } from 'gsap'
import { Construction } from 'lucide-react'
import { useSiteConfig } from '@/components/site-config-context'
import { useAuth } from '@/lib/auth-context'
import { prefersReducedMotion } from '@/components/gsap'

/**
 * 全屏「网站维护中」页面。背景不透明（首帧即实底，无白屏闪烁），
 * 内部图标/文案用 GSAP 交错淡入，齿轮持续旋转。
 */
function MaintenanceScreen() {
  const iconRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLParagraphElement>(null)
  const site = useSiteConfig()

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (iconRef.current) {
        gsap.fromTo(
          iconRef.current,
          { opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)' },
        )
        if (!prefersReducedMotion()) {
          gsap.to(iconRef.current, {
            rotation: 360,
            duration: 9,
            repeat: -1,
            ease: 'none',
            transformOrigin: '50% 50%',
          })
        }
      }
      if (titleRef.current) {
        gsap.fromTo(titleRef.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.15, ease: 'power3.out' })
      }
      if (subRef.current) {
        gsap.fromTo(subRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.28, ease: 'power3.out' })
      }
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div
        ref={iconRef}
        className="flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/10 text-accent"
        style={{ opacity: 0 }}
      >
        <Construction className="h-10 w-10" />
      </div>
      <h1 ref={titleRef} className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl" style={{ opacity: 0 }}>
        网站维护中
      </h1>
      <p ref={subRef} className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground" style={{ opacity: 0 }}>
        我们正在加紧升级，让 {site.siteName || '本站'} 变得更好。请稍后再来。
      </p>
    </div>
  )
}

/**
 * 维护门禁：开启维护模式时，非管理员访客（且不在登录页）看到全屏维护页。
 * 管理员始终可正常浏览（便于管理）；/login 始终放行，避免管理员被挡在登录外。
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const site = useSiteConfig()
  const { user, loading } = useAuth()
  const pathname = usePathname()

  const isAdmin = user?.role === 'admin'
  const active = site.loaded && !loading && site.maintenanceMode && !isAdmin && pathname !== '/login'

  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [active])

  if (active) return <MaintenanceScreen />
  return <>{children}</>
}
