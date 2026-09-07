'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import type { Node as PMNode } from 'prosemirror-model'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Code2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Trash2,
  Type,
} from 'lucide-react'

interface RichEditorProps {
  content: string
  onChange: (html: string) => void
  variant?: 'card' | 'plain'
}

interface DialogOptions {
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  hint?: string
  confirmText?: string
}

const promptOpener: {
  current: ((opts: DialogOptions) => Promise<string | null>) | null
} = { current: null }

interface BlockItem {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  textOnly: boolean
  command: (ctx: { editor: Editor; range: { from: number; to: number } }) => void
}

const BLOCK_ITEMS: BlockItem[] = [
  {
    key: 'h2',
    label: '标题',
    desc: '大号章节标题',
    icon: <Heading2 className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    key: 'h3',
    label: '小标题',
    desc: '小号章节标题',
    icon: <Heading3 className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    key: 'p',
    label: '正文',
    desc: '普通文字段落',
    icon: <Type className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
  },
  {
    key: 'ul',
    label: '列表',
    desc: '圆点符号列表',
    icon: <List className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: 'ol',
    label: '编号列表',
    desc: '1. 2. 3. 数字列表',
    icon: <ListOrdered className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: 'quote',
    label: '引用',
    desc: '突出显示一段话',
    icon: <Quote className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    key: 'code',
    label: '代码块',
    desc: '等宽字体的代码',
    icon: <Code2 className="h-4 w-4" />,
    textOnly: true,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: 'hr',
    label: '分割线',
    desc: '分隔内容的横线',
    icon: <Minus className="h-4 w-4" />,
    textOnly: false,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    key: 'image',
    label: '图片',
    desc: '插入一张图片',
    icon: <ImageIcon className="h-4 w-4" />,
    textOnly: false,
    command: async ({ editor, range }) => {
      const opener = promptOpener.current
      if (!opener) return
      const url = await opener({
        title: '插入图片',
        label: '图片地址',
        placeholder: 'https://example.com/photo.jpg',
        hint: '支持外链图片，建议使用 https:// 开头的地址',
        confirmText: '插入',
      })
      if (url && url.trim()) {
        editor.chain().focus().deleteRange(range).setImage({ src: url.trim() }).run()
      } else {
        editor.chain().focus().run()
      }
    },
  },
]

interface SlashState {
  open: boolean
  rect: DOMRect | null
  items: BlockItem[]
  selectedIndex: number
  command: ((item: BlockItem) => void) | null
  range: { from: number; to: number } | null
}

const INITIAL_SLASH: SlashState = {
  open: false,
  rect: null,
  items: BLOCK_ITEMS,
  selectedIndex: 0,
  command: null,
  range: null,
}

interface BlockInfo {
  el: HTMLElement
  pos: number
  typeName: string
  level: number | null
  isEmptyP: boolean
  index: number
  count: number
}

const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        decorationClass: 'slash-query',
        allow: ({ state }: { state: { selection: { $from: { parent: { textBetween: (f: number, t: number, u?: unknown, r?: string) => string }; parentOffset: number } } } }) => {
          const $from = state.selection.$from
          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
          return /^\/[^ ]*$/.test(textBefore)
        },
        items: ({ query }: { query: string }) =>
          BLOCK_ITEMS.filter((item) =>
            (item.label + item.desc).toLowerCase().includes(query.toLowerCase()),
          ),
        render: () => ({
          onStart: (props: SuggestionProps) => handlers.current.onStart?.(props),
          onUpdate: (props: SuggestionProps) => handlers.current.onUpdate?.(props),
          onKeyDown: (props: SuggestionKeyDownProps) => handlers.current.onKeyDown?.(props) ?? false,
          onExit: () => handlers.current.onExit?.(),
        }),
      },
    }
  },
  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})

const handlers: {
  current: {
    onStart?: (props: SuggestionProps) => void
    onUpdate?: (props: SuggestionProps) => void
    onKeyDown?: (props: SuggestionKeyDownProps) => boolean
    onExit?: () => void
  }
} = { current: {} }

function moveBlock(ed: Editor, dir: -1 | 1): boolean {
  const { state } = ed
  const { $from } = state.selection
  if ($from.depth < 1) return false
  const index = $from.index(0)
  const target = index + dir
  if (target < 0 || target >= state.doc.childCount) return false

  const children: PMNode[] = []
  state.doc.content.forEach((node) => children.push(node))
  const tmp = children[index]
  children[index] = children[target]
  children[target] = tmp

  const tr = state.tr
  tr.replaceWith(0, state.doc.content.size, Fragment.fromArray(children))

  let offset = 0
  for (let i = 0; i < target; i++) offset += children[i].nodeSize
  const clamped = Math.min(offset + 1, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(clamped), dir === -1 ? 1 : -1))
  ed.view.dispatch(tr)
  return true
}

function ToolButton({
  active,
  disabled,
  onClick,
  children,
  title,
  onMouseDown,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
  onMouseDown?: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={onMouseDown ?? ((e) => e.preventDefault())}
      onClick={onClick}
      className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors disabled:opacity-30 ${
        active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function BlockToolbar({
  editor,
  block,
  openPrompt,
}: {
  editor: Editor
  block: BlockInfo
  openPrompt: (opts: DialogOptions) => Promise<string | null>
}) {
  const isText = !['image', 'horizontalRule'].includes(block.typeName)
  const isP = block.typeName === 'paragraph'
  const isH2 = block.typeName === 'heading' && block.level === 2
  const isH3 = block.typeName === 'heading' && block.level === 3
  const isUl = block.typeName === 'bulletList'
  const isQuote = block.typeName === 'blockquote'

  const rect = block.el.getBoundingClientRect()
  const top = Math.max(64, rect.top - 46)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 480))

  return (
    <div
      style={{ position: 'fixed', top, left, zIndex: 60 }}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1 shadow-xl shadow-black/10"
    >
      {isText && (
        <>
          <ToolButton title="正文" active={isP} onClick={() => editor.chain().focus().setNode('paragraph').run()}>
            <Type className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="标题 H2" active={isH2} onClick={() => editor.chain().focus().setNode('heading', { level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="小标题 H3" active={isH3} onClick={() => editor.chain().focus().setNode('heading', { level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </ToolButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolButton title="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <span className="font-bold">B</span>
          </ToolButton>
          <ToolButton title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="italic">I</span>
          </ToolButton>
          <ToolButton
            title="插入链接"
            active={editor.isActive('link')}
            onClick={async () => {
              const current = editor.getAttributes('link').href ?? ''
              const url = await openPrompt({
                title: '插入链接',
                label: '链接地址',
                defaultValue: current,
                placeholder: 'https://example.com',
                hint: current ? '清空输入框并确认可移除该链接' : '选中的文字将变为链接',
                confirmText: '确定',
              })
              if (url === null) return
              if (url.trim() === '') {
                editor.chain().focus().unsetLink().run()
              } else {
                editor.chain().focus().setLink({ href: url.trim() }).run()
              }
            }}
          >
            <Link2 className="h-4 w-4" />
          </ToolButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolButton title="列表" active={isUl} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="引用" active={isQuote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolButton>
        </>
      )}
      {!isText && (
        <span className="px-2 text-xs font-medium text-muted-foreground">
          {block.typeName === 'image' ? '图片' : '分割线'}
        </span>
      )}

      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton
        title="上移"
        disabled={block.index === 0}
        onClick={() => moveBlock(editor, -1)}
      >
        <ChevronUp className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="下移"
        disabled={block.index === block.count - 1}
        onClick={() => moveBlock(editor, 1)}
      >
        <ChevronDown className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="删除此块"
        onClick={() => editor.chain().focus().setNodeSelection(block.pos).deleteSelection().run()}
      >
        <span className="flex items-center gap-1 text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </span>
      </ToolButton>
    </div>
  )
}

function BlockPicker({
  rect,
  items,
  selectedIndex,
  onHover,
  onPick,
}: {
  rect: { top: number; left: number }
  items: BlockItem[]
  selectedIndex: number
  onHover: (i: number) => void
  onPick: (item: BlockItem) => void
}) {
  const top = Math.min(rect.top + 8, window.innerHeight - 380)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300))

  return (
    <div
      style={{ position: 'fixed', top, left, zIndex: 70 }}
      className="w-72 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/15"
    >
      <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
        选择要插入的区块
      </p>
      <div className="max-h-72 overflow-y-auto p-1">
        {items.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的区块</p>
        )}
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(item)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
              i === selectedIndex ? 'bg-accent/10' : 'hover:bg-muted'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                i === selectedIndex
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${i === selectedIndex ? 'text-accent' : ''}`}>
                {item.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function RichEditor({ content, onChange, variant = 'card' }: RichEditorProps) {
  const plain = variant === 'plain'
  const [focused, setFocused] = useState(false)
  const [block, setBlock] = useState<BlockInfo | null>(null)
  const [slash, setSlash] = useState<SlashState>(INITIAL_SLASH)
  const [plusOpen, setPlusOpen] = useState(false)
  const [dialog, setDialog] = useState<(DialogOptions & { resolve: (v: string | null) => void }) | null>(null)
  const dialogRef = useRef<HTMLInputElement>(null)

  const openPrompt = useCallback(
    (opts: DialogOptions) =>
      new Promise<string | null>((resolve) => {
        setDialog({ ...opts, resolve })
      }),
    [],
  )

  const closeDialog = useCallback((value: string | null) => {
    setDialog((d) => {
      d?.resolve(value)
      return null
    })
  }, [])

  useEffect(() => {
    promptOpener.current = openPrompt
    return () => {
      promptOpener.current = null
    }
  }, [openPrompt])

  useEffect(() => {
    if (dialog) {
      requestAnimationFrame(() => {
        dialogRef.current?.focus()
        dialogRef.current?.select()
      })
    }
  }, [dialog])

  const confirmDialog = useCallback(() => {
    closeDialog(dialogRef.current?.value ?? null)
  }, [closeDialog])

  const slashRef = useRef<SlashState>(INITIAL_SLASH)
  useEffect(() => {
    slashRef.current = slash
  }, [slash])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: '输入 / 快速插入区块，或直接开始写作...' }),
      Image.configure({ inline: false }),
      SlashCommandExtension,
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
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false)
      setPlusOpen(false)
    },
  })

  const updateBlockInfo = useCallback(() => {
    const ed = editor
    if (!ed || ed.isDestroyed) {
      setBlock(null)
      return
    }
    const { state, view } = ed
    const { $from } = state.selection
    if ($from.depth < 1) {
      setBlock(null)
      return
    }
    const node = $from.node(1)
    const pos = $from.before(1)
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) {
      setBlock(null)
      return
    }
    setBlock({
      el: dom,
      pos,
      typeName: node.type.name,
      level: node.type.name === 'heading' ? Number(node.attrs.level) : null,
      isEmptyP: node.type.name === 'paragraph' && node.content.size === 0,
      index: $from.index(0),
      count: state.doc.childCount,
    })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const handler = () => updateBlockInfo()
    editor.on('selectionUpdate', handler)
    editor.on('transaction', handler)
    editor.on('focus', handler)
    const onScroll = () => updateBlockInfo()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    updateBlockInfo()
    return () => {
      editor.off('selectionUpdate', handler)
      editor.off('transaction', handler)
      editor.off('focus', handler)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [editor, updateBlockInfo])

  // Wire slash-command popup to React state.
  useEffect(() => {
    handlers.current = {
      onStart: (props) => {
        const items = props.items as BlockItem[]
        setSlash({
          open: true,
          rect: props.clientRect ? props.clientRect() : null,
          items,
          selectedIndex: 0,
          command: props.command as unknown as (item: BlockItem) => void,
          range: { from: props.range.from, to: props.range.to },
        })
      },
      onUpdate: (props) => {
        const items = props.items as BlockItem[]
        setSlash((s) => ({
          open: true,
          rect: props.clientRect ? props.clientRect() : s.rect,
          items,
          selectedIndex: Math.min(s.selectedIndex, Math.max(0, items.length - 1)),
          command: props.command as unknown as (item: BlockItem) => void,
          range: { from: props.range.from, to: props.range.to },
        }))
      },
      onKeyDown: ({ event, range }) => {
        const st = slashRef.current
        if (!st.open) return false
        if (event.key === 'ArrowDown') {
          setSlash((s) => ({ ...s, selectedIndex: Math.min(s.selectedIndex + 1, s.items.length - 1) }))
          return true
        }
        if (event.key === 'ArrowUp') {
          setSlash((s) => ({ ...s, selectedIndex: Math.max(s.selectedIndex - 1, 0) }))
          return true
        }
        if (event.key === 'Enter') {
          const item = st.items[st.selectedIndex]
          if (item && st.command) st.command(item)
          return true
        }
        if (event.key === 'Escape') {
          editor?.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
          setSlash(INITIAL_SLASH)
          return true
        }
        return false
      },
      onExit: () => setSlash(INITIAL_SLASH),
    }
  }, [editor])

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  if (!editor) {
    return <div className="skeleton min-h-[420px] rounded-lg" />
  }

  const plusRect = block?.el
    ? {
        left: Math.max(8, block.el.getBoundingClientRect().left - 44),
        top:
          block.el.getBoundingClientRect().top +
          block.el.getBoundingClientRect().height / 2 -
          14,
      }
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={plain ? 'relative overflow-visible' : 'overflow-hidden rounded-lg border border-border bg-card transition-colors focus-within:border-accent/50'}
    >
      {plain ? (
        <div className="rounded-t-lg border-b border-border bg-card px-3 py-1">
          <p className="py-1 text-xs text-muted-foreground">
            输入 <kbd className="rounded border border-border bg-muted px-1">/</kbd> 插入区块，点击区块可编辑
          </p>
        </div>
      ) : null}

      {/* Gutenberg-style floating block toolbar */}
      {focused && block && !slash.open && (
        <BlockToolbar editor={editor} block={block} openPrompt={openPrompt} />
      )}

      {/* Insert button on the left of an empty block */}
      {focused && block?.isEmptyP && !slash.open && plusRect && (
        <button
          type="button"
          title="插入区块"
          style={{ position: 'fixed', left: plusRect.left, top: plusRect.top, zIndex: 60 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPlusOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-lg leading-none text-muted-foreground shadow-sm transition-colors hover:border-accent/50 hover:text-accent"
        >
          +
        </button>
      )}

      {/* Slash-command picker */}
      {slash.open && slash.rect && (
        <BlockPicker
          rect={{ left: slash.rect.left, top: slash.rect.bottom + 6 }}
          items={slash.items}
          selectedIndex={slash.selectedIndex}
          onHover={(i) => setSlash((s) => ({ ...s, selectedIndex: i }))}
          onPick={(item) => {
            if (slash.command) slash.command(item)
            setSlash(INITIAL_SLASH)
          }}
        />
      )}

      {/* Plus-button picker */}
      {plusOpen && plusRect && (
        <BlockPicker
          rect={{ left: plusRect.left + 40, top: plusRect.top - 10 }}
          items={BLOCK_ITEMS}
          selectedIndex={0}
          onHover={() => undefined}
          onPick={(item) => {
            const { state } = editor
            const { from, to } = state.selection
            item.command({ editor, range: { from, to } })
            setPlusOpen(false)
          }}
        />
      )}

      <EditorContent editor={editor} />

      {/* Styled prompt dialog */}
      <AnimatePresence>
        {dialog && (
          <motion.div
            key="dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeDialog(null)
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-[420px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/25"
              role="dialog"
              aria-modal="true"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  confirmDialog()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeDialog(null)
                }
              }}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <p className="text-sm font-semibold">{dialog.title}</p>
                <button
                  type="button"
                  onClick={() => closeDialog(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2 px-5 py-5">
                <label className="text-sm font-medium">{dialog.label}</label>
                <input
                  ref={dialogRef}
                  type="text"
                  defaultValue={dialog.defaultValue ?? ''}
                  placeholder={dialog.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      closeDialog(null)
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                {dialog.hint && <p className="text-xs text-muted-foreground">{dialog.hint}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => closeDialog(null)}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  取消
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={confirmDialog}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-md shadow-accent/25"
                >
                  {dialog.confirmText ?? '确定'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
