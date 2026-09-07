'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface RichEditorProps {
  content: string
  onChange: (html: string) => void
  variant?: 'card' | 'plain'
}

function ToolButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-30 ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function BubbleBar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-xl shadow-black/10">
      <button
        type="button"
        title="加粗"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`h-8 w-8 rounded-md text-sm font-bold transition-colors ${
          editor.isActive('bold')
            ? 'bg-accent text-white'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        B
      </button>
      <button
        type="button"
        title="设为标题"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`h-8 rounded-md px-2 text-sm font-semibold transition-colors ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-accent text-white'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        标题
      </button>
      <button
        type="button"
        title="插入链接"
        onClick={() => {
          const url = window.prompt('输入链接地址：', editor.getAttributes('link').href ?? 'https://')
          if (url === null) return
          if (url === '') {
            editor.chain().focus().unsetLink().run()
          } else {
            editor.chain().focus().setLink({ href: url }).run()
          }
        }}
        className={`h-8 rounded-md px-2 text-sm transition-colors ${
          editor.isActive('link')
            ? 'bg-accent text-white'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        链接
      </button>
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
      <ToolButton
        title="加粗"
        active={editor.isActive('bold')}
        onClick={() => chain().toggleBold().run()}
      >
        <span className="font-bold">B 加粗</span>
      </ToolButton>
      <ToolButton
        title="标题"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        标题
      </ToolButton>
      <ToolButton
        title="列表"
        active={editor.isActive('bulletList')}
        onClick={() => chain().toggleBulletList().run()}
      >
        • 列表
      </ToolButton>
      <ToolButton
        title="引用"
        active={editor.isActive('blockquote')}
        onClick={() => chain().toggleBlockquote().run()}
      >
        引用
      </ToolButton>
      <ToolButton
        title="插入链接"
        active={editor.isActive('link')}
        onClick={() => {
          const url = window.prompt('输入链接地址：', editor.getAttributes('link').href ?? 'https://')
          if (url === null) return
          if (url === '') {
            chain().unsetLink().run()
          } else {
            chain().setLink({ href: url }).run()
          }
        }}
      >
        链接
      </ToolButton>
      <ToolButton
        title="插入图片"
        onClick={() => {
          const url = window.prompt('输入图片地址：', 'https://')
          if (url && url !== 'https://') {
            chain().setImage({ src: url }).run()
          }
        }}
      >
        图片
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton
        title="撤销"
        disabled={!editor.can().undo()}
        onClick={() => chain().undo().run()}
      >
        ↺
      </ToolButton>
      <ToolButton
        title="重做"
        disabled={!editor.can().redo()}
        onClick={() => chain().redo().run()}
      >
        ↻
      </ToolButton>
    </div>
  )
}

export function RichEditor({ content, onChange, variant = 'card' }: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: '开始写正文吧... 选中文字会出现排版按钮' }),
      Image.configure({ inline: false }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          'wp-editor prose prose-neutral dark:prose-invert max-w-none min-h-[420px] px-0 py-2 focus:outline-none prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl prose-blockquote:border-l-accent',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  if (!editor) {
    return <div className="skeleton min-h-[420px] rounded-lg" />
  }

  const plain = variant === 'plain'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={
        plain
          ? 'overflow-visible'
          : 'overflow-hidden rounded-lg border border-border bg-card transition-colors focus-within:border-accent/50'
      }
    >
      {plain ? (
        <div className="rounded-t-lg border-b border-border bg-card">
          <Toolbar editor={editor} />
        </div>
      ) : (
        <Toolbar editor={editor} />
      )}

      <BubbleMenu editor={editor} options={{ placement: 'top', offset: 10 }}>
        <BubbleBar editor={editor} />
      </BubbleMenu>

      <EditorContent editor={editor} />
    </motion.div>
  )
}
