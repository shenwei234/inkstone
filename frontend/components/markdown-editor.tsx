'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  CaseSensitive,
  ChevronDown,
  ChevronUp,
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
  ListTodo,
  ListTree,
  Maximize2,
  Minus,
  Minimize2,
  MoveVertical,
  PenLine,
  Quote,
  Regex,
  Replace,
  ReplaceAll,
  Save,
  Search,
  Strikethrough,
  Table as TableIcon,
  X,
} from 'lucide-react'
import hljs from 'highlight.js/lib/common'
import { uploadImage, ApiError } from '@/lib/api'
import { extractToc, markdownToHtml } from '@/lib/markdown'
import { useNotify } from '@/components/toast'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Ctrl/Cmd+S 时触发（替代浏览器「保存网页」） */
  onSaveRequest?: () => void
}

type Snippet = { text: string; selStart: number; selEnd: number }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function MarkdownEditor({ value, onChange, placeholder, onSaveRequest }: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const notify = useNotify()

  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [fullscreen, setFullscreen] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [syncScroll, setSyncScroll] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [activeToc, setActiveToc] = useState(0)

  // 查找替换面板
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [curMatch, setCurMatch] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  // 状态栏
  const [ln, setLn] = useState(1)
  const [col, setCol] = useState(1)
  const [selected, setSelected] = useState(0)

  const toc = useMemo(() => extractToc(value), [value])
  const lineCount = useMemo(() => value.split('\n').length, [value])

  /* ---------- 基础插入工具 ---------- */

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

  /* ---------- 图片上传（按钮 / 粘贴 / 拖拽共用） ---------- */

  const insertTextAtCursor = (text: string) => {
    const ta = taRef.current
    if (!ta) return
    apply(ta, () => ({ text, selStart: text.length, selEnd: text.length }))
  }

  const uploadImages = async (files: File[]) => {
    if (!files.length) return
    try {
      const urls: string[] = []
      for (const file of files) {
        urls.push(await uploadImage(file))
      }
      insertTextAtCursor(urls.map((u) => `![图片描述](${u})`).join('\n'))
      notify.success(`已插入 ${urls.length} 张图片`)
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : '图片上传失败')
    }
  }

  const insertImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) void uploadImages(files)
    }
    input.click()
  }

  /* ---------- 工具栏动作 ---------- */

  const insertLink = (ta: HTMLTextAreaElement | null) =>
    apply(ta, (sel) => {
      const text = `[${sel || '链接文字'}](https://)`
      return { text, selStart: text.length - 1, selEnd: text.length - 1 }
    })

  const insertTable = (ta: HTMLTextAreaElement | null) =>
    apply(ta, () => ({
      text: '\n| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
      selStart: 0,
      selEnd: 0,
    }))

  const insertTask = (ta: HTMLTextAreaElement | null) => prefixLines(ta, '- [ ] ', '待办事项')

  const tools: {
    icon: typeof Bold
    title: string
    shortcut?: string
    action: (ta: HTMLTextAreaElement | null) => void
  }[] = [
    { icon: Bold, title: '加粗', shortcut: 'Ctrl+B', action: (ta) => wrapInline(ta, '**', '加粗文字') },
    { icon: Italic, title: '斜体', shortcut: 'Ctrl+I', action: (ta) => wrapInline(ta, '*', '斜体文字') },
    { icon: Strikethrough, title: '删除线', shortcut: 'Ctrl+Shift+X', action: (ta) => wrapInline(ta, '~~', '删除线') },
    { icon: Heading1, title: '一级标题', action: (ta) => prefixLines(ta, '# ', '一级标题') },
    { icon: Heading2, title: '二级标题', action: (ta) => prefixLines(ta, '## ', '二级标题') },
    { icon: Heading3, title: '三级标题', action: (ta) => prefixLines(ta, '### ', '三级标题') },
    { icon: List, title: '无序列表', action: (ta) => prefixLines(ta, '- ', '列表项') },
    { icon: ListOrdered, title: '有序列表', action: (ta) => prefixLines(ta, '1. ', '列表项') },
    { icon: ListTodo, title: '任务列表', action: insertTask },
    { icon: TableIcon, title: '插入表格', action: insertTable },
    { icon: Quote, title: '引用', action: (ta) => prefixLines(ta, '> ', '引用内容') },
    { icon: Code, title: '行内代码', shortcut: 'Ctrl+K', action: (ta) => wrapInline(ta, '`', 'code') },
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
    { icon: ImageIcon, title: '上传图片（也可粘贴/拖入）', action: insertImage },
    { icon: Minus, title: '分割线', action: (ta) => apply(ta, () => ({ text: '\n---\n', selStart: 5, selEnd: 5 })) },
  ]

  /* ---------- 键盘快捷键与智能输入 ---------- */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current
    if (!ta) return
    if (e.nativeEvent.isComposing) return
    const mod = e.ctrlKey || e.metaKey
    const { selectionStart: s, selectionEnd: en } = ta

    // Ctrl/Cmd 组合键
    if (mod) {
      const k = e.key.toLowerCase()
      if (k === 'b') { e.preventDefault(); wrapInline(ta, '**', '加粗文字') }
      else if (k === 'i') { e.preventDefault(); wrapInline(ta, '*', '斜体文字') }
      else if (k === 'k') { e.preventDefault(); wrapInline(ta, '`', 'code') }
      else if (k === 'u') { e.preventDefault(); wrapInline(ta, '<u>', '下划线文字') }
      else if (e.shiftKey && k === 'x') { e.preventDefault(); wrapInline(ta, '~~', '删除线') }
      else if (k === 'f') { e.preventDefault(); setFindOpen(true); setCurMatch(0) }
      else if (k === 's') { e.preventDefault(); onSaveRequest?.() }
      return
    }

    // Tab / Shift+Tab 缩进
    if (e.key === 'Tab') {
      e.preventDefault()
      const lineStart = value.lastIndexOf('\n', Math.max(0, s - 1)) + 1
      if (s !== en || e.shiftKey) {
        const block = value.slice(lineStart, en)
        const shifted = e.shiftKey
          ? block.split('\n').map((l) => l.replace(/^ {1,2}/, '')).join('\n')
          : block.split('\n').map((l) => '  ' + l).join('\n')
        onChange(value.slice(0, lineStart) + shifted + value.slice(en))
        requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart + shifted.length))
      } else {
        onChange(value.slice(0, s) + '  ' + value.slice(en))
        requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2))
      }
      return
    }

    // Enter：自动续写列表 / 任务列表 / 引用
    if (e.key === 'Enter' && !e.shiftKey) {
      const lineStart = value.lastIndexOf('\n', Math.max(0, s - 1)) + 1
      const line = value.slice(lineStart, s)
      const m = line.match(/^(\s*)([-*+]|\d+\.)(\s+\[[ xX]\])?(\s+)(.*)$/)
      if (m) {
        const [, indent, marker, checkbox, , rest] = m
        e.preventDefault()
        if (!rest.trim()) {
          // 空列表项：结束列表，同时清掉该行标记
          const before = value.slice(0, lineStart)
          onChange(before + value.slice(s))
          requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart))
          return
        }
        const nextMarker = /^\d+\.$/.test(marker) ? `${Number(marker.slice(0, -1)) + 1}.` : marker
        const insert = `\n${indent}${nextMarker}${checkbox ? ' [ ]' : ''} `
        onChange(value.slice(0, s) + insert + value.slice(s))
        requestAnimationFrame(() => ta.setSelectionRange(s + insert.length, s + insert.length))
      }
      return
    }

    // 行首输入 `#`/`>`/`-`/`1.` 后按空格：自动补全为语法格式
    if (e.key === ' ') {
      const lineStart = value.lastIndexOf('\n', Math.max(0, s - 1)) + 1
      const before = value.slice(lineStart, s)
      if (/^(#{1,6}|>|[-*+]|\d+\.)$/.test(before)) {
        e.preventDefault()
        const insert = `${before} `
        onChange(value.slice(0, lineStart) + insert + value.slice(s))
        requestAnimationFrame(() => ta.setSelectionRange(lineStart + insert.length, lineStart + insert.length))
      }
    }
  }

  /* ---------- 粘贴 / 拖拽上传 ---------- */

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    void uploadImages(files)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const images = files.filter((f) => f.type.startsWith('image/'))
    const mdFile = files.find((f) => f.name.endsWith('.md') || f.type === 'text/markdown')
    if (images.length) {
      void uploadImages(images)
      return
    }
    if (mdFile) {
      try {
        insertTextAtCursor(await mdFile.text())
        notify.success('已插入 Markdown 文件内容')
      } catch {
        notify.error('读取 Markdown 文件失败')
      }
    }
  }

  /* ---------- 预览后处理：语法高亮 / 代码块头 / 任务复选框 ---------- */

  useEffect(() => {
    const el = previewInnerRef.current
    if (!el) return
    el.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest('.md-codeblock')) return
      const code = pre.querySelector('code')
      const lang = code?.className.match(/language-([\w-]+)/)?.[1] ?? ''
      const wrapper = document.createElement('div')
      wrapper.className = 'md-codeblock'
      pre.parentNode?.insertBefore(wrapper, pre)
      wrapper.appendChild(pre)

      const header = document.createElement('div')
      header.className = 'md-codeblock-header'
      const label = document.createElement('span')
      label.textContent = lang || '文本'
      const copyBtn = document.createElement('button')
      copyBtn.type = 'button'
      copyBtn.className = 'md-codeblock-copy'
      copyBtn.textContent = '复制'
      copyBtn.addEventListener('click', () => {
        navigator.clipboard
          .writeText(code?.textContent ?? '')
          .then(() => {
            copyBtn.textContent = '已复制'
            window.setTimeout(() => (copyBtn.textContent = '复制'), 1500)
          })
          .catch(() => notify.error('复制失败'))
      })
      header.append(label, copyBtn)
      wrapper.insertBefore(header, pre)

      if (code && !code.dataset.mdHighlighted && lang && hljs.getLanguage(lang)) {
        code.dataset.mdHighlighted = '1'
        hljs.highlightElement(code)
      }
    })
    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
      cb.removeAttribute('disabled')
      cb.classList.add('md-task-checkbox')
    })
  }, [value, notify])

  // 预览区点击复选框：反向更新 Markdown 源文（事件委托，innerHTML 重建后仍有效）
  useEffect(() => {
    const el = previewInnerRef.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || target.tagName !== 'INPUT') return
      const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      const idx = boxes.indexOf(target as HTMLInputElement)
      if (idx < 0) return
      const re = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/
      let seen = -1
      const lines = value.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re)
        if (!m) continue
        if (++seen === idx) {
          lines[i] = lines[i].replace(re, `$1${m[2] === ' ' ? 'x' : ' '}$3`)
          onChange(lines.join('\n'))
          return
        }
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [value, onChange])

  /* ---------- 滚动同步 ---------- */

  const doSyncScroll = (from: 'edit' | 'preview') => {
    if (!syncScroll || syncingRef.current) return
    const a = from === 'edit' ? taRef.current : previewRef.current
    const b = from === 'edit' ? previewRef.current : taRef.current
    if (!a || !b) return
    syncingRef.current = true
    const aMax = a.scrollHeight - a.clientHeight
    const bMax = b.scrollHeight - b.clientHeight
    b.scrollTop = aMax > 0 ? (a.scrollTop / aMax) * bMax : 0
    requestAnimationFrame(() => (syncingRef.current = false))
  }

  const onEditScroll = () => {
    doSyncScroll('edit')
    const ta = taRef.current
    if (!ta || !toc.length) return
    const max = ta.scrollHeight - ta.clientHeight
    const ratio = max > 0 ? ta.scrollTop / max : 0
    const charAt = ratio * value.length
    let idx = 0
    for (let i = 0; i < toc.length; i++) if (toc[i].offset <= charAt) idx = i
    setActiveToc(idx)
  }

  /* ---------- 光标位置 / 状态栏 ---------- */

  const updateCursor = () => {
    const ta = taRef.current
    if (!ta) return
    const upto = ta.value.slice(0, ta.selectionStart)
    const lines = upto.split('\n')
    setLn(lines.length)
    setCol(lines[lines.length - 1].length + 1)
    setSelected(ta.selectionEnd - ta.selectionStart)
  }

  /* ---------- TOC 跳转 ---------- */

  const jumpToOffset = (offset: number) => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(offset, offset)
    const line = value.slice(0, offset).split('\n').length
    const lh = ta.scrollHeight / Math.max(1, lineCount)
    ta.scrollTop = Math.max(0, (line - 3) * lh)
    if (previewRef.current) {
      const p = previewRef.current
      p.scrollTop = (line / Math.max(1, lineCount)) * (p.scrollHeight - p.clientHeight)
    }
  }

  /* ---------- 查找替换 ---------- */

  const findMatches = useMemo<[number, number][]>(() => {
    if (!findOpen || !findText) return []
    try {
      const re = new RegExp(useRegex ? findText : escapeRegExp(findText), caseSensitive ? 'g' : 'gi')
      const out: [number, number][] = []
      let m: RegExpExecArray | null
      while ((m = re.exec(value)) !== null) {
        out.push([m.index, m.index + m[0].length])
        if (m[0].length === 0) re.lastIndex++
      }
      return out
    } catch {
      return []
    }
  }, [value, findText, caseSensitive, useRegex, findOpen])

  useEffect(() => {
    if (findOpen) findInputRef.current?.focus()
  }, [findOpen])

  const closeFind = () => {
    setFindOpen(false)
    setFindText('')
  }

  const jumpToMatch = (i: number) => {
    const m = findMatches[i]
    if (!m) return
    setCurMatch(i)
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(m[0], m[1])
    const line = value.slice(0, m[0]).split('\n').length
    const lh = ta.scrollHeight / Math.max(1, lineCount)
    ta.scrollTop = Math.max(0, (line - 3) * lh)
  }

  const replaceCurrent = () => {
    const m = findMatches[curMatch]
    if (!m) return
    onChange(value.slice(0, m[0]) + replaceText + value.slice(m[1]))
    requestAnimationFrame(() => {
      const pos = m[0] + replaceText.length
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  const replaceAll = () => {
    if (!findMatches.length) return
    let out = ''
    let last = 0
    for (const [s, e] of findMatches) {
      out += value.slice(last, s) + replaceText
      last = e
    }
    out += value.slice(last)
    onChange(out)
    notify.success(`已替换 ${findMatches.length} 处`)
  }

  /* ---------- 全屏 ---------- */

  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (findOpen) closeFind()
        else setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onEsc)
    }
  }, [fullscreen, findOpen])

  /* ---------- 布局 ---------- */

  const bodyGrid = showToc
    ? 'xl:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]'
    : 'lg:grid-cols-2'

  return (
    <div
      className={`flex flex-col overflow-hidden bg-background ${
        fullscreen ? 'fixed inset-0 z-[100]' : 'relative rounded-xl border border-border'
      } ${dragging ? 'md-dropzone-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.shortcut ? `${t.title}（${t.shortcut}）` : t.title}
            onClick={() => t.action(taRef.current)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-accent"
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <ToolToggle
            active={showToc}
            title="目录大纲"
            onClick={() => setShowToc((v) => !v)}
            icon={<ListTree className="h-4 w-4" />}
          />
          <ToolToggle
            active={syncScroll}
            title="滚动同步"
            onClick={() => setSyncScroll((v) => !v)}
            icon={<MoveVertical className="h-4 w-4" />}
          />
          <ToolToggle
            active={findOpen}
            title="查找替换（Ctrl+F）"
            onClick={() => setFindOpen((v) => !v)}
            icon={<Search className="h-4 w-4" />}
          />
          <ToolToggle
            active={onSaveRequest ? true : false}
            title="保存（Ctrl+S）"
            onClick={() => onSaveRequest?.()}
            icon={<Save className="h-4 w-4" />}
            hidden={!onSaveRequest}
          />
          <ToolToggle
            active={fullscreen}
            title={fullscreen ? '退出全屏（Esc）' : '全屏专注写作'}
            onClick={() => setFullscreen((v) => !v)}
            icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          />
          <div className="ml-1 flex items-center gap-1 lg:hidden">
            <TabButton active={tab === 'write'} onClick={() => setTab('write')} icon={<PenLine className="h-3.5 w-3.5" />} label="编辑" />
            <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye className="h-3.5 w-3.5" />} label="预览" />
          </div>
        </div>
      </div>

      {/* 查找替换面板 */}
      {findOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1.5 text-xs">
          <input
            ref={findInputRef}
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value)
              setCurMatch(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                jumpToMatch((curMatch + (e.shiftKey ? -1 : 1) + findMatches.length) % Math.max(1, findMatches.length))
              }
            }}
            placeholder="查找内容"
            className="md-find-input w-36 rounded-md border border-border bg-background px-2 py-1 outline-none"
          />
          <span className="shrink-0 text-muted-foreground">
            {findMatches.length ? `${Math.min(curMatch + 1, findMatches.length)}/${findMatches.length}` : '无结果'}
          </span>
          <SmallIconButton title="上一个（Shift+Enter）" onClick={() => jumpToMatch((curMatch - 1 + findMatches.length) % Math.max(1, findMatches.length))} icon={<ChevronUp className="h-3.5 w-3.5" />} />
          <SmallIconButton title="下一个（Enter）" onClick={() => jumpToMatch((curMatch + 1) % Math.max(1, findMatches.length))} icon={<ChevronDown className="h-3.5 w-3.5" />} />
          <span className="mx-1 h-4 w-px bg-border" />
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="替换为"
            className="md-find-input w-36 rounded-md border border-border bg-background px-2 py-1 outline-none"
          />
          <SmallIconButton title="替换当前项" onClick={replaceCurrent} icon={<Replace className="h-3.5 w-3.5" />} />
          <SmallIconButton title="全部替换" onClick={replaceAll} icon={<ReplaceAll className="h-3.5 w-3.5" />} />
          <span className="mx-1 h-4 w-px bg-border" />
          <SmallIconButton title="区分大小写" active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} icon={<CaseSensitive className="h-3.5 w-3.5" />} />
          <SmallIconButton title="正则表达式" active={useRegex} onClick={() => setUseRegex((v) => !v)} icon={<Regex className="h-3.5 w-3.5" />} />
          <button
            type="button"
            title="关闭查找"
            onClick={closeFind}
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 主体：TOC + 编辑 + 预览 */}
      <div className={`grid min-h-0 flex-1 ${bodyGrid}`}>
        {showToc && (
          <div className="absolute inset-y-0 left-0 z-10 w-56 overflow-y-auto border-r border-border bg-card p-3 text-sm xl:static xl:z-auto">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ListTree className="h-3.5 w-3.5" /> 目录
              </span>
              <button type="button" onClick={() => setShowToc(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground xl:hidden">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {toc.length === 0 && <p className="text-xs text-muted-foreground">用 # 标题生成目录</p>}
            {toc.map((h, i) => (
              <button
                key={`${h.offset}-${i}`}
                type="button"
                onClick={() => jumpToOffset(h.offset)}
                style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                className={`md-toc-link block w-full truncate rounded px-1.5 py-1 text-left text-xs transition-colors hover:text-accent ${
                  activeToc === i ? 'active' : 'text-muted-foreground'
                }`}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}

        {/* 编辑区 */}
        <div className={`min-h-0 min-w-0 ${tab === 'write' ? '' : 'hidden lg:block'} ${fullscreen ? 'h-full' : ''}`}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onScroll={onEditScroll}
            onSelect={updateCursor}
            onKeyUp={updateCursor}
            onClick={updateCursor}
            spellCheck={false}
            placeholder={
              placeholder ??
              '用 Markdown 开始写作…\n\n# 标题  **加粗**  `代码`\n- 列表项  - [ ] 待办\n> 引用  | 表格 |\n\n图片可直接粘贴或拖入（Ctrl+S 保存，Ctrl+F 查找）'
            }
            className={`w-full resize-none bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none ${
              fullscreen ? 'h-full' : 'h-[60vh] min-h-[380px] lg:h-[68vh]'
            }`}
          />
        </div>

        {/* 预览区 */}
        <div
          className={`min-h-0 min-w-0 border-t border-border lg:border-t-0 lg:border-l ${
            tab === 'preview' ? '' : 'hidden lg:block'
          } ${fullscreen ? 'h-full' : ''}`}
        >
          <div
            ref={previewRef}
            onScroll={() => doSyncScroll('preview')}
            className={`prose prose-neutral dark:prose-invert max-w-none overflow-y-auto px-4 py-4 prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-img:rounded-xl ${
              fullscreen ? 'h-full' : 'h-[60vh] min-h-[380px] lg:h-[68vh]'
            }`}
          >
            <div ref={previewInnerRef}>
              {value.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
              ) : (
                <p className="text-muted-foreground">预览会显示在这里…</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1 text-[11px] text-muted-foreground">
        <span>
          Ln {ln}, Col {col}
          {selected > 0 && ` · 选中 ${selected} 字`}
        </span>
        <span className="truncate">
          {lineCount} 行 · {value.length} 字符 · {toc.length} 个标题
        </span>
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

function ToolToggle({
  active,
  title,
  onClick,
  icon,
  hidden,
}: {
  active: boolean
  title: string
  onClick: () => void
  icon: React.ReactNode
  hidden?: boolean
}) {
  if (hidden) return null
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-background hover:text-accent'
      }`}
    >
      {icon}
    </button>
  )
}

function SmallIconButton({
  title,
  onClick,
  icon,
  active,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`shrink-0 rounded-md p-1 transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-background hover:text-foreground'
      }`}
    >
      {icon}
    </button>
  )
}
