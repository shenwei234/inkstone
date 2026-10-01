'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '@/components/motion'

/**
 * 复用 GSAP 动画组件（命令式，随卸载自动清理 tween）。
 * 循环（repeat:-1）动画已全部迁往 components/motion.tsx 的 createLoop 统一纳管，
 * 本文件只保留后台设置页仍在使用的 GsapReveal / GsapSwitch。
 */

/** 入场揭示：淡入 + 上移，delay 支持交错 */
export function GsapReveal({
  children,
  className,
  delay = 0,
  y = 16,
  duration = 0.5,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0 })
      return
    }
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y },
      {
        opacity: 1,
        y: 0,
        duration,
        delay,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      },
    )
    return () => {
      tween.kill()
    }
  }, [delay, y, duration])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** GSAP 开关：滑块用 GSAP 滑动，轨道颜色随 checked 切换 */
export function GsapSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  const knobRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const knob = knobRef.current
    if (!knob) return
    gsap.to(knob, { x: checked ? 20 : 0, duration: 0.28, ease: 'power2.out' })
  }, [checked])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
        checked ? 'bg-emerald-500' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        ref={knobRef}
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md"
      />
    </button>
  )
}
