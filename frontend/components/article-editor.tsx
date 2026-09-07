'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createArticle, fetchArticle, updateArticle, ApiError } from '@/lib/api'

function ArticleForm({
  articleId,
  initial,
}: {
  articleId?: number
  initial?: { title: string; content: string; status: string }
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (articleId) {
        return updateArticle(articleId, { title, content, status })
      }
      return createArticle({ title, content, status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['article', articleId] })
      router.push('/dashboard')
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : '保存失败，请稍后重试')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="文章标题"
        className="w-full rounded-md border bg-transparent px-4 py-3 text-lg font-semibold outline-none transition-colors focus:border-foreground/50"
      />

      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none"
        >
          <option value="draft">草稿</option>
          <option value="published">发布</option>
        </select>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {preview ? '编辑' : '预览'}
        </button>
      </div>

      {preview ? (
        <div className="min-h-[400px] rounded-md border p-6">
          <div className="prose prose-neutral dark:prose-invert max-w-none prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '*暂无内容*'}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <textarea
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="支持 Markdown 语法..."
          rows={20}
          className="w-full resize-y rounded-md border bg-transparent px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-foreground/50"
        />
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {mutation.isPending ? '保存中...' : articleId ? '保存修改' : '创建文章'}
      </button>
    </form>
  )
}

function Shell({ heading }: { heading: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          返回列表
        </Link>
      </div>
    </div>
  )
}

export function NewArticlePage() {
  return (
    <>
      <Shell heading="写文章" />
      <div className="mx-auto max-w-5xl px-4 pb-10">
        <ArticleForm />
      </div>
    </>
  )
}

export function EditArticlePage({ id }: { id: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['article', id],
    queryFn: () => fetchArticle(id),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center text-muted-foreground">
        文章不存在或无权访问
      </div>
    )
  }

  return (
    <>
      <Shell heading="编辑文章" />
      <div className="mx-auto max-w-5xl px-4 pb-10">
        <ArticleForm
          key={data.article.id}
          articleId={data.article.id}
          initial={{
            title: data.article.title,
            content: data.article.content,
            status: data.article.status,
          }}
        />
      </div>
    </>
  )
}
