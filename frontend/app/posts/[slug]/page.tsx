'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { fetchArticleBySlug } from '@/lib/api'
import { PageTransition } from '@/components/motion'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['article', 'slug', slug],
    queryFn: () => fetchArticleBySlug(slug),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="skeleton h-10 w-2/3 rounded-lg" />
        <div className="skeleton mt-4 h-4 w-40 rounded" />
        <div className="mt-10 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-4 rounded" style={{ width: `${95 - i * 7}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="mx-auto max-w-3xl px-4 py-24 text-center"
      >
        <div className="text-5xl">🔍</div>
        <h1 className="mt-6 text-2xl font-bold">文章不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : '请检查链接是否正确'}
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105"
        >
          返回首页
        </Link>
      </motion.div>
    )
  }

  const article = data.article
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('zh-CN')
    : new Date(article.created_at).toLocaleDateString('zh-CN')

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: easeOut }}
          className="mb-10 border-b border-border pb-8"
        >
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {article.title}
          </h1>
          <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 font-bold text-accent">
              {article.author.username.charAt(0).toUpperCase()}
            </span>
            <Link href="/" className="font-medium text-foreground hover:text-accent transition-colors">
              {article.author.username}
            </Link>
            <span>·</span>
            <time dateTime={article.published_at ?? article.created_at}>{date}</time>
          </div>
        </motion.header>

        <motion.article
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: easeOut }}
          className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl prose-blockquote:border-l-accent"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-16 border-t border-border pt-8"
        >
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span> 返回首页
          </Link>
        </motion.footer>
      </div>
    </PageTransition>
  )
}
