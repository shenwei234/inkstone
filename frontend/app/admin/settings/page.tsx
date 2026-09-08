'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Mail, Send } from 'lucide-react'
import {
  fetchAdminSettings,
  sendTestMail,
  updateAdminSettings,
  ApiError,
} from '@/lib/api'
import { useNotify } from '@/components/toast'

const easeOut = [0.16, 1, 0.3, 1] as const

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20'

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
        enabled ? 'bg-emerald-500' : 'bg-border'
      }`}
    >
      <motion.span
        animate={{ x: enabled ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
      />
    </button>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
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
      <div className="space-y-4 px-5 py-5">{children}</div>
    </motion.section>
  )
}

export default function AdminSettingsPage() {
  const notify = useNotify()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
  })

  const [siteName, setSiteName] = useState('')
  const [siteDescription, setSiteDescription] = useState('')
  const [siteIcp, setSiteIcp] = useState('')
  const [allowReg, setAllowReg] = useState(true)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [testTo, setTestTo] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (data && !hydrated) {
      setSiteName(data.site_name)
      setSiteDescription(data.site_description)
      setSiteIcp(data.site_icp)
      setAllowReg(data.allow_registration)
      setSmtpHost(data.smtp_host)
      setSmtpPort(data.smtp_port)
      setSmtpUser(data.smtp_user)
      setSmtpFrom(data.smtp_from)
      setHydrated(true)
    }
  }, [data, hydrated])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
    queryClient.invalidateQueries({ queryKey: ['site-config'] })
  }

  const saveBasic = useMutation({
    mutationFn: () =>
      updateAdminSettings({
        site_name: siteName,
        site_description: siteDescription,
        site_icp: siteIcp,
      }),
    onSuccess: () => {
      invalidate()
      notify.success('站点信息已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const saveReg = useMutation({
    mutationFn: (allow: boolean) => updateAdminSettings({ allow_registration: allow }),
    onSuccess: (_res, allow) => {
      invalidate()
      notify.success(allow ? '已开启用户注册' : '已关闭用户注册')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const saveSmtp = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
      }
      if (smtpPass) patch.smtp_pass = smtpPass
      return updateAdminSettings(patch)
    },
    onSuccess: () => {
      invalidate()
      setSmtpPass('')
      notify.success('邮件配置已保存')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
  })

  const testMail = useMutation({
    mutationFn: () => sendTestMail(testTo),
    onSuccess: (res) => notify.success(res.message),
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '发送失败'),
  })

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">网站管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">站点信息、注册开关与邮件服务配置</p>
      </div>

      {/* Site identity */}
      <Section title="站点信息" icon={<Globe className="h-4 w-4 text-accent" />}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">网站名称</label>
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Blog 平台"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">网站描述</label>
          <input
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            placeholder="一句话介绍你的网站"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">备案号（可选）</label>
          <input
            value={siteIcp}
            onChange={(e) => setSiteIcp(e.target.value)}
            placeholder="如：京ICP备XXXXXXXX号"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => saveBasic.mutate()}
            disabled={saveBasic.isPending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {saveBasic.isPending ? '保存中...' : '保存站点信息'}
          </motion.button>
        </div>
      </Section>

      {/* Registration switch */}
      <Section title="用户注册" icon={<Globe className="h-4 w-4 text-accent" />}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">开放注册</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              关闭后，新用户将无法自行注册（已注册用户不受影响）
            </p>
          </div>
          <Toggle
            enabled={allowReg}
            disabled={!data || saveReg.isPending}
            onChange={() => {
              const next = !allowReg
              setAllowReg(next)
              saveReg.mutate(next)
            }}
          />
        </div>
      </Section>

      {/* SMTP */}
      <Section title="邮件服务（SMTP）" icon={<Mail className="h-4 w-4 text-accent" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">SMTP 服务器</label>
            <input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">端口</label>
            <input
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="465"
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">SMTP 账号</label>
          <input
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="no-reply@example.com"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            SMTP 密码 / 授权码
            {data?.smtp_pass_set && (
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">已设置</span>
            )}
          </label>
          <input
            type="password"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            placeholder={data?.smtp_pass_set ? '留空表示不修改' : '尚未设置'}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">发件人显示（可选）</label>
          <input
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value)}
            placeholder="Blog 平台 &lt;no-reply@example.com&gt;"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => saveSmtp.mutate()}
            disabled={saveSmtp.isPending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {saveSmtp.isPending ? '保存中...' : '保存邮件配置'}
          </motion.button>
        </div>

        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">发送测试邮件验证配置</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="你的邮箱"
              className={`${inputClass} flex-1`}
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (!testTo.trim()) {
                  notify.error('请填写收件邮箱')
                  return
                }
                testMail.mutate()
              }}
              disabled={testMail.isPending}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {testMail.isPending ? '发送中...' : '发送测试'}
            </motion.button>
          </div>
        </div>
      </Section>
    </div>
  )
}
