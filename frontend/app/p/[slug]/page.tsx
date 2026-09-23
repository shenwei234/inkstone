import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { StaticPageDetail } from './page-detail'
import { fetchPageBySlug } from '@/lib/api'

// 服务端预取独立页，首屏直出内容
export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next 传入的 params.slug 是 URL 编码的，需解码（fetchPageBySlug 内部会再编码一次）
  let slug = (await params).slug
  try {
    slug = decodeURIComponent(slug)
  } catch {
    /* 保留原始值 */
  }

  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: ['page', slug],
    queryFn: () => fetchPageBySlug(slug),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StaticPageDetail slug={slug} />
    </HydrationBoundary>
  )
}
