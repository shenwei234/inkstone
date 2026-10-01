'use client'

import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { prefersReducedMotion } from '@/components/motion'

interface LoaderRefs {
  bar: { current: HTMLDivElement | null }
  tween: { current: gsap.core.Tween | null }
  failSafe: { current: ReturnType<typeof setTimeout> | null }
  active: { current: boolean }
}

/** 进度条启动：0 → 82% 缓动；6s 兜底自动收尾，避免异常时卡住 */
function startProgress(r: LoaderRefs) {
  if (r.active.current || prefersReducedMotion()) return
  r.active.current = true
  const bar = r.bar.current
  if (!bar) return
  gsap.killTweensOf(bar)
  // scaleX 代替 width：width 动画每帧触发 layout 重排（长页面卡顿源）
  gsap.set(bar, { scaleX: 0, opacity: 1, transformOrigin: 'left center' })
  r.tween.current = gsap.to(bar, { scaleX: 0.82, duration: 2.4, ease: 'power2.out' })
  r.failSafe.current = setTimeout(() => finishProgress(r), 6000)
}

/** 进度条收尾：冲到 100% 后淡出复位 */
function finishProgress(r: LoaderRefs) {
  if (!r.active.current) return
  r.active.current = false
  if (r.failSafe.current) {
    clearTimeout(r.failSafe.current)
    r.failSafe.current = null
  }
  const bar = r.bar.current
  if (!bar) return
  r.tween.current?.kill()
  gsap.killTweensOf(bar)
  gsap.timeline()
    .to(bar, { scaleX: 1, duration: 0.16, ease: 'power2.out' })
    .to(bar, { opacity: 0, duration: 0.24, ease: 'power2.in' })
}

/**
 * 路由切换加载动画（全局顶部进度条）。
 * - 点击站内链接 / router.push / 浏览器前进后退 → GSAP 进度条从 0 缓动到 82%
 * - pathname 变化（新页面就绪）→ 冲到 100% 后淡出复位
 *
 * 过渡期间只显示这条加载动画：页面内的数据加载态统一用
 * components/page-loader.tsx 的 PageLoading / RowLoading / Spinner，不再显示骨架图。
 */
export function RouteLoader() {
  const pathname = usePathname()
  const barRef = useRef<HTMLDivElement>(null)
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const failSafeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  // 拦截站内链接点击（capture 阶段，早于路由跳转）
  useEffect(() => {
    const refs: LoaderRefs = { bar: barRef, tween: tweenRef, failSafe: failSafeRef, active: activeRef }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname + url.search === window.location.pathname + window.location.search) return
      startProgress(refs)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname])

  // 覆盖编程式导航：App Router 的 router.push 内部走 history.pushState
  useEffect(() => {
    const refs: LoaderRefs = { bar: barRef, tween: tweenRef, failSafe: failSafeRef, active: activeRef }
    const rawPush = history.pushState.bind(history)
    history.pushState = (...args: Parameters<typeof rawPush>) => {
      startProgress(refs)
      return rawPush(...args)
    }
    return () => {
      history.pushState = rawPush
    }
  }, [])

  // 浏览器前进/后退
  useEffect(() => {
    const refs: LoaderRefs = { bar: barRef, tween: tweenRef, failSafe: failSafeRef, active: activeRef }
    const onPop = () => startProgress(refs)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // pathname 变化即认为新页面就绪
  useEffect(() => {
    const refs: LoaderRefs = { bar: barRef, tween: tweenRef, failSafe: failSafeRef, active: activeRef }
    finishProgress(refs)
  }, [pathname])

  // 卸载时清理兜底定时器
  useEffect(
    () => () => {
      if (failSafeRef.current) clearTimeout(failSafeRef.current)
    },
    [],
  )

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[140] h-[2.5px] overflow-hidden"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left scale-x-0 rounded-r-full bg-gradient-to-r from-accent/50 via-accent to-accent opacity-0 shadow-[0_0_10px_1px_rgba(99,102,241,0.55)]"
      />
    </div>
  )
}
