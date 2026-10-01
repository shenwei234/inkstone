'use client'

import type { ReactNode } from 'react'
import type { CaptchaCredential } from '@/lib/api'
import { useSiteConfig } from './site-config-context'
import { useGeetestCaptcha } from './geetest-captcha'
import { useLapCaptcha } from './lap-captcha'

export type CaptchaScene = 'login' | 'register' | 'comment'

export interface CaptchaHandle {
  /** 当前场景是否开启了人机验证（决定提交前是否弹窗） */
  enabled: boolean
  /** 弹出验证并拿回凭证（provider 不同，凭证字段不同） */
  run: () => Promise<CaptchaCredential>
  /** 验证弹窗（portal 到 body），由调用方渲染在页面根部 */
  dialog: ReactNode
  /** Lap 预热容器（屏幕外，仅 lap provider 返回；调用方原样渲染即可） */
  prewarmNode?: ReactNode
}

/**
 * 人机验证门面：按后台 captcha_provider 设置选用极验或 Lap。
 *
 * 两个 hook 都会调用（React 规则要求），未选中的 provider 内部 enabled=false，
 * 不加载任何外部脚本（gt4.js / widget.js），也不会渲染弹窗。
 *
 * Lap 的 PoW 预热只对登录/注册开启（访客有明确验证意图，用读表单时间换
 * 弹窗零等待）；评论场景不开——文章页访客量大，不应让每个访客都消耗 PoW。
 */
export function useCaptcha(scene: CaptchaScene): CaptchaHandle {
  const provider = useSiteConfig().captchaProvider
  const geetest = useGeetestCaptcha(scene)
  const lap = useLapCaptcha(scene, { prewarm: scene !== 'comment' })
  if (provider === 'lap') {
    return { enabled: lap.enabled, run: lap.run, dialog: lap.dialog, prewarmNode: lap.prewarmNode }
  }
  return geetest
}
