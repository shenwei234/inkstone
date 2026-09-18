'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Eye, PenLine, Search, X } from 'lucide-react'
import { fetchArticles, fetchCategories, fetchTags } from '@/lib/api'
import type { Article, ArticleListResponse } from '@/lib/types'
import { PageTransition, StaggerList, StaggerItem, HoverLift } from '@/components/motion'
import { useSiteConfig } from '@/components/site-config-context'
import { WidgetRenderer } from '@/components/sidebar-widgets'

function ArticleCard({ article }: { article: Article }) {
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')

  const cover =
    article.cover ||
    (article.content.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? '')

  const excerpt = article.content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)

  return (
    <StaggerItem>
      <HoverLift>
        <Link href={`/posts/${article.slug}`} className="block h-full">
          <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10">
            {/* 封面大图 */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-accent/15 via-muted to-purple-500/15">
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={cover}
                  alt={article.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-4xl font-black text-accent/30">
                    {article.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* 分类角标 */}
              {article.category && (
                <span className="absolute left-4 top-4 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-accent shadow-sm backdrop-blur">
                  {article.category.name}
                </span>
              )}

              {/* 底部渐变遮罩，提升标题可读性 */}
              {cover && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
              )}
            </div>

            {/* 内容区 */}
            <div className="flex flex-1 flex-col p-6">
              <h2 className="text-xl font-bold leading-snug tracking-tight transition-colors group-hover:text-accent">
                {article.title}
              </h2>

              <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {excerpt}
              </p>

              {article.tags && article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {article.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* 底部元信息 */}
              <div className="mt-5 flex items-center gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                  {article.author.username.charAt(0).toUpperCase()}
                </span>
                <span className="font-medium text-foreground">{article.author.username}</span>
                <span className="opacity-40">·</span>
                <time dateTime={article.published_at ?? article.created_at}>{date}</time>
                <span className="ml-auto flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {article.views}
                </span>
              </div>
            </div>
          </article>
        </Link>
      </HoverLift>
    </StaggerItem>
  )
}
export default function HomePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <HomePage />
    </Suspense>
  )
}

function HomePage() {
  const searchParams = useSearchParams()
  const site = useSiteConfig()
  const category = searchParams.get('category') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const q = searchParams.get('q') ?? ''
  const widgets = site.widgets.filter((w) => w.type && w.title)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['articles', 'published', 1, category, tag, q],
    queryFn: () =>
      fetchArticles({
        page: 1,
        page_size: 20,
        category: category || undefined,
        tag: tag || undefined,
        q: q || undefined,
      }),
  })

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

    const hasFilter = Boolean(category || tag || q)

  return (
    <PageTransition>
      <div className={`mx-auto px-4 py-10 ${widgets.length > 0 ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {/* 列表标题 */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {category
              ? `分类：${categoriesQuery.data?.categories.find((c) => c.slug === category)?.name ?? category}`
              : tag
                ? `标签：${tagsQuery.data?.tags.find((t) => t.slug === tag)?.name ?? tag}`
                : q
                  ? `搜索：${q}`
                  : '最新文章'}
          </h1>
          <span className="text-sm font-normal text-muted-foreground">
            {data ? `${data.total} 篇` : ''}
          </span>
        </div>

        {widgets.length > 0 ? (
          <div
            className={`grid gap-8 ${
              site.sidebarPosition === 'left' ? 'lg:grid-cols-[280px_1fr]' : 'lg:grid-cols-[1fr_280px]'
            }`}
          >
            {site.sidebarPosition === 'left' ? (
              <>
                <aside className="h-fit space-y-4 lg:sticky lg:top-24">
                  {widgets.map((w, i) => (
                    <WidgetRenderer key={`${w.type}-${i}`} widget={w} />
                  ))}
                </aside>
                <div className="min-w-0">
                  <ArticleListSection
                    isLoading={isLoading}
                    isError={isError}
                    error={error}
                    data={data}
                    hasFilter={hasFilter}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <ArticleListSection
                    isLoading={isLoading}
                    isError={isError}
                    error={error}
                    data={data}
                    hasFilter={hasFilter}
                  />
                </div>
                <aside className="h-fit space-y-4 lg:sticky lg:top-24">
                  {widgets.map((w, i) => (
                    <WidgetRenderer key={`${w.type}-${i}`} widget={w} />
                  ))}
                </aside>
              </>
            )}
          </div>
        ) : (
          <ArticleListSection
            isLoading={isLoading}
            isError={isError}
            error={error}
            data={data}
            hasFilter={hasFilter}
          />
        )}
      </div>
    </PageTransition>
  )
}

function ArticleListSection({
  isLoading,
  isError,
  error,
  data,
  hasFilter,
}: {
  isLoading: boolean
  isError: boolean
  error: Error | null
  data?: ArticleListResponse
  hasFilter: boolean
}) {
  return isLoading ? (
    <div className="grid gap-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="skeleton h-40 rounded-xl"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  ) : isError ? (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/30"
    >
      <p className="font-medium text-red-700 dark:text-red-300">加载失败</p>
      <p className="mt-1 text-sm text-red-600/70 dark:text-red-400/70">
        {error instanceof Error ? error.message : '请确认后端服务已启动'}
      </p>
    </motion.div>
  ) : data && data.articles.length > 0 ? (
    <StaggerList className="grid gap-6 sm:grid-cols-2">
      {data.articles.map((article: Article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </StaggerList>
  ) : (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-dashed p-16 text-center"
    >
      {hasFilter ? (
        <>
          <Search className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">没有符合条件的文章</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent underline underline-offset-4"
          >
            <X className="h-3.5 w-3.5" /> 清除筛选
          </Link>
        </>
      ) : (
        <>
          <PenLine className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">还没有文章，来发布第一篇吧</p>
          <Link
            href="/admin/articles/new"
            className="mt-6 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105"
          >
            写文章
          </Link>
        </>
      )}
    </motion.div>
  )
}
