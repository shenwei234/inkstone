'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  width?: number
  /** 底部操作区（按钮组） */
  footer?: ReactNode
}

/**
 * 全站统一弹窗：用 createPortal 渲染到 document.body，
 * 避免被后台等容器里带 transform 的祖先元素困住（position:fixed 失效）。
 * 动画由 gsap 完成：遮罩淡入 + 卡片弹性放大。
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 打开时锁定 body 滚动
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    // 等一帧确保 DOM 已挂载
    const raf = requestAnimationFrame(() => {
      if (overlayRef.current) {
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' })
      }
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0, scale: 0.9, y: 20 },
          { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.4)' },
        )
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  if (!open) return null

  const closeWithAnim = () => {
    if (cardRef.current && overlayRef.current) {
      gsap.to(cardRef.current, { opacity: 0, scale: 0.94, y: 12, duration: 0.18, ease: 'power2.in' })
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: onClose,
      })
    } else {
      onClose()
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeWithAnim()
      }}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      style={{ opacity: 0 }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
        className="my-10 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xl shadow-black/25"
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title && <p className="text-sm font-semibold">{title}</p>}
              {description && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeWithAnim}
              aria-label="关闭"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="border-t border-border bg-muted/30 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
