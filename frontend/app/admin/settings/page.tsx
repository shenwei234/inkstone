'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Mail, Send, ShieldCheck } from 'lucide-react'
import {
  fetchAdminSettings,
  sendTestMail,
  updateAdminSettings,
  ApiError,
} from '@/lib/api'
import { useNotify } from '@/components/toast'
import type { SiteSettings } from '@/lib/types'

const easeOut = [0.16, 1, 0.3, 1] as const

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-border'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
        />
      </button>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </motion.section>
  )
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

export default function AdminSettingsPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [smtpPass, setSmtpPass] = useState('')
  const [testTo, setTestTo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
  })

  useEffect(() => {
    if (data?.settings) {
      setForm({ ...data.settings })
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        allow_registration: form!.allow_registration,
        site_name: form!.site_name,
        site_description: form!.site_description,
        site_icp: form!.site_icp,
        smtp_host: form!.smtp_host,
        smtp_port: form!.smtp_port,
        smtp_user: form!.smtp_user,
        smtp_from: form!.smtp_from,
      }
      if (smtpPass) payload.smtp_pass = smtpPass
      return updateAdminSettings(payload)
    },
    onSuccess: (res) => {
      setForm(res.settings)
      setSmtpPass('')
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      notify.success('设置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const test = useMutation({
    mutationFn: () => sendTestMail(testTo),
    onSuccess: (res) => notify.success(res.message),
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '发送失败'),
  })

  if (isLoading || !form) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">网站管理</h1>
        <div className="mt-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">网站管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">站点信息、注册开关与邮件服务配置</p>
        </div>
        <motion.button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
        >
          {save.isPending ? '保存中...' : '保存设置'}
        </motion.button>
      </div>

      <div className="mt-6 grid gap-4">
        <Section icon={<Globe className="h-4 w-4 text-accent" />} title="站点信息">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">站点名称</label>
              <input
                value={form.site_name}
                onChange={(e) => update('site_name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ICP 备案号（页脚显示）</label>
              <input
                value={form.site_icp}
                onChange={(e) => update('site_icp', e.target.value)}
                placeholder="如：京ICP备xxxxxxxx号"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">站点描述</label>
              <input
                value={form.site_description}
                onChange={(e) => update('site_description', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </Section>

        <Section
          icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />}
          title="注册与安全"
        >
          <div className="divide-y divide-border">
            <Toggle
              checked={form.allow_registration}
              onChange={(v) => update('allow_registration', v)}
              label="开放用户注册"
              desc="关闭后新用户将无法注册，已有用户不受影响"
            />
          </div>
        </Section>

        <Section icon={<Mail className="h-4 w-4 text-purple-500" />} title="邮件服务（SMTP）">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">SMTP 服务器</label>
              <input
                value={form.smtp_host}
                onChange={(e) => update('smtp_host', e.target.value)}
                placeholder="smtp.example.com"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">端口</label>
              <input
                value={form.smtp_port}
                onChange={(e) => update('smtp_port', e.target.value)}
                placeholder="465"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">账号</label>
              <input
                value={form.smtp_user}
                onChange={(e) => update('smtp_user', e.target.value)}
                placeholder="no-reply@example.com"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                密码/授权码
                {form.smtp_pass_set && (
                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                    已配置（留空保持不变）
                  </span>
                )}
              </label>
              <input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={form.smtp_pass_set ? '••••••••' : '未设置'}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">发件人显示（可选）</label>
              <input
                value={form.smtp_from}
                onChange={(e) => update('smtp_from', e.target.value)}
                placeholder="Blog 平台 &lt;no-reply@example.com&gt;"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="收件邮箱，用于发送测试邮件"
              className="w-64 rounded-lg border border-border bg-background px-3.5 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <motion.button
              type="button"
              onClick={() => {
                if (!testTo.trim()) {
                  notify.error('请填写收件邮箱')
                  return
                }
                test.mutate()
              }}
              disabled={test.isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {test.isPending ? '发送中...' : '发送测试邮件'}
            </motion.button>
            <span className="text-xs text-muted-foreground">保存设置后再测试</span>
          </div>
        </Section>
      </div>
    </div>
  )
}
