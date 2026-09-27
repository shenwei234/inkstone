import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 纯静态导出：`npm run build` 产物在 out/，可部署到 GitHub Pages / Vercel / 任意静态托管。
  // 部署到 GitHub Pages 子路径时取消下面注释并改为仓库名：
  // basePath: '/inkstone-update-hub',
  output: 'export',
  images: { unoptimized: true },
}

export default nextConfig
