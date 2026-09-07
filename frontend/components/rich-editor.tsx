'use client'

import { EditorContent, useEditor, type Editor } from '@tiptap/react'
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

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  title,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-30 ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" />
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      <ToolbarButton
        label="B"
        title="加粗"
        active={editor.isActive('bold')}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        title="斜体"
        active={editor.isActive('italic')}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        label="S"
        title="删除线"
        active={editor.isActive('strike')}
        onClick={() => chain().toggleStrike().run()}
      />
      <ToolbarButton
        label="U"
        title="下划线"
        active={editor.isActive('underline')}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Divider />
      <ToolbarButton
        label="H1"
        title="一级标题"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="H2"
        title="二级标题"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="H3"
        title="三级标题"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <ToolbarButton
        label="• 列表"
        title="无序列表"
        active={editor.isActive('bulletList')}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        label="1. 列表"
        title="有序列表"
        active={editor.isActive('orderedList')}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="❝ 引用"
        title="引用"
        active={editor.isActive('blockquote')}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="代码块"
        title="代码块"
        active={editor.isActive('codeBlock')}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <Divider />
      <ToolbarButton
        label="链接"
        title="插入链接"
        active={editor.isActive('link')}
        onClick={() => {
          const url = window.prompt('链接地址：', editor.getAttributes('link').href ?? 'https://')
          if (url === null) return
          if (url === '') {
            chain().unsetLink().run()
          } else {
            chain().setLink({ href: url }).run()
          }
        }}
      />
      <ToolbarButton
        label="图片"
        title="插入图片"
        onClick={() => {
          const url = window.prompt('图片地址：', 'https://')
          if (url && url !== 'https://') {
            chain().setImage({ src: url }).run()
          }
        }}
      />
      <ToolbarButton label="— 分割线" title="分割线" onClick={() => chain().setHorizontalRule().run()} />
      <Divider />
      <ToolbarButton
        label="↺"
        title="撤销"
        disabled={!editor.can().undo()}
        onClick={() => chain().undo().run()}
      />
      <ToolbarButton
        label="↻"
        title="重做"
        disabled={!editor.can().redo()}
        onClick={() => chain().redo().run()}
      />
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
      Placeholder.configure({ placeholder: '开始写作...' }),
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
    return <div className="skeleton min-h-[460px] rounded-lg" />
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
      <div className={plain ? 'rounded-t-lg border-b border-border bg-card' : ''}>
        <Toolbar editor={editor} />
      </div>
      <EditorContent editor={editor} />
    </motion.div>
  )
}
