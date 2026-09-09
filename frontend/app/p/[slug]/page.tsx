'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { fetchPageBySlug } from '@/lib/api'
import { PageTransition } from '@/components/motion'
import { useSiteConfig } from '@/components/site-config-context'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const site = useSiteConfig()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => fetchPageBySlug(slug),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="skeleton h-10 w-2/3 rounded-lg" />
        <div className="mt-8 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-4 rounded" style={{ width: `${90 - i * 8}%` }} />
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
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <SearchX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">页面不存在</h1>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105"
        >
          返回首页
        </Link>
      </motion.div>
    )
  }

  const page = data.page

  // 自定义模板：整页 HTML，{{content}} 替换为页面内容
  if (page.template === 'landing') {
    const html = (page.content || '').replace(/\{\{content\}\}/g, page.content || '')
    return (
      <PageTransition>
        <div
          className="min-h-[60vh]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </PageTransition>
    )
  }

  // fullwidth：通栏无边框
  if (page.template === 'fullwidth') {
    return (
      <PageTransition>
        <div className="mx-auto max-w-6xl px-4 py-12">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: easeOut }}
            className="text-center text-4xl font-bold tracking-tight"
          >
            {page.title}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: easeOut }}
            className="prose prose-neutral dark:prose-invert mx-auto mt-10 max-w-none prose-headings:font-semibold prose-a:text-accent prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: page.content ?? "" }}
          />
        </div>
      </PageTransition>
    )
  }

  // default：常规文章式布局
  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: easeOut }}
          className="mb-8 border-b border-border pb-6"
        >
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {page.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{site.siteName}</p>
        </motion.header>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: easeOut }}
          className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-accent prose-pre:bg-muted prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: page.content ?? "" }}
        />
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
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
