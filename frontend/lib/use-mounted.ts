'use client'

import { useSyncExternalStore } from 'react'

/** 空订阅：挂载状态不会变化，只在挂载后读一次 */
const subscribeNoop = () => () => {}

/**
 * hydration 安全的「是否已挂载」判断。
 * SSR 与客户端首帧均为 false，hydration 完成后切 true。
 * 用于只能客户端运行的能力（DOMParser 提取目录、createPortal 等），
 * 避免 SSR/hydration 差异，也避免 effect 内 setState 触发
 * react-hooks/set-state-in-effect 规则。
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}
