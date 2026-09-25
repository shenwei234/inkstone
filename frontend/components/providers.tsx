'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { useState } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import { NotifyProvider } from '@/components/toast'
import { SiteConfigProvider } from '@/components/site-config-context'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {/* 尊重系统「减少动效」偏好：自动降级 framer-motion 的位移动画 */}
      <MotionConfig reducedMotion="user">
        <SiteConfigProvider>
          <AuthProvider>
            <NotifyProvider>{children}</NotifyProvider>
          </AuthProvider>
        </SiteConfigProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
