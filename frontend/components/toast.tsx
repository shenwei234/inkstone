'use client'

import Link from 'next/link'
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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Presence, hoverTapScale } from '@/components/motion'

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

/** 单条 toast：普通 div + CSS keyframes 自绘入场，DOM 引用交由 Provider 收集用于退场 */
function ToastCard({
  t,
  onClose,
  register,
}: {
  t: ToastItem
  onClose: () => void
  register: (id: number, el: HTMLDivElement | null) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={(el) => {
        elRef.current = el
        register(t.id, el)
      }}
      className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/20 ${
        t.type === 'success'
          ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950'
          : 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500 dark:text-red-950'
      }`}
    >
      <span className="mt-0.5 shrink-0 opacity-90">
        {t.type === 'success' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <p className="font-medium">{t.message}</p>
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
        onClick={onClose}
        className="shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}


export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null)
  // 确认框内容快照：closeConfirm 后仍保留一份供 Presence 退场动画期间渲染
  const [dialogShown, setDialogShown] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  // 收集每条 toast 的 DOM，供退场动画定位
  const itemEls = useRef(new Map<number, HTMLDivElement>())

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    },
    [],
  )

  const registerToast = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) itemEls.current.set(id, el)
    else itemEls.current.delete(id)
  }, [])

  // 关闭单个 toast：CSS 退场动画结束后从列表移除
  const closeToast = useCallback((id: number) => {
    const el = itemEls.current.get(id)
    const remove = () => setToasts((t) => t.filter((x) => x.id !== id))
    if (el) {
      el.classList.add('toast-leave')
      el.addEventListener('animationend', remove, { once: true })
    } else {
      remove()
    }
    // 兜底：动画事件未触发（浏览器异常/元素已 detached）也保证快速移除
    setTimeout(remove, 600)
  }, [])

  const push = useCallback(
    (type: ToastItem['type'], message: string, slug?: string) => {
      const id = ++idRef.current
      setToasts((t) => [...t.slice(-3), { id, type, message, slug }])
      const timer = setTimeout(() => {
        closeToast(id)
        timersRef.current = timersRef.current.filter((t) => t !== timer)
      }, 4000)
      timersRef.current.push(timer)
    },
    [closeToast],
  )

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialogShown({ ...opts, resolve })
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

  const value = useMemo<NotifyContextValue>(
    () => ({
      toast: push,
      success: (m: string, slug?: string) => push('success', m, slug),
      error: (m: string) => push('error', m),
      confirm,
    }),
    [push, confirm],
  )

  return (
    <NotifyContext.Provider value={value}>
      {children}

      {/* Toast stack (site-wide default notification)
          底边让出回顶按钮高度（bottom-6 + h-11 ≈ 68px）：bottom-20 使 toast
          底边高于按钮顶部，避免半透明卡片 + backdrop-blur 糊住右下角回顶按钮 */}
      <div className="pointer-events-none fixed bottom-20 right-6 z-[120] flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastCard key={t.id} t={t} onClose={() => closeToast(t.id)} register={registerToast} />
        ))}
      </div>

      {/* Site-wide default confirm dialog */}
      <Presence
        show={!!confirmState}
        duration={0.15}
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeConfirm(false)
        }}
      >
        <Presence
          show={!!confirmState}
          y={12}
          scale={0.94}
          duration={0.2}
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
                dialogShown?.danger ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
              }`}
            >
              {dialogShown?.danger ? (
                <Trash2 className="h-6 w-6" />
              ) : (
                <HelpCircle className="h-6 w-6" />
              )}
            </div>
            <h3 className="mt-4 text-base font-semibold">{dialogShown?.title}</h3>
            {dialogShown?.message && (
              <p className="mt-1.5 break-all text-sm text-muted-foreground">
                {dialogShown.message}
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-center gap-3 px-6 pb-6">
            <button
              type="button"
              onClick={() => closeConfirm(false)}
              className="min-w-24 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {dialogShown?.cancelText ?? '取消'}
            </button>
            <button
              {...hoverTapScale}
              ref={confirmBtnRef}
              type="button"
              onClick={() => closeConfirm(true)}
              className={`min-w-24 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md disabled:opacity-50 ${
                dialogShown?.danger
                  ? 'bg-red-500 shadow-red-500/25'
                  : 'bg-accent shadow-accent/25'
              }`}
            >
              {dialogShown?.confirmText ?? '确定'}
            </button>
          </div>
        </Presence>
      </Presence>
    </NotifyContext.Provider>
  )
}
