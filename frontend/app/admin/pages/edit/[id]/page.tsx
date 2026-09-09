'use client'

import { use } from 'react'
import { EditPageScreen } from '@/components/page-admin'

export default function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground">
        无效的页面 ID
      </div>
    )
  }
  return <EditPageScreen id={numericId} />
}
