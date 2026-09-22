'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { gsap } from 'gsap'
import { ArrowRight, Check, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchCaptchaChallenge } from '@/lib/api'
import type { CaptchaConfig } from '@/lib/api'
import { Modal } from '@/components/modal'

export interface CaptchaResult {
  captcha_token?: string
  captcha_answer?: string
}

interface Props {
  config: CaptchaConfig | undefined
  action: 'register' | 'login' | 'comment' | 'article'
  onChange: (result: CaptchaResult) => void
  /** 挂载后立即弹出验证窗（用于发布/更新等流程） */
  autoOpen?: boolean
  /** 验证通过后的回调（autoOpen 场景用于继续提交流程） */
  onVerified?: () => void
  /** 用户关闭验证窗的回调 */
  onCancel?: () => void
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

export function Captcha({ config, action, onChange, autoOpen, onVerified, onCancel }: Props) {
  const required =
    !!config &&
    config.provider !== 'none' &&
    (config[`on_${action}` as keyof CaptchaConfig] as boolean)

  if (!required || !config) return null

  if (config.provider === 'turnstile') {
    return (
      <TurnstileWidget siteKey={config.site_key} onChange={onChange} onVerified={onVerified} />
    )
  }
  if (config.provider === 'geetest') {
    return (
      <GeeTestWidget
        captchaId={config.geetest_captcha_id ?? ''}
        onChange={onChange}
        onVerified={onVerified}
      />
    )
  }
  return (
    <SliderCaptcha
      onChange={onChange}
      autoOpen={autoOpen}
      onVerified={onVerified}
      onCancel={onCancel}
    />
  )
}

/* ---------- Turnstile ---------- */

/** 用 ref 持有回调，避免回调变化触发重渲染/依赖告警 */
function useLatest<T extends (...args: never[]) => unknown>(fn?: T) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  }, [fn])
  return ref
}

function TurnstileWidget({
  siteKey,
  onChange,
  onVerified,
}: {
  siteKey: string
  onChange: (r: CaptchaResult) => void
  onVerified?: () => void
}) {
  const verifiedCb = useLatest(onVerified)
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
        callback: (token: string) => {
          onChange({ captcha_token: token })
          verifiedCb.current?.()
        },
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
        } catch {}
        widgetIdRef.current = null
      }
    }
  }, [siteKey, onChange, verifiedCb])

  if (failed) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          {siteKey ? 'Turnstile 加载失败（国内网络通常无法访问），已自动切换为算式验证' : 'Turnstile 未配置 Site Key，已自动切换为算式验证'}
        </p>
        <SliderCaptcha onChange={onChange} />
      </div>
    )
  }
  return <div ref={holderRef} className="min-h-[65px]" />
}

/* ---------- GeeTest v4 ---------- */

function GeeTestWidget({
  captchaId,
  onChange,
  onVerified,
}: {
  captchaId: string
  onChange: (r: CaptchaResult) => void
  onVerified?: () => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<GeeTestInstance | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [verified, setVerified] = useState(false)
  const verifiedCb = useLatest(onVerified)

  useEffect(() => {
    if (!captchaId) {
      const t = setTimeout(() => setFailed(true), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) setFailed(true)
    }, 12000)

    const init = () => {
      clearTimeout(timeout)
      if (cancelled || !holderRef.current || !window.initGeetest4) return
      try {
        window.initGeetest4(
          { captchaId, product: 'float', language: 'zho', riskType: 'bind' },
          (gt) => {
            if (cancelled) return
            instanceRef.current = gt
            gt.appendTo(holderRef.current as HTMLElement)
            gt.onSuccess(() => {
              const result = gt.getValidate()
              if (result) {
                onChange({ captcha_token: JSON.stringify(result) })
                setVerified(true)
                verifiedCb.current?.()
              }
            })
            gt.onError(() => setFailed(true))
            gt.onClose?.(() => {
              if (!gt.getValidate()) onChange({ captcha_token: '' })
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
  }, [captchaId, onChange, verifiedCb])

  const openCaptcha = () => {
    if (!ready) return
    const gt = instanceRef.current
    if (!gt) return
    if (gt.getValidate()) {
      setVerified(true)
      return
    }
    try {
      gt.showCaptcha()
    } catch {
      holderRef.current?.querySelector('div')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
  }

  if (failed) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          {captchaId ? '极验加载失败（网络受限或域名未加入极验白名单），已自动切换为算式验证' : '极验未配置 Captcha ID，已自动切换为算式验证'}
        </p>
        <SliderCaptcha onChange={onChange} />
      </div>
    )
  }

  return (
    <div>
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

/* ---------- 内置弹窗滑块验证码（gsap 动画） ---------- */

/** 解析形如 "7 + 5 = ?" 的算式并返回结果；无法解析返回 null。 */
function solveArithmetic(q: string): number | null {
  const m = q.replace(/\s/g, '').match(/^(\d+)\+(\d+)=/)
  if (!m) return null
  return Number(m[1]) + Number(m[2])
}

/**
 * 动画弹出式人机验证（gsap）：
 *  - 点击触发或 autoOpen → gsap 弹性弹出遮罩 + 卡片；算式随 gsap 入场
 *  - 以「拖动滑块到最右端」完成验证（真实算式 token 跟随，无需额外点击）
 *  - 成功时 gsap 打勾 + 卡片关闭，触发按钮变为「已验证」
 * autoOpen 场景（发布/更新）：验证通过后回调 onVerified 继续提交流程。
 */
function SliderCaptcha({
  onChange,
  autoOpen,
  onVerified,
  onCancel,
}: {
  onChange: (r: CaptchaResult) => void
  autoOpen?: boolean
  onVerified?: () => void
  onCancel?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [token, setToken] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)

  const questionRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  const checkRef = useRef<HTMLDivElement>(null)

  const aliveRef = useRef(true)
  const verifiedCb = useLatest(onVerified)
  const cancelCb = useLatest(onCancel)

  const loadChallenge = useCallback(() => {
    setLoading(true)
    setToken('')
    fetchCaptchaChallenge()
      .then((res) => {
        if (!aliveRef.current) return
        setQuestion(res.question ?? '')
        setToken(res.token ?? '')
        // 算式刷新时用 gsap 快速翻转
        if (questionRef.current) {
          gsap.fromTo(
            questionRef.current,
            { opacity: 0, y: -8, rotateX: 40 },
            { opacity: 1, y: 0, rotateX: 0, duration: 0.4, ease: 'back.out(1.6)' },
          )
        }
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    aliveRef.current = true
    const t = setTimeout(loadChallenge, 0)
    return () => {
      aliveRef.current = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // autoOpen：挂载后立即弹出（发布/更新流程）
  useEffect(() => {
    if (!autoOpen) return
    const t = setTimeout(() => {
      setVerified(false)
      setOpen(true)
      loadChallenge()
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])

  // 打开弹窗（Modal 负责 gsap 入场动画）
  const openModal = () => {
    setVerified(false)
    setOpen(true)
    loadChallenge()
    requestAnimationFrame(() => {
      if (dragRef.current) gsap.set(dragRef.current, { x: 0 })
      if (progressRef.current) gsap.set(progressRef.current, { width: 0 })
    })
  }

  const closeModal = () => {
    setOpen(false)
    cancelCb.current?.()
  }

  // 拖动滑块：到达最右端完成验证
  const handleDrag = (ev: React.PointerEvent) => {
    ev.preventDefault()
    const track = trackRef.current
    const knob = dragRef.current
    const fill = progressRef.current
    if (!track || !knob || !token) return
    knob.setPointerCapture(ev.pointerId)
    const maxTravel = track.clientWidth - knob.offsetWidth
    const startX = ev.clientX

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX
      const x = Math.max(0, Math.min(maxTravel, dx))
      const pct = maxTravel > 0 ? x / maxTravel : 1
      gsap.set(knob, { x })
      if (fill) gsap.set(fill, { width: pct * 100 + '%' })
      if (pct >= 0.98) finish()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    const finish = () => {
      onUp()
      completeVerify()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const completeVerify = () => {
    // 已生成 token（对应当前算式），标记验证完成
    if (!token) return
    // 由算式自动求解答案并随 token 提交——拖动滑块到最右端即完成，无需再输入数字
    const answer = solveArithmetic(question)
    setVerified(true)
    onChange({ captcha_token: token, captcha_answer: answer !== null ? String(answer) : '' })
    // gsap 成功动画：打勾弹入
    if (checkRef.current) {
      gsap.fromTo(
        checkRef.current,
        { scale: 0, rotate: -30, opacity: 0 },
        { scale: 1, rotate: 0, opacity: 1, duration: 0.45, ease: 'elastic.out(1, 0.5)' },
      )
    }
    // 短暂停顿后关闭弹窗；autoOpen 场景继续提交流程
    setTimeout(() => {
      closeModal()
      verifiedCb.current?.()
    }, 600)
  }

  return (
    <div>
      {/* 触发按钮 */}
      <motion.button
        type="button"
        onClick={openModal}
        disabled={verified}
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
            <ShieldCheck className="h-4 w-4 text-accent" />
            人机验证
          </>
        )}
      </motion.button>

      {/* 弹窗（Portal 渲染，避免被带 transform 的父容器困住） */}
      <Modal
        open={open}
        onClose={closeModal}
        title="安全验证"
        description="拖动滑块到最右端完成验证"
        width={380}
      >
        <div className="relative">
          {/* 算式 */}
          <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5">
            <span ref={questionRef} className="text-lg font-bold tabular-nums tracking-wide">
              {loading ? '加载中...' : question}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-center">
            <button
              type="button"
              onClick={loadChallenge}
              title="换一题"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-accent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              换一题
            </button>
          </div>

          {/* 滑块 */}
          <div
            ref={trackRef}
            className="relative mt-4 h-11 w-full overflow-hidden rounded-full border border-border bg-muted/60"
          >
            <div
              ref={progressRef}
              className="absolute left-0 top-0 h-full rounded-full bg-accent/20"
              style={{ width: 0 }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/80">
              向右拖动到最右端
            </span>
            <div
              ref={dragRef}
              onPointerDown={handleDrag}
              className="absolute left-0 top-0 flex h-11 w-12 cursor-grab select-none touch-none items-center justify-center rounded-full bg-accent text-white shadow-md active:cursor-grabbing"
            >
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>

          {/* 成功打勾示意 */}
          <div
            ref={checkRef}
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-xl"
            style={{ opacity: 0 }}
          >
            <Check className="h-10 w-10" strokeWidth={3} />
          </div>
        </div>
      </Modal>
    </div>
  )
}