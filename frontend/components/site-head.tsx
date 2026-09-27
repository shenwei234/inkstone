'use client'

import { useSiteConfig } from './site-config-context'

/**
 * 站点级 head metadata（浏览器标题 + 标签页图标）。
 *
 * 用 React 19 的 metadata hoist 渲染 <title> / <link rel="icon">：
 * 旧实现（site-config-context 里运行时 querySelector + appendChild 改 link.href）
 * 在 Next 16 / React 19 下会被 metadata 管理覆盖或清理，导致后台改了 favicon
 * 前台不生效；渲染进组件树由 React hoist 到 head 才是标准做法，
 * 配置变化时 React 会同步更新 href，清空自定义时回退默认图标。
 */
export function SiteHead() {
  const site = useSiteConfig()
  return (
    <>
      <title>{site.siteName || 'InkStone'}</title>
      <link rel="icon" href={site.siteFavicon || '/icon.svg'} />
    </>
  )
}
