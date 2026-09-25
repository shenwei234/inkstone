'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'

/** 是否偏好「减少动效」——用于跳过 GSAP 循环/位移动画（framer 侧由 MotionConfig 统一处理） */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 复用 GSAP 动画组件（命令式，随卸载自动清理 tween）。
 * 约定与 components/modal.tsx 一致：用 ref + gsap.fromTo/to，repeat:-1 的循环动画在
 * useEffect 清理时 kill，避免内存泄漏与后台空转。
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

/**
 * 注意力脉冲：雷达式光晕（boxShadow 扩散），不改变布局。
 * active 为 false 时停止并复位。
 */
export function GsapPulse({
  children,
  active = true,
  color = '16, 185, 129',
  className,
}: {
  children: ReactNode
  active?: boolean
  /** RGB 三色，如 '16, 185, 129' */
  color?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!active || prefersReducedMotion()) {
      gsap.set(el, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' })
      return
    }
    const tween = gsap.fromTo(
      el,
      { boxShadow: `0 0 0 0 rgba(${color}, 0.55)` },
      {
        boxShadow: `0 0 0 14px rgba(${color}, 0)`,
        duration: 1.5,
        repeat: -1,
        ease: 'power1.out',
      },
    )
    return () => {
      tween.kill()
      gsap.set(el, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' })
    }
  }, [active, color])

  return (
    <div ref={ref} className={`inline-flex rounded-lg ${className ?? ''}`}>
      {children}
    </div>
  )
}

/** GSAP 旋转加载环 */
export function GsapSpinner({ size = 44, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const tween = gsap.to(el, {
      rotation: 360,
      duration: 1,
      repeat: -1,
      ease: 'none',
      transformOrigin: '50% 50%',
    })
    return () => {
      tween.kill()
    }
  }, [])

  return (
    <div
      ref={ref}
      style={{ width: size, height: size }}
      className={`rounded-full border-[3px] border-muted border-t-accent ${className ?? ''}`}
      role="status"
      aria-label="加载中"
    />
  )
}

/** 进度条：value 为确定进度(0-100)，indeterminate 为不确定循环动画 */
export function GsapProgress({
  value,
  indeterminate = false,
  className,
}: {
  value?: number
  indeterminate?: boolean
  className?: string
}) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    if (indeterminate) {
      const tween = gsap.fromTo(
        bar,
        { x: '-100%', width: '40%' },
        { x: '260%', width: '40%', duration: 1.3, repeat: -1, ease: 'power1.inOut' },
      )
      return () => {
        tween.kill()
      }
    }
    const tween = gsap.to(bar, { width: `${Math.max(0, Math.min(100, value ?? 0))}%`, duration: 0.4, ease: 'power2.out' })
    return () => {
      tween.kill()
    }
  }, [value, indeterminate])

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div
        ref={barRef}
        className="h-full rounded-full bg-gradient-to-r from-accent to-purple-500"
        style={indeterminate ? { width: '40%' } : { width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
      />
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
