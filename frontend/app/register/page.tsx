'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { ApiError } from '@/lib/api'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function RegisterPage() {
  const { register } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(email, username, password)
      router.push('/admin')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '注册失败，请稍后重试')
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

  const fields = [
    { id: 'email', label: '邮箱', type: 'email', value: email, set: setEmail, placeholder: 'you@example.com', auto: 'email', min: undefined as number | undefined, max: undefined as number | undefined },
    { id: 'username', label: '用户名', type: 'text', value: username, set: setUsername, placeholder: '2-32 个字符', auto: 'username', min: 2, max: 32 },
    { id: 'password', label: '密码', type: 'password', value: password, set: setPassword, placeholder: '至少 8 个字符', auto: 'new-password', min: 8, max: 72 },
  ]

  return (
    <div className="relative flex min-h-[calc(100vh-4rem-57px)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.06),transparent_65%)]" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="relative w-full max-w-sm"
      >
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: easeOut }}
          >
            <h1 className="text-2xl font-bold tracking-tight">创建账号</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              已有账号？{' '}
              <Link href="/login" className="font-medium text-accent hover:underline underline-offset-4">
                直接登录
              </Link>
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4, ease: easeOut }}
          >
            {fields.map((f, i) => (
              <motion.div
                key={f.id}
                className="space-y-1.5"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.35, ease: easeOut }}
              >
                <label htmlFor={f.id} className="text-sm font-medium">
                  {f.label}
                </label>
                <input
                  id={f.id}
                  type={f.type}
                  required
                  autoComplete={f.auto}
                  minLength={f.min}
                  maxLength={f.max}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className={inputClass}
                />
              </motion.div>
            ))}

            {error && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/25 disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  注册中...
                </span>
              ) : (
                '注册'
              )}
            </motion.button>
          </motion.form>
        </div>
      </motion.div>
    </div>
  )
}
