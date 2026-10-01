'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { hoverTapScale } from './motion'

/**
 * 显示 / 隐藏阈值带滞回：在临界点（480px）附近来回微调滚动时，
 * 若用单阈值按钮会反复挂载/卸载并重播入场动画，表现为图标闪烁。
 * 向上穿过 480 才显示，向下穿过 320 才隐藏。
 */
const SHOW_AT = 480
const HIDE_AT = 320

/**
 * 回到顶部悬浮按钮：滚动超过一屏后出现，点击平滑回顶。
 * 入场用纯 CSS keyframes（globals.css 的 .animate-scale-in，走合成器线程）：
 * GSAP 的 opacity tween 在远程桌面/窗口遮挡时 rAF 被节流会停在透明态，
 * 表现为「滚动后回顶图标半天不显示」。
 *
 * 注意：rAF gate 的句柄必须是 effect 内**局部变量**（article-toc 同款），
 * 不能用 useRef——StrictMode 会 cleanup（cancelAnimationFrame）后重放 effect，
 * useRef 的残留非零 id 会让 gate 永久关闭，按钮再也不显示。
 */
export function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setShow((prev) => {
          const next = window.scrollY > (prev ? HIDE_AT : SHOW_AT)
          return next === prev ? prev : next
        })
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  if (!show) return null

  return (
    <button
      {...hoverTapScale}
      type="button"
      aria-label="回到顶部"
      title="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="group fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-11 w-11 animate-scale-in items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg shadow-black/5 backdrop-blur transition-colors hover:border-accent/40 hover:text-accent dark:shadow-black/40"
    >
      <ArrowUp
        className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5"
        strokeWidth={2.25}
      />
    </button>
  )
}
