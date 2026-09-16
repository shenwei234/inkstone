'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { easeOut } from '@/components/motion'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Trash2,
  X,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface ToastItem {
  id: number
  type: 'success' | 'error'
  message: string
  slug?: string
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface NotifyContextValue {
  toast: (type: ToastItem['type'], message: string, slug?: string) => void
  success: (message: string, slug?: string) => void
  error: (message: string) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const NotifyContext = createContext<NotifyContextValue | undefined>(undefined)

export function useNotify() {
  const ctx = useContext(NotifyContext)
  if (!ctx) throw new Error('useNotify must be used within NotifyProvider')
  return ctx
}


export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((type: ToastItem['type'], message: string, slug?: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t.slice(-3), { id, type, message, slug }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve })
      }),
    [],
  )

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((s) => {
      s?.resolve(value)
      return null
    })
  }, [])

  useEffect(() => {
    if (confirmState) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus())
    }
  }, [confirmState])

  const value: NotifyContextValue = {
    toast: push,
    success: (m, slug) => push('success', m, slug),
    error: (m) => push('error', m),
    confirm,
  }

  return (
    <NotifyContext.Provider value={value}>
      {children}

      {/* Toast stack (site-wide default notification) */}
      <div className="pointer-events-none fixed bottom-10 right-6 z-[120] flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 56, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl shadow-black/10 backdrop-blur ${
                t.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/85 dark:text-emerald-200'
                  : 'border-red-200 bg-red-50/95 text-red-700 dark:border-red-900/50 dark:bg-red-950/85 dark:text-red-300'
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 ${
                  t.type === 'success' ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {t.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1 text-sm leading-relaxed">
                <p>{t.message}</p>
                {t.slug && (
                  <Link
                    href={`/posts/${t.slug}`}
                    target="_blank"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4 opacity-80 transition-opacity hover:opacity-100"
                >
                  查看文章
                  <ExternalLink className="h-3 w-3" />
                </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-0.5 opacity-50 transition-opacity hover:opacity-100"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Site-wide default confirm dialog */}
      <AnimatePresence>
        {confirmState && (
          <motion.div
            key="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeConfirm(false)
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: easeOut }}
              className="w-[400px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/25"
              role="alertdialog"
              aria-modal="true"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeConfirm(false)
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  closeConfirm(true)
                }
              }}
            >
              <div className="px-6 pt-6 text-center">
                <div
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                    confirmState.danger ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
                  }`}
                >
                  {confirmState.danger ? (
                    <Trash2 className="h-6 w-6" />
                  ) : (
                    <HelpCircle className="h-6 w-6" />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold">{confirmState.title}</h3>
                {confirmState.message && (
                  <p className="mt-1.5 break-all text-sm text-muted-foreground">
                    {confirmState.message}
                  </p>
                )}
              </div>
              <div className="mt-6 flex justify-center gap-3 px-6 pb-6">
                <button
                  type="button"
                  onClick={() => closeConfirm(false)}
                  className="min-w-24 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  {confirmState.cancelText ?? '取消'}
                </button>
                <motion.button
                  ref={confirmBtnRef}
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => closeConfirm(true)}
                  className={`min-w-24 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md disabled:opacity-50 ${
                    confirmState.danger
                      ? 'bg-red-500 shadow-red-500/25'
                      : 'bg-accent shadow-accent/25'
                  }`}
                >
                  {confirmState.confirmText ?? '确定'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotifyContext.Provider>
  )
}
