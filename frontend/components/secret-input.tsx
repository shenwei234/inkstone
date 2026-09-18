'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  /** 服务端是否已保存过该密钥 */
  isSet?: boolean
  placeholder?: string
  className?: string
  autoComplete?: string
}

/**
 * 密钥/密码输入框：
 * - 右侧「小眼睛」切换明文/密文
 * - 已保存过且未重新输入时，显示为 ***（不暴露真实值）
 */
export function SecretInput({
  value,
  onChange,
  isSet = false,
  placeholder,
  className = '',
  autoComplete = 'new-password',
}: Props) {
  const [visible, setVisible] = useState(false)
  // 已保存且用户未输入新值时，展示占位星号
  const showingSaved = isSet && value === ''

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={showingSaved ? '••••••••••••' : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          // 聚焦时清空占位，开始输入新密钥
          if (showingSaved) onChange('')
        }}
        placeholder={placeholder ?? (isSet ? '已保存，留空表示不修改' : '未设置')}
        autoComplete={autoComplete}
        readOnly={showingSaved && !visible}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? '隐藏' : '显示'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
