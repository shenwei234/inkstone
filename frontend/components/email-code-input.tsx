'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { sendEmailCode, ApiError } from '@/lib/api'
import { useNotify } from '@/components/toast'
import { inputClass } from '@/lib/ui'

interface Props {
  email: string
  purpose: 'register' | 'login'
  value: string
  onChange: (code: string) => void
}

/** 邮箱验证码输入 + 发送按钮（60 秒倒计时） */
export function EmailCodeInput({ email, purpose, value, onChange }: Props) {
  const notify = useNotify()
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        return c - 1
      })
    }, 1000)
  }

  const send = async () => {
    if (!email.trim()) {
      notify.error('请先填写邮箱')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      notify.error('邮箱格式不正确')
      return
    }
    setSending(true)
    try {
      const res = await sendEmailCode(email.trim(), purpose)
      notify.success(res.message)
      startCountdown()
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : '发送失败，请检查邮箱配置')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1.5"
    >
      <label className="text-sm font-medium">邮箱验证码</label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位数字验证码"
            inputMode="numeric"
            className={`${inputClass} pl-9 tracking-widest`}
          />
        </div>
        <motion.button
          type="button"
          onClick={send}
          disabled={sending || countdown > 0}
          whileHover={countdown > 0 ? undefined : { scale: 1.02 }}
          whileTap={countdown > 0 ? undefined : { scale: 0.97 }}
          className="shrink-0 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          {sending ? '发送中...' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
        </motion.button>
      </div>
      <p className="text-xs text-muted-foreground">
        验证码将发送到上方邮箱，有效期 10 分钟
      </p>
    </motion.div>
  )
}
