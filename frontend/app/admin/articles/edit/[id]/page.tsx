'use client'

import { use } from 'react'
import { EditArticlePage } from '@/components/article-editor'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return <div className="mx-auto max-w-5xl px-4 py-20 text-center text-muted-foreground">无效的文章 ID</div>
  }
  return <EditArticlePage id={numericId} />
}
