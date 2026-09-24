'use client'

import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold,
  Code,
  Eye,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Strikethrough,
} from 'lucide-react'
import { uploadImage, ApiError } from '@/lib/api'
import { useNotify } from '@/components/toast'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type Snippet = { text: string; selStart: number; selEnd: number }

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const notify = useNotify()
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  // 所有操作在事件回调里拿到 textarea（ta），避免在渲染期读取 ref
  const apply = (ta: HTMLTextAreaElement | null, build: (sel: string) => Snippet) => {
    if (!ta) return
    const { selectionStart, selectionEnd } = ta
    const selected = value.slice(selectionStart, selectionEnd)
    const { text, selStart, selEnd } = build(selected)
    onChange(value.slice(0, selectionStart) + text + value.slice(selectionEnd))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(selectionStart + selStart, selectionStart + selEnd)
    })
  }

  const wrapInline = (ta: HTMLTextAreaElement | null, token: string, ph: string) =>
    apply(ta, (sel) => {
      const body = sel || ph
      return { text: `${token}${body}${token}`, selStart: token.length, selEnd: token.length + body.length }
    })

  const prefixLines = (ta: HTMLTextAreaElement | null, prefix: string, ph: string) =>
    apply(ta, (sel) => {
      const text = sel ? sel.split('\n').map((l) => prefix + l).join('\n') : `${prefix}${ph}`
      return { text, selStart: 0, selEnd: text.length }
    })

  const insertLink = (ta: HTMLTextAreaElement | null) =>
    apply(ta, (sel) => {
      const text = `[${sel || '链接文字'}](https://)`
      return { text, selStart: text.length - 1, selEnd: text.length - 1 }
    })

  const insertImage = (ta: HTMLTextAreaElement | null) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const url = await uploadImage(file)
        apply(ta, () => ({ text: `![图片描述](${url})`, selStart: 2, selEnd: 6 }))
      } catch (err) {
        notify.error(err instanceof ApiError ? err.message : '图片上传失败')
      }
    }
    input.click()
  }

  const tools: { icon: typeof Bold; title: string; action: (ta: HTMLTextAreaElement | null) => void }[] = [
    { icon: Bold, title: '加粗', action: (ta) => wrapInline(ta, '**', '加粗文字') },
    { icon: Italic, title: '斜体', action: (ta) => wrapInline(ta, '*', '斜体文字') },
    { icon: Strikethrough, title: '删除线', action: (ta) => wrapInline(ta, '~~', '删除线') },
    { icon: Heading1, title: '一级标题', action: (ta) => prefixLines(ta, '# ', '一级标题') },
    { icon: Heading2, title: '二级标题', action: (ta) => prefixLines(ta, '## ', '二级标题') },
    { icon: Heading3, title: '三级标题', action: (ta) => prefixLines(ta, '### ', '三级标题') },
    { icon: List, title: '无序列表', action: (ta) => prefixLines(ta, '- ', '列表项') },
    { icon: ListOrdered, title: '有序列表', action: (ta) => prefixLines(ta, '1. ', '列表项') },
    { icon: Quote, title: '引用', action: (ta) => prefixLines(ta, '> ', '引用内容') },
    { icon: Code, title: '行内代码', action: (ta) => wrapInline(ta, '`', 'code') },
    {
      icon: FileCode,
      title: '代码块',
      action: (ta) =>
        apply(ta, (sel) => {
          const body = sel || 'code'
          return { text: `\`\`\`\n${body}\n\`\`\``, selStart: 4, selEnd: 4 + body.length }
        }),
    },
    { icon: Link2, title: '链接', action: insertLink },
    { icon: ImageIcon, title: '上传图片', action: insertImage },
    { icon: Minus, title: '分割线', action: (ta) => apply(ta, () => ({ text: '\n---\n', selStart: 5, selEnd: 5 })) },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            onClick={() => t.action(taRef.current)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-accent"
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <TabButton active={tab === 'write'} onClick={() => setTab('write')} icon={<PenLine className="h-3.5 w-3.5" />} label="编辑" />
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye className="h-3.5 w-3.5" />} label="预览" />
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-2">
        {/* 编辑区 */}
        <div className={tab === 'write' ? '' : 'hidden lg:block'}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? '用 Markdown 开始写作…\n\n# 标题  **加粗**  `代码`\n- 列表项\n> 引用\n\n![图片](url)'}
            className="h-[60vh] min-h-[360px] w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none lg:h-[68vh]"
          />
        </div>

        {/* 预览区 */}
        <div className={`border-t border-border lg:border-t-0 lg:border-l ${tab === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="prose prose-neutral dark:prose-invert h-[60vh] min-h-[360px] max-w-none overflow-y-auto px-4 py-4 lg:h-[68vh] prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-img:rounded-xl">
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">预览会显示在这里…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
        active ? 'bg-accent text-white' : 'text-muted-foreground'
      }`}
    >
      {icon} {label}
    </button>
  )
}
