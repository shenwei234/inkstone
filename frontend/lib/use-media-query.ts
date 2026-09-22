'use client'

import { useEffect, useState } from 'react'

/**
 * 响应式媒体查询 hook。SSR 与首次客户端渲染都返回 false（避免 hydration 不一致），
 * 挂载后再同步真实值并监听变化。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
