'use client'

import { useEffect, useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import gsap from 'gsap'
import { easeOut, hoverTapScale, prefersReducedMotion, useReveal } from '@/components/motion'
import { RowLoading } from '@/components/page-loader'
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  setUserStatus,
  updateAdminUserRole,
  updateAdminUser,
  ApiError,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useNotify } from '@/components/toast'
import { SecretInput } from '@/components/secret-input'
import { Modal } from '@/components/modal'
import { inputClass } from '@/lib/ui'
import type { AdminUser } from '@/lib/types'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function AddUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (username: string) => void
}) {
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')

  // 角色选中胶囊：切换时以 scaleX 入场（替代 framer layoutId 滑动）
  const pillRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (pillRef.current && !prefersReducedMotion()) {
      gsap.fromTo(pillRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: easeOut })
    }
  }, [role])

  const create = useMutation({
    mutationFn: () =>
      createAdminUser({ email, username, password, role }),
    onSuccess: (res) => {
      onCreated(res.user.username)
      onClose()
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '创建失败'),
    })

    const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !username.trim() || !password) {
      notify.error('请填写完整信息')
      return
    }
    create.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="添加用户"
      description="创建后请告知用户及时修改初始密码"
      width={440}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            取消
          </button>
          <button
            type="submit"
            form="add-user-form"
            {...hoverTapScale}
            disabled={create.isPending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {create.isPending ? '创建中...' : '创建用户'}
          </button>
        </div>
      }
    >
      <form id="add-user-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">用户名</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="2-32 个字符"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">初始密码</label>
          <input
            type="text"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 个字符"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">角色</label>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            {(['user', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`relative flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  role === r ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {role === r && (
                  <span
                    key={`role-pill-${role}`}
                    ref={pillRef}
                    className={`absolute inset-0 origin-left rounded-md ${
                      r === 'admin' ? 'bg-purple-500' : 'bg-accent'
                    }`}
                  />
                )}
                <span className="relative">{r === 'admin' ? '管理员' : '普通用户'}</span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

function EditUserDialog({
  target,
  onClose,
  onSaved,
}: {
  target: AdminUser
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useNotify()
  const [email, setEmail] = useState(target.email)
  const [username, setUsername] = useState(target.username)
  const [password, setPassword] = useState('')

  const save = useMutation({
    mutationFn: () =>
      updateAdminUser(target.id, {
        email,
        username,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      onSaved()
      notify.success('用户资料已更新')
      onClose()
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '保存失败'),
    })

    return (
    <Modal
      open
      onClose={onClose}
      title={`编辑用户 · ${target.username}`}
      description="重置密码留空表示不修改"
      width={440}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            取消
          </button>
          <button
            type="submit"
            form="edit-user-form"
            {...hoverTapScale}
            disabled={save.isPending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25 disabled:opacity-50"
          >
            {save.isPending ? '保存中...' : '保存修改'}
          </button>
        </div>
      }
    >
      <form
        id="edit-user-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!email.trim() || !username.trim()) {
            notify.error('邮箱和用户名不能为空')
            return
          }
          save.mutate()
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">用户名</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">重置密码（可选）</label>
          <SecretInput
            value={password}
            onChange={setPassword}
            placeholder="留空表示不修改密码"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">填写后该用户密码将立即变更，请告知本人</p>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch],
    queryFn: () => fetchAdminUsers({ page: 1, page_size: 50, q: debouncedSearch || undefined }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'admin' | 'user' }) => updateAdminUserRole(id, role),
    onSuccess: (_res, vars) => {
      invalidate()
      notify.success(vars.role === 'admin' ? '已设为管理员' : '已设为普通用户')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'banned' }) =>
      setUserStatus(id, status),
    onSuccess: (_res, vars) => {
      invalidate()
      notify.success(vars.status === 'banned' ? '用户已封禁' : '用户已解封')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '操作失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: () => {
      invalidate()
      notify.success('用户已删除')
    },
    onError: (e) => notify.error(e instanceof ApiError ? e.message : '删除失败'),
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `共 ${data.total} 个用户` : '加载中...'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索邮箱或用户名..."
            className="w-full min-w-0 rounded-lg border border-border bg-card px-3.5 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-56"
          />
          <button
            onClick={() => setAddOpen(true)}
            {...hoverTapScale}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/25"
          >
            <UserPlus className="h-4 w-4" />
            添加用户
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6">
          <RowLoading rows={4} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[680px] whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">用户</th>
                <th className="px-5 py-3 font-medium">邮箱</th>
                <th className="px-5 py-3 font-medium">角色</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">注册时间</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u, i) => (
                <UserRow
                  key={u.id}
                  u={u}
                  index={i}
                  isSelf={u.id === me?.id}
                  pending={roleMutation.isPending || statusMutation.isPending || deleteMutation.isPending}
                  onRoleChange={(id, role) => roleMutation.mutate({ id, role })}
                  onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
                  onEdit={(target) => setEditTarget(target)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
              {(data?.users.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    没有匹配的用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <EditUserDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={invalidate}
        />
      )}

  {addOpen && (
    <AddUserDialog
      onClose={() => setAddOpen(false)}
      onCreated={(username) => {
        invalidate()
        notify.success(`用户「${username}」创建成功`)
      }}
    />
  )}
    </div>
  )
}

/** 用户表格行：独立组件，入场动画只在挂载时播放一次（useReveal 自带 rAF 兜底） */
function UserRow({
  u,
  index,
  isSelf,
  pending,
  onRoleChange,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  u: AdminUser
  index: number
  isSelf: boolean
  pending: boolean
  onRoleChange: (id: number, role: 'admin' | 'user') => void
  onStatusChange: (id: number, status: 'active' | 'banned') => void
  onEdit: (u: AdminUser) => void
  onDelete: (id: number) => void
}) {
  const notify = useNotify()
  const rowRef = useRef<HTMLTableRowElement>(null)
  // 逐行淡入上移；行数多时收敛总时长（封顶 0.3s），避免长列表入场拖沓
  useReveal(rowRef, { y: 10, duration: 0.35, delay: Math.min(index * 0.04, 0.3) })
  const banned = u.status === 'banned'

  return (
    <tr
      ref={rowRef}
      className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50 ${
        banned ? 'opacity-60' : ''
      }`}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              banned ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
            }`}
          >
            {u.username.charAt(0).toUpperCase()}
          </span>
          <span className="font-medium">{u.username}</span>
          {isSelf && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">我</span>
          )}
        </div>
      </td>
      <td className="px-5 py-3.5 text-muted-foreground">{u.email}</td>
      <td className="px-5 py-3.5">
        {isSelf ? (
          <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
            管理员
          </span>
        ) : (
          <select
            value={u.role}
            onChange={(e) => onRoleChange(u.id, e.target.value as 'admin' | 'user')}
            disabled={pending}
            className="rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none transition-colors hover:border-accent/40 disabled:opacity-50"
          >
            <option value="user">用户</option>
            <option value="admin">管理员</option>
          </select>
        )}
      </td>
      <td className="px-5 py-3.5">
        {banned ? (
          <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
            已封禁
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            正常
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 text-xs text-muted-foreground">
        {new Date(u.created_at).toLocaleDateString('zh-CN')}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="inline-flex items-center gap-1">
          {banned ? (
            <button
              onClick={() => onStatusChange(u.id, 'active')}
              disabled={isSelf || pending}
              className="rounded-md px-2.5 py-1.5 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-30 dark:text-emerald-400"
            >
              解封
            </button>
          ) : (
            <button
              onClick={async () => {
                const ok = await notify.confirm({
                  title: `封禁用户「${u.username}」？`,
                  message: '封禁后该用户将无法登录和操作，可随时解封。',
                  confirmText: '确认封禁',
                  danger: true,
                })
                if (ok) onStatusChange(u.id, 'banned')
              }}
              disabled={isSelf || pending}
              className="rounded-md px-2.5 py-1.5 text-xs text-amber-600 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-30 dark:text-amber-400"
            >
              封禁
            </button>
          )}
          <button
            onClick={() => onEdit(u)}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            编辑
          </button>
          <button
            onClick={async () => {
              const ok = await notify.confirm({
                title: `删除用户「${u.username}」？`,
                message: '该用户的所有文章将一并删除，此操作无法撤销。',
                confirmText: '确认删除',
                danger: true,
              })
              if (ok) onDelete(u.id)
            }}
            disabled={isSelf || pending}
            className="rounded-md px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            删除
          </button>
        </div>
      </td>
    </tr>
  )
}
