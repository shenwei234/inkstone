import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { HomeClient } from './home-client'
import { fetchArticles, fetchCategories, fetchTags } from '@/lib/api'

// 服务端预取文章列表 + 分类 + 标签，首屏直出（含当前筛选条件）
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const category = typeof sp.category === 'string' ? sp.category : null
  const tag = typeof sp.tag === 'string' ? sp.tag : null
  const q = typeof sp.q === 'string' ? sp.q : null

  const queryClient = new QueryClient()
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['articles', 'published', 1, category, tag, q],
      queryFn: () =>
        fetchArticles({
          page: 1,
          page_size: 20,
          category: category ?? undefined,
          tag: tag ?? undefined,
          q: q ?? undefined,
        }),
    }),
    queryClient.prefetchQuery({ queryKey: ['categories'], queryFn: fetchCategories }),
    queryClient.prefetchQuery({ queryKey: ['tags'], queryFn: fetchTags }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeClient category={category} tag={tag} q={q} />
    </HydrationBoundary>
  )
}
