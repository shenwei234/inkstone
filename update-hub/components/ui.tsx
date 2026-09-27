'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export const easeOut = [0.16, 1, 0.3, 1] as const

export const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

export const inputClassCard =
  'w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

export function Card({
  icon,
  title,
  extra,
  children,
  delay = 0,
}: {
  icon?: React.ReactNode
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: easeOut }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md hover:shadow-accent/5"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </motion.section>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 transition-opacity hover:opacity-95 disabled:opacity-50"
    >
      {children}
    </motion.button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        danger
          ? 'text-muted-foreground hover:border-red-500/40 hover:text-red-500'
          : 'text-muted-foreground hover:border-accent/40 hover:text-accent'
      }`}
    >
      {children}
    </button>
  )
}

/** 令牌权限徽章（classic token 显示 scope；fine-grained 显示 FP） */
export function ScopeBadge({ scopes }: { scopes: string[] }) {
  const hasRepo = scopes.includes('repo') || scopes.length === 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        hasRepo
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}
      title={
        hasRepo
          ? '令牌具备仓库读写权限'
          : `令牌权限：${scopes.join(', ') || '未知'}，发布需要 repo`
      }
    >
      {hasRepo ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {scopes.length === 0 ? 'fine-grained 令牌' : scopes.includes('repo') ? 'repo 权限就绪' : '权限不足'}
    </span>
  )
}

export function StepItem({
  index,
  label,
  status,
  message,
}: {
  index: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          status === 'done'
            ? 'bg-emerald-500 text-white'
            : status === 'running'
              ? 'bg-accent text-white'
              : status === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-muted text-muted-foreground'
        }`}
      >
        {status === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          index + 1
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {message && (
          <p
            className={`mt-0.5 text-xs ${
              status === 'error' ? 'text-red-500' : 'text-muted-foreground'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </li>
  )
}

/** 复制到剪贴板（带 1.5s 反馈） */
export function CopyButton({
  text,
  label = '复制',
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => undefined
        )
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-accent ${className}`}
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <CopyIcon />}
      {copied ? '已复制' : label}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}
