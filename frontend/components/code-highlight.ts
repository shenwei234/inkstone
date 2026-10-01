'use client'

import { useEffect, useRef, type RefObject } from 'react'
import hljs from 'highlight.js/lib/common'

interface EnhanceOptions {
  /** 复制成功回调（接 toast 提示） */
  onCopySuccess?: () => void
  /** 复制失败回调（编辑器侧接 toast；文章页留空时按钮内显示「失败」） */
  onCopyError?: () => void
}

/**
 * 代码块增强（编辑器预览与文章正文共用）：给每个 `pre > code[class=language-x]`
 * 包上 wrapper + 头部（语言标签 + 复制按钮），并按 language-* 跑 hljs 高亮。
 *
 * 幂等：已包装的 pre 通过 `.md-codeblock` 祖先检测跳过；React 重建 innerHTML
 * 时包装与 dataset 一起失效，自动重新处理。无 language-* 或语言不在 common
 * 集时保持纯文本（language-text 走 plaintext 零着色，真未知语言完全不动）。
 *
 * 样式依赖 globals.css 的 .md-codeblock / .md-codeblock-header /
 * .md-codeblock-copy（已含 .prose 适配，文章页 prose 容器直接可用）。
 */
export function enhanceCodeBlocks(root: HTMLElement, opts: EnhanceOptions = {}) {
  root.querySelectorAll('pre').forEach((pre) => {
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
          opts.onCopySuccess?.()
        })
        .catch(() => {
          if (opts.onCopyError) {
            opts.onCopyError()
            return
          }
          copyBtn.textContent = '失败'
          window.setTimeout(() => (copyBtn.textContent = '复制'), 1500)
        })
    })
    header.append(label, copyBtn)
    wrapper.insertBefore(header, pre)

    // 高亮：有语言标注且 hljs 认识才跑（dataset 幂等）
    if (code && !code.dataset.mdHighlighted && lang && hljs.getLanguage(lang)) {
      code.dataset.mdHighlighted = '1'
      hljs.highlightElement(code)
    }
  })
}

/**
 * 文章/页面正文的代码块增强 hook：把 enhanceCodeBlocks 应用到 ref 容器，
 * html 变化（React 重建 innerHTML）时重新处理。
 *
 * opts 经 ref 透传（不进 effect 依赖）：调用方传内联回调也不会导致每次渲染
 * 重跑增强逻辑（幂等，但没必要）。
 */
export function useCodeHighlight(ref: RefObject<HTMLElement | null>, html: string, opts?: EnhanceOptions) {
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  }, [opts])
  useEffect(() => {
    if (ref.current) enhanceCodeBlocks(ref.current, optsRef.current)
  }, [ref, html])
}
