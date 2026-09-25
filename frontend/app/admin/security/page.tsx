'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, Gauge, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { fetchAdminSettings, updateAdminSettings, ApiError } from '@/lib/api'
import { useNotify } from '@/components/toast'
import { SecretInput } from '@/components/secret-input'
import { PageTransition } from '@/components/motion'

const easeOut = [0.16, 1, 0.3, 1] as const

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

interface SecurityForm {
  security_enabled: boolean
  security_api_max: number
  security_login_max: number
  security_register_max: number
  security_comment_max: number
  security_block_minutes: number
  email_code_on_register: boolean
  email_code_on_login: boolean
  geetest_enabled: boolean
  geetest_captcha_id: string
  geetest_captcha_key: string
  geetest_captcha_key_set: boolean
  geetest_on_login: boolean
  geetest_on_register: boolean
  geetest_on_comment: boolean
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
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

export default function AdminSecurityPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SecurityForm | null>(null)

  const settingsQuery = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchAdminSettings })

  useEffect(() => {
    const s = settingsQuery.data?.settings as unknown as Record<string, unknown> | undefined
    if (!s) return
    const toBool = (v: unknown, d: boolean) => (v === undefined ? d : v === true || v === 'true')
    const toNum = (v: unknown, d: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : d
    }
    const t = setTimeout(() => {
      setForm({
        security_enabled: toBool(s.security_enabled, true),
        security_api_max: toNum(s.security_api_max, 300),
        security_login_max: toNum(s.security_login_max, 10),
        security_register_max: toNum(s.security_register_max, 5),
        security_comment_max: toNum(s.security_comment_max, 10),
        security_block_minutes: toNum(s.security_block_minutes, 15),
        email_code_on_register: toBool(s.email_code_on_register, false),
        email_code_on_login: toBool(s.email_code_on_login, false),
        geetest_enabled: toBool(s.geetest_enabled, false),
        geetest_captcha_id: typeof s.geetest_captcha_id === 'string' ? s.geetest_captcha_id : '',
        geetest_captcha_key: '',
        geetest_captcha_key_set: toBool(s.geetest_captcha_key_set, false),
        geetest_on_login: toBool(s.geetest_on_login, false),
        geetest_on_register: toBool(s.geetest_on_register, false),
        geetest_on_comment: toBool(s.geetest_on_comment, false),
      })
    }, 0)
    return () => clearTimeout(t)
  }, [settingsQuery.data])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ...form }
      // 密钥留空 = 保持原值（后端对敏感字段做空值保护，这里不透传只读标记）
      delete payload.geetest_captcha_key_set
      if (!form!.geetest_captcha_key) delete payload.geetest_captcha_key
      return updateAdminSettings(payload as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      notify.success('安全设置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  if (settingsQuery.isLoading || !form) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">安全防护</h1>
        <div className="mt-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const update = <K extends keyof SecurityForm>(key: K, value: SecurityForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <PageTransition>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">安全防护</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            访问限流与邮箱验证码，抵御垃圾注册、暴力破解与刷接口
          </p>
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
        <Section icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />} title="安全防护总开关">
          <div className="divide-y divide-border">
            <Toggle
              checked={form.security_enabled}
              onChange={(v) => update('security_enabled', v)}
              label="启用访问限流"
              desc="按 IP 限制接口请求频率、注册与登录尝试，超限自动拒绝"
            />
          </div>
        </Section>

        <Section icon={<Gauge className="h-4 w-4 text-accent" />} title="限流阈值">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">API 请求上限（次/分钟/IP）</label>
              <input
                type="number"
                min={0}
                value={form.security_api_max}
                onChange={(e) => update('security_api_max', Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">登录失败上限（次/15 分钟/IP）</label>
              <input
                type="number"
                min={0}
                value={form.security_login_max}
                onChange={(e) => update('security_login_max', Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">注册上限（次/小时/IP）</label>
              <input
                type="number"
                min={0}
                value={form.security_register_max}
                onChange={(e) => update('security_register_max', Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">评论/发文上限（次/10 分钟/IP）</label>
              <input
                type="number"
                min={0}
                value={form.security_comment_max}
                onChange={(e) => update('security_comment_max', Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">超限封禁时长（分钟）</label>
              <input
                type="number"
                min={1}
                value={form.security_block_minutes}
                onChange={(e) => update('security_block_minutes', Number(e.target.value))}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">保留参数，用于提示封禁节奏</p>
            </div>
          </div>
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            说明：限流为滑动窗口计数，0 表示不限制该项。
          </p>
        </Section>

        <Section icon={<Mail className="h-4 w-4 text-sky-500" />} title="邮箱验证码">
          <p className="text-xs text-muted-foreground">
            开启后，注册/登录需先获取发送到邮箱的 6 位验证码（需先在「网站管理」配置 SMTP）
          </p>
          <div className="mt-2 divide-y divide-border border-t border-border">
            <Toggle
              checked={form.email_code_on_register}
              onChange={(v) => update('email_code_on_register', v)}
              label="注册需要邮箱验证码"
              desc="防止批量注册"
            />
            <Toggle
              checked={form.email_code_on_login}
              onChange={(v) => update('email_code_on_login', v)}
              label="登录需要邮箱验证码"
              desc="更安全，但用户每次登录需查收邮件"
            />
          </div>
        </Section>

        <Section icon={<Fingerprint className="h-4 w-4 text-indigo-500" />} title="人机验证（极验第四代）">
          <p className="text-xs text-muted-foreground">
            开启后，登录 / 注册 / 发表评论提交时会弹出极验行为验证（滑块或点选文字），
            阻挡机器脚本与批量攻击。需先在{' '}
            <a
              href="https://www.geetest.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline underline-offset-4"
            >
              极验官网
            </a>
            {' '}获取 captchaId 与 captchaKey。
          </p>
          <div className="mt-2 divide-y divide-border border-t border-border">
            <Toggle
              checked={form.geetest_enabled}
              onChange={(v) => update('geetest_enabled', v)}
              label="启用人机验证"
              desc="总开关；关闭后下方场景全部失效"
            />
            <Toggle
              checked={form.geetest_on_login}
              onChange={(v) => update('geetest_on_login', v)}
              label="登录需人机验证"
              desc="用户点击登录时先弹窗验证"
            />
            <Toggle
              checked={form.geetest_on_register}
              onChange={(v) => update('geetest_on_register', v)}
              label="注册需人机验证"
              desc="抵御批量注册小号"
            />
            <Toggle
              checked={form.geetest_on_comment}
              onChange={(v) => update('geetest_on_comment', v)}
              label="发表评论需人机验证"
              desc="评论/发帖提交前先验证"
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">验证 ID（captchaId）</label>
              <input
                value={form.geetest_captcha_id}
                onChange={(e) => update('geetest_captcha_id', e.target.value)}
                placeholder="极验后台获取，形如 8342ecxxxx0a56c73d8b0a2f8xxxxxx"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                验证密钥（captchaKey）
                {form.geetest_captcha_key_set && (
                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                    已配置（留空保持不变）
                  </span>
                )}
              </label>
              <SecretInput
                key={`geetest-key-${form.geetest_captcha_key_set ? 'set' : 'unset'}`}
                value={form.geetest_captcha_key}
                onChange={(v) => update('geetest_captcha_key', v)}
                isSet={form.geetest_captcha_key_set}
                placeholder={form.geetest_captcha_key_set ? '已保存，重新输入可覆盖' : '未设置'}
                className={inputClass}
              />
            </div>
          </div>
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            说明：密钥仅保存在服务端用于二次校验，不会下发到浏览器；若已开启场景但未填写 captchaId /
            密钥，或极验服务不可达时自动放行，不会把用户锁死在登录之外。
          </p>
        </Section>

        <Section icon={<KeyRound className="h-4 w-4 text-amber-500" />} title="安全建议">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>· 生产环境务必修改 JWT_SECRET 与数据库密码</li>
            <li>· 建议结合「人机验证」「访问限流」与「邮箱验证码」，抵御垃圾注册与暴力破解</li>
            <li>· 全站已自动附加 X-Frame-Options、X-Content-Type-Options、Referrer-Policy 等安全响应头</li>
            <li>· 使用 HTTPS（Caddy/Nginx）可进一步保护传输安全</li>
          </ul>
        </Section>
      </div>
    </PageTransition>
  )
}
