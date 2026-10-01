'use client'

import gsap from 'gsap'
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

/** 鍏ㄧ珯缁熶竴缂撳姩锛堣繎浼煎師 easeOutExpo [0.16,1,0.3,1] 鐨勫熬娈电紦鍑猴級 */
export const easeOut = 'expo.out'

/** 灏婇噸绯荤粺銆屽噺灏戝姩鏁堛€嶅亸濂斤細鍛戒腑鏃舵墍鏈?GSAP 鍔ㄧ敾鑷姩璺宠繃鎴栫灛鏃跺畬鎴?*/
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 鍏ュ満鍔ㄧ敾鍏滃簳锛氬姩鐢荤敱 rAF 閫愬抚鎺ㄨ繘锛岃嫢琚妭娴?涓柇浼氬仠鍦ㄩ€忔槑鎬佸鑷村唴瀹逛笉鍙
 * 锛堟浘澶嶇幇锛歰pacity 鍗″湪 0 涓嶅姩锛岃〃鐜颁负"鍐呭琚櫧鑹查伄鎸?锛夈€傝秴鏃跺悗寮哄埗娓呴櫎鍐呰仈鏍峰紡鎭㈠鍙銆? * 姝ｅ父鍔ㄧ敾鏃╁凡鎾斁瀹屾瘯锛屾澶勫彧鏄繚闄╋紝涓嶅奖鍝嶈鎰熴€? */
function revealFallback(el: HTMLElement, duration: number, delay: number) {
  const timer = setTimeout(
    () => {
      const cs = window.getComputedStyle(el)
      if (Number(cs.opacity) < 0.99 || (cs.transform !== 'none' && cs.transform !== '')) {
        gsap.set(el, { clearProps: 'opacity,transform' })
      }
    },
    Math.max(1200, (duration + delay) * 1000 + 1200),
  )
  return () => clearTimeout(timer)
}

let gsapPatched = false

/**
 * 寰幆鍔ㄧ敾缁熶竴绠＄悊锛氭棤闄愬惊鐜姩鐢伙紙repeat: -1锛夊湪椤甸潰涓嶅彲瑙佹椂鑷姩鏆傚仠銆? * 杩滅▼妗岄潰/鏃?GPU 鐜閲?transform 鍔ㄧ敾璧?CPU 鍚堟垚锛屽惊鐜姩鐢诲父椹绘槸涓昏鍗￠】婧愶紱
 * 鏍囩椤甸殣钘忥紙鍒囨崲/鏈€灏忓寲锛夋椂鏆傚仠锛屾仮澶嶆椂缁х画锛屼笉褰卞搷瑙傛劅銆? */
const loopingAnimations = new Set<gsap.core.Tween | gsap.core.Timeline>()

/** 鍒涘缓寰幆鍔ㄧ敾骞剁撼鍏ュ叏灞€绠＄悊 */
export function createLoop<T extends gsap.core.Tween | gsap.core.Timeline>(create: () => T): T {
  const anim = create()
  loopingAnimations.add(anim)
  return anim
}

/** 瑙ｉ櫎寰幆鍔ㄧ敾鐧昏锛堢粍浠跺嵏杞?cleanup 閲岃皟鐢級 */
export function releaseLoop(anim: gsap.core.Tween | gsap.core.Timeline | null | undefined) {
  if (anim) loopingAnimations.delete(anim)
}

let visibilityBound = false
function bindLoopVisibility() {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    for (const anim of loopingAnimations) {
      if (document.hidden) anim.pause()
      else anim.resume()
    }
  })
}

bindLoopVisibility()

/**
 * 鍏ㄥ眬鍏滃簳琛ヤ竵锛氭帴绠″叏绔欐墍鏈?gsap.from / gsap.fromTo 鍏ュ満鍔ㄧ敾锛堝惈鍚勯〉闈㈣嚜缁樿皟鐢級銆? * 杩滅▼妗岄潰 / 娴忚鍣ㄧ獥鍙ｈ閬尅鏃?Chrome 浼氳妭娴?rAF锛宖ramer-motion 璧?WAAPI 涓嶅彈褰卞搷锛? * 鑰?GSAP 鏄?JS tween 閫愬抚鎺ㄨ繘鈥斺€斿叆鍦哄姩鐢讳細姘镐箙鍋滃湪閫忔槑鎬併€傝ˉ涓佷负姣忎釜浠庨€忔槑鎬? * 璧锋鐨?tween 娉ㄥ唽瓒呮椂鐪嬮棬鐙楋紝瓒呮椂鏈畬鎴愬嵆寮哄埗鎭㈠鍙銆? */
function patchEntranceAnimations() {
  if (gsapPatched || typeof gsap.from !== 'function') return
  gsapPatched = true
  const rawFrom = gsap.from.bind(gsap)
  const rawFromTo = gsap.fromTo.bind(gsap)
  const guard = (target: unknown, vars: gsap.TweenVars) => {
    const list = Array.isArray(target) ? target : [target]
    const el = list[0] as HTMLElement | string | undefined
    const node =
      typeof el === 'string' ? document.querySelector<HTMLElement>(el) : el instanceof Element ? el : null
    if (!node || !vars) return undefined
    const startsHidden =
      typeof vars.opacity === 'number' && vars.opacity < 0.99
        ? true
        : 'y' in vars || 'x' in vars || 'scale' in vars || 'scaleX' in vars
    if (startsHidden) {
      return revealFallback(node, (vars.duration as number) ?? 0.35, (vars.delay as number) ?? 0)
    }
    return undefined
  }
  // 鍔ㄧ敾姝ｅ父缁撴潫鏃跺嵆鍙栨秷鐪嬮棬鐙楋紝閬垮厤瀹氭椂鍣ㄥ父椹诲埌瓒呮椂
  const withCancel = (tween: gsap.core.Tween, cancel?: () => void) => {
    if (!cancel) return tween
    const prev = tween.eventCallback('onComplete')
    tween.eventCallback('onComplete', function (this: gsap.core.Tween) {
      cancel()
      if (typeof prev === 'function') prev.call(this)
    })
    return tween
  }
  gsap.from = ((target: gsap.TweenTarget, vars: gsap.TweenVars) => {
    const cancel = guard(target, vars)
    return withCancel(rawFrom(target, vars), cancel)
  }) as typeof gsap.from
  gsap.fromTo = ((
    target: gsap.TweenTarget,
    from: gsap.TweenVars,
    to: gsap.TweenVars,
  ) => {
    const cancel = guard(target, from)
    return withCancel(rawFromTo(target, from, to), cancel)
  }) as unknown as typeof gsap.fromTo
}

patchEntranceAnimations()

/**
 * 璇箟鏍囩鐨勫叆鍦哄姩鏁?hook锛氱粰宸叉湁鏍囩锛坔eader/aside/article/button 绛夛級鎸?ref 鍗冲彲銆? * 鐢ㄦ硶锛歝onst ref = useRef<HTMLElement>(null); useReveal(ref, { y: 16 })
 */
export function useReveal<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  opts: {
    y?: number
    x?: number
    scale?: number
    scaleX?: number
    opacity?: number
    duration?: number
    delay?: number
  } = {},
) {
  const { y = 16, x, scale, scaleX, opacity = 0, duration = 0.35, delay = 0 } = opts
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const from: gsap.TweenVars = { opacity, clearProps: 'opacity,transform' }
    if (y !== 0) from.y = y
    if (x !== undefined) from.x = x
    if (scale !== undefined) from.scale = scale
    if (scaleX !== undefined) from.scaleX = scaleX
    gsap.from(el, { ...from, duration, delay, ease: easeOut })
  }, [ref, y, x, scale, scaleX, opacity, duration, delay])
}

/**
 * 椤甸潰杩囨浮锛氭寕杞芥椂娣″叆銆? */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    gsap.from(el, { opacity: 0, duration: 0.25, ease: easeOut, clearProps: 'opacity,transform' })
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/**
 * 閫氱敤鍏ュ満鍔ㄦ晥锛歰pacity 0鈫? + 鍙€変綅绉?缂╂斁銆? * 鏇夸唬 motion.div 鐨?initial/animate/transition銆? */
export function Reveal({
  children,
  className,
  style,
  y = 16,
  x,
  scale,
  delay = 0,
  duration = 0.35,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  y?: number
  x?: number
  scale?: number
  delay?: number
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const from: gsap.TweenVars = { opacity: 0, clearProps: 'opacity,transform' }
    if (y !== 0) from.y = y
    if (x !== undefined) from.x = x
    if (scale !== undefined) from.scale = scale
    gsap.from(el, { ...from, duration, delay, ease: easeOut })
  }, [y, x, scale, delay, duration])
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

/**
 * 鍒楄〃 stagger锛氭寕杞芥椂瀛愬厓绱犱緷娆℃贰鍏ヤ笂绉汇€? * 涓?framer 鐨?StaggerList/StaggerItem variants 鐢ㄦ硶涓€鑷达紝StaggerItem 鐜颁负绾€忎紶 div銆? */
export function StaggerList({
  children,
  className,
  y = 18,
  stagger = 0.06,
  duration = 0.35,
}: {
  children: ReactNode
  className?: string
  y?: number
  stagger?: number
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const items = gsap.utils.toArray<HTMLElement>(el.children)
    if (items.length === 0) return
    // 长列表 cap 总时长：20+ 项时逐项 0.06 会拖到 1.2s+，体感像卡住；封顶 0.5s 内全部入场
    const effStagger = Math.min(stagger, 0.5 / items.length)
    gsap.from(items, {
      opacity: 0,
      y,
      duration,
      ease: easeOut,
      stagger: effStagger,
      clearProps: 'opacity,transform',
    })
    // stagger 的每个子元素都可能各自停在透明态，逐个子元素注册看门狗
    const total = duration + effStagger * items.length
    const cancels = items.map((item) => revealFallback(item, total, 0))
    return () => cancels.forEach((c) => c())
  }, [y, stagger, duration])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

/** 鎮仠杞诲井涓婃诞锛堟浛浠?HoverLift / whileHover={{ y: -4 }}锛?*/
export function HoverLift({
  children,
  className,
  y = -4,
  duration = 0.3,
}: {
  children: ReactNode
  className?: string
  y?: number
  duration?: number
}) {
  return (
    <div
      className={className}
      onPointerEnter={(e) => {
        if (prefersReducedMotion()) return
        gsap.to(e.currentTarget, { y, duration, ease: 'power2.out', overwrite: 'auto' })
      }}
      onPointerLeave={(e) => {
        if (prefersReducedMotion()) return
        gsap.to(e.currentTarget, { y: 0, duration, ease: 'power2.out', overwrite: 'auto' })
      }}
    >
      {children}
    </div>
  )
}

/** 鍙洿鎺?spread 鍒?button/link 涓婄殑鎮仠鏀惧ぇ + 鎸夊帇缂╂斁锛堟浛浠?whileHover/whileTap锛?*/
export const hoverTapScale = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { scale: 1.03, duration: 0.2, ease: 'power2.out', overwrite: 'auto' })
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { scale: 1, duration: 0.2, ease: 'power2.out', overwrite: 'auto' })
  },
  onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { scale: 0.97, duration: 0.1, overwrite: 'auto' })
  },
  onMouseUp: (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { scale: 1.03, duration: 0.1, overwrite: 'auto' })
  },
} satisfies HTMLAttributes<HTMLElement>

/** 鍙洿鎺?spread 鍒颁换鎰忓厓绱犱笂鐨勬偓鍋滀笂娴紙鏇夸唬 whileHover={{ y: -4 }}锛?*/
export const hoverLift = {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { y: -4, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
  },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    gsap.to(e.currentTarget, { y: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
  },
} satisfies HTMLAttributes<HTMLElement>

/** 杩涘叆瑙嗗彛鏃舵贰鍏ヤ竴娆★紙鏇夸唬 whileInView + viewport={{ once: true }}锛?*/
export function InView({
  children,
  className,
  y = 16,
  duration = 0.5,
}: {
  children: ReactNode
  className?: string
  y?: number
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          gsap.from(el, {
            opacity: 0,
            y,
            duration,
            ease: easeOut,
            clearProps: 'opacity,transform',
          })
          io.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [y, duration])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/**
 * 鏉′欢娓叉煋 + GSAP 杩涘嚭鍦哄姩鐢伙紙鏇夸唬 AnimatePresence + motion.div锛夈€? * - show 鐢?false鈫抰rue锛氱珛鍗虫寕杞藉苟鎾斁鍏ュ満
 * - show 鐢?true鈫抐alse锛氭挱鏀鹃€€鍦猴紝鍔ㄧ敾缁撴潫鍚庤嚜鍔ㄥ嵏杞? */
export function Presence({
  show,
  children,
  className,
  style,
  y,
  x,
  scale,
  duration = 0.24,
  exitDuration,
  delay = 0,
  ...rest
}: {
  show: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
  y?: number
  x?: number | string
  scale?: number
  duration?: number
  exitDuration?: number
  delay?: number
} & HTMLAttributes<HTMLDivElement>) {
  const [mounted, setMounted] = useState(show)
  const elRef = useRef<HTMLDivElement>(null)
  // 退场兜底定时器引用：重新打开时必须取消，否则「移出再快速移入」时
  // 上一次退场注册的延迟卸载会把新打开的面板误杀（hover 菜单打不开的关键 bug）
  const exitTimerRef = useRef<gsap.core.Tween | null>(null)

  // 挂载：不用渲染期 setState（React 19 在事件触发的父渲染路径下可能不同步重渲子组件，
  // 导致面板永远不显示）。用异步 effect 挂载，同时避开 effect 内同步 setState 规则。
  useEffect(() => {
    if (!show || mounted) return
    const t = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(t)
  }, [show, mounted])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (show) {
      // 取消上一次退场的兜底卸载定时器，避免误杀本次新打开的面板
      exitTimerRef.current?.kill()
      exitTimerRef.current = null
      if (prefersReducedMotion()) return
      gsap.killTweensOf(el)
      const from: gsap.TweenVars = { opacity: 0 }
      if (y !== undefined) from.y = y
      if (x !== undefined) from.x = x
      if (scale !== undefined) from.scale = scale
      gsap.fromTo(el, from, {
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
        duration,
        delay,
        ease: easeOut,
        overwrite: 'auto',
        clearProps: 'opacity,y,x,scale',
      })
      // 入场看门狗由全局 patch（gsap.fromTo）统一注册，动画完成即取消
    } else {
      if (prefersReducedMotion()) {
        // 寤惰繜涓€甯у嵏杞斤細寮傛鍥炶皟閲?setState锛岄伩寮€ effect 鍐呭悓姝?setState
        gsap.delayedCall(0, () => setMounted(false))
        return
      }
      const to: gsap.TweenVars = { opacity: 0 }
      if (y !== undefined) to.y = y
      if (x !== undefined) to.x = x
      if (scale !== undefined) to.scale = scale
      const exitDur = exitDuration ?? Math.max(0.12, duration * 0.8)
      gsap.to(el, {
        ...to,
        duration: exitDur,
        ease: 'power2.in',
        overwrite: 'auto',
        onComplete: () => {
          setMounted(false)
          exitTimerRef.current = null
        },
      })
      // 兜底：tween 被中断时（rAF 不推进）超时也卸载，避免弹层卡死
      exitTimerRef.current?.kill()
      exitTimerRef.current = gsap.delayedCall(exitDur + 0.8, () => {
        setMounted(false)
        exitTimerRef.current = null
      })
    }
    return () => {
      exitTimerRef.current?.kill()
      exitTimerRef.current = null
    }
  }, [show, duration, exitDuration, delay, y, x, scale])

  if (!mounted) return null

  return (
    <div ref={elRef} className={className} style={style} {...rest}>
      {children}
    </div>
  )
}

/** 鏁板瓧婊氬姩鍔ㄧ敾锛堟浛浠?framer-motion 鐨?animate() 璁℃暟锛?*/
export function CountUp({ value, duration = 0.9 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.textContent = String(value)
      return
    }
    const obj = { v: 0 }
    const tween = gsap.to(obj, {
      v: value,
      duration,
      ease: easeOut,
      onUpdate: () => {
        el.textContent = String(Math.round(obj.v))
      },
      onComplete: () => {
        el.textContent = String(value)
      },
    })
    // 鍏滃簳锛歵ween 琚腑鏂椂锛坮AF 涓嶆帹杩涳級瓒呮椂鐩存帴钀芥渶缁堝€硷紝閬垮厤鏁板瓧鍋滃湪 0
    const timer = setTimeout(() => {
      el.textContent = String(value)
    }, (duration + 1) * 1000)
    return () => {
      tween.kill()
      clearTimeout(timer)
    }
  }, [value, duration])
  return <span ref={ref}>{value}</span>
}

