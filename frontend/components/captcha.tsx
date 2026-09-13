'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchCaptchaChallenge } from '@/lib/api'
import type { CaptchaConfig } from '@/lib/api'

export interface CaptchaResult {
  captcha_token?: string
  captcha_answer?: string
}

interface Props {
  config: CaptchaConfig | undefined
  action: 'register' | 'login' | 'comment' | 'article'
  onChange: (result: CaptchaResult) => void
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
    initGeetest4?: (
      opts: Record<string, unknown>,
      callback: (gt: GeeTestInstance) => void,
    ) => void
  }
}

interface GeeTestInstance {
  onSuccess: (cb: () => void) => void
  onError: (cb: () => void) => void
  onClose?: (cb: () => void) => void
  appendTo: (el: HTMLElement) => void
  getValidate: () => {
    lot_number: string
    captcha_output: string
    pass_token: string
    gen_time: string
  } | null
  showCaptcha: () => void
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const GEETEST_SCRIPT = 'https://static.geetest.com/v4/gt4.js'

export function Captcha({ config, action, onChange }: Props) {
  const required =
    !!config &&
    config.provider !== 'none' &&
    (config[`on_${action}` as keyof CaptchaConfig] as boolean)

  if (!required || !config) return null

  if (config.provider === 'turnstile') {
    return <TurnstileWidget siteKey={config.site_key} onChange={onChange} />
  }
  if (config.provider === 'geetest') {
    return <GeeTestWidget captchaId={config.geetest_captcha_id ?? ''} onChange={onChange} />
  }
  return <BuiltinWidget onChange={onChange} />
}

/* ---------- Cloudflare Turnstile ---------- */

function TurnstileWidget({
  siteKey,
  onChange,
}: {
  siteKey: string
  onChange: (r: CaptchaResult) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!siteKey) {
      const t = setTimeout(() => setFailed(true), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false

    const render = () => {
      if (cancelled || !holderRef.current || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(holderRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token: string) => onChange({ captcha_token: token }),
        'expired-callback': () => onChange({ captcha_token: '' }),
        'error-callback': () => setFailed(true),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`)
      if (existing) {
        existing.addEventListener('load', render)
      } else {
        const script = document.createElement('script')
        script.src = TURNSTILE_SCRIPT
        script.async = true
        script.defer = true
        script.onload = render
        script.onerror = () => setFailed(true)
        document.head.appendChild(script)
      }
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
        widgetIdRef.current = null
      }
    }
  }, [siteKey, onChange])

  if (failed) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
        人机验证加载失败，请刷新页面重试
      </p>
    )
  }

  return <div ref={holderRef} className="min-h-[65px]" />
}

/* ---------- GeeTest v4（极验 · 弹窗样式） ---------- */

function GeeTestWidget({
  captchaId,
  onChange,
}: {
  captchaId: string
  onChange: (r: CaptchaResult) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<GeeTestInstance | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!captchaId) {
      const t = setTimeout(() => setFailed(true), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false

    // 极验初始化需要访问 gcaptcha4.geetest.com，若网络受限则超时降级
    const timeout = setTimeout(() => {
      if (!cancelled) setFailed(true)
    }, 12000)

    const init = () => {
      clearTimeout(timeout)
      if (cancelled || !holderRef.current || !window.initGeetest4) return
      try {
        window.initGeetest4(
          {
            captchaId,
            // 弹窗样式：隐藏自带的悬浮按钮，由我们自己的按钮触发 showCaptcha()
            product: 'float',
            language: 'zho',
            riskType: 'bind',
          },
          (gt) => {
            if (cancelled) return
            instanceRef.current = gt
            gt.appendTo(holderRef.current as HTMLElement)
            gt.onSuccess(() => {
              const result = gt.getValidate()
              if (result) {
                onChange({ captcha_token: JSON.stringify(result) })
                setVerified(true)
              }
            })
            gt.onError(() => setFailed(true))
            // 用户关闭弹窗且未通过时清空 token，避免提交旧凭证
            gt.onClose?.(() => {
              if (!gt.getValidate()) {
                onChange({ captcha_token: '' })
              }
            })
            setReady(true)
          },
        )
      } catch {
        setFailed(true)
      }
    }

    if (window.initGeetest4) {
      init()
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GEETEST_SCRIPT}"]`)
      if (existing) {
        existing.addEventListener('load', init)
        existing.addEventListener('error', () => setFailed(true))
      } else {
        const script = document.createElement('script')
        script.src = GEETEST_SCRIPT
        script.async = true
        script.onload = init
        script.onerror = () => setFailed(true)
        document.head.appendChild(script)
      }
    }

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [captchaId, onChange])

  const openCaptcha = () => {
    if (!ready) return
    const gt = instanceRef.current
    if (!gt) return
    if (gt.getValidate()) {
      // 已通过，无需重复验证
      setVerified(true)
      return
    }
    try {
      gt.showCaptcha()
    } catch {
      // 某些环境不支持 showCaptcha，回退为点击自带按钮
      holderRef.current?.querySelector('div')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  }

  if (failed) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          {captchaId
            ? '极验加载失败（网络受限或域名未加入极验白名单），已自动切换为算式验证'
            : '极验未配置 Captcha ID，已自动切换为算式验证'}
        </p>
        <BuiltinWidget onChange={onChange} />
      </div>
    )
  }

  return (
    <div>
      {/* 隐藏极验自带的悬浮按钮，仅用其弹窗能力 */}
      <div ref={holderRef} className="hidden" aria-hidden="true" />
      <motion.button
        type="button"
        onClick={openCaptcha}
        disabled={!ready || verified}
        whileHover={verified ? undefined : { scale: 1.02 }}
        whileTap={verified ? undefined : { scale: 0.98 }}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-default ${
          verified
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-accent'
        }`}
      >
        {verified ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            已完成人机验证
          </>
        ) : (
          <>
            <ShieldCheck className={`h-4 w-4 ${ready ? '' : 'animate-pulse'}`} />
            {ready ? '点击进行人机验证' : '验证组件加载中...'}
          </>
        )}
      </motion.button>
    </div>
  )
}

/* ---------- 内置算式验证码（无需第三方服务） ---------- */

function BuiltinWidget({ onChange }: { onChange: (r: CaptchaResult) => void }) {
  const [question, setQuestion] = useState('')
  const [token, setToken] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    setAnswer('')
    fetchCaptchaChallenge()
      .then((res) => {
        setQuestion(res.question ?? '')
        setToken(res.token ?? '')
        onChange({ captcha_token: res.token ?? '', captcha_answer: '' })
      })
      .finally(() => setLoading(false))
  }, [onChange])

  useEffect(() => {
    const t = setTimeout(refresh, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
      <span className="text-sm font-medium tabular-nums">
        {loading ? '加载中...' : question}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={answer}
        onChange={(e) => {
          const v = e.target.value
          setAnswer(v)
          onChange({ captcha_token: token, captcha_answer: v })
        }}
        placeholder="答案"
        className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <button
        type="button"
        onClick={refresh}
        title="换一题"
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-accent"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        换一题
      </button>
    </motion.div>
  )
}
