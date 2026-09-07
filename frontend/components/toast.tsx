'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useRef, useState } from 'react'

export interface ToastItem {
  id: number
  type: 'success' | 'error'
  message: string
  slug?: string
}

export function useToasts(duration = 4000) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const push = useCallback(
    (type: ToastItem['type'], message: string, slug?: string) => {
      const id = ++idRef.current
      setToasts((t) => [...t.slice(-3), { id, type, message, slug }])
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id))
      }, duration)
    },
    [duration],
  )

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  return { toasts, push, dismiss }
}

export function ToastStack({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[]
  dismiss: (id: number) => void
}) {
  return (
    <div className="pointer-events-none fixed bottom-10 right-6 z-[120] flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 56, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl shadow-black/10 backdrop-blur ${
              t.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/85 dark:text-emerald-200'
                : 'border-red-200 bg-red-50/95 text-red-700 dark:border-red-900/50 dark:bg-red-950/85 dark:text-red-300'
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                t.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            >
              {t.type === 'success' ? '✓' : '!'}
            </span>
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
              <p>{t.message}</p>
              {t.slug && (
                <Link
                  href={`/posts/${t.slug}`}
                  target="_blank"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4 opacity-80 transition-opacity hover:opacity-100"
                >
                  查看文章 ↗
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-lg leading-none opacity-50 transition-opacity hover:opacity-100"
              aria-label="关闭"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
