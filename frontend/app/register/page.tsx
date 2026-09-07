'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ApiError } from '@/lib/api'

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
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '注册失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-20">
      <h1 className="text-2xl font-bold tracking-tight">注册</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        已有账号？{' '}
        <Link href="/login" className="underline underline-offset-4">
          登录
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            用户名
          </label>
          <input
            id="username"
            type="text"
            required
            minLength={2}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="2-32 个字符"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 个字符"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/50"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? '注册中...' : '注册'}
        </button>
      </form>
    </div>
  )
}
