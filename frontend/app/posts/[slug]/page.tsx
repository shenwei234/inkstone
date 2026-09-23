import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { PostDetail } from './post-detail'
import { fetchArticleBySlug } from '@/lib/api'

// 服务端预取文章，首屏直出正文（避免先骨架再客户端取数的等待）
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next 传入的 params.slug 是 URL 编码的，需解码（fetchArticleBySlug 内部会再编码一次）
  let slug = (await params).slug
  try {
    slug = decodeURIComponent(slug)
  } catch {
    /* 保留原始值 */
  }

  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: ['article', 'slug', slug],
    queryFn: () => fetchArticleBySlug(slug),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostDetail slug={slug} />
    </HydrationBoundary>
  )
}
