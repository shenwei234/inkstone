'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { fetchArticles } from '@/lib/api'
import type { Article } from '@/lib/types'
import { PageTransition, StaggerList, StaggerItem, HoverLift } from '@/components/motion'

function ArticleCard({ article }: { article: Article }) {
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')

  return (
    <StaggerItem>
      <HoverLift>
        <Link href={`/posts/${article.slug}`} className="block">
          <article className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-accent/5">
            <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-accent to-purple-500 transition-transform duration-300 group-hover:scale-x-100" />
            <h2 className="text-lg font-semibold tracking-tight transition-colors group-hover:text-accent">
              {article.title}
            </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {article.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}
        </p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                {article.author.username.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium text-foreground">{article.author.username}</span>
              <span>·</span>
              <time dateTime={article.published_at ?? article.created_at}>{date}</time>
            </div>
          </article>
        </Link>
      </HoverLift>
    </StaggerItem>
  )
}

export default function HomePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['articles', 'published', 1],
    queryFn: () => fetchArticles({ page: 1, page_size: 10 }),
  })

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-12">
        {isLoading ? (
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
          <>
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 text-sm font-medium uppercase tracking-widest text-muted-foreground"
            >
              最新发布
            </motion.h2>
            <StaggerList className="grid gap-4">
              {data.articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </StaggerList>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-dashed p-16 text-center"
          >
            <div className="text-4xl">📝</div>
            <p className="mt-4 text-muted-foreground">还没有文章，来发布第一篇吧</p>
            <Link
              href="/admin/articles/new"
              className="mt-6 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105"
            >
              写文章
            </Link>
          </motion.div>
        )}
      </div>
    </PageTransition>
  )
}
