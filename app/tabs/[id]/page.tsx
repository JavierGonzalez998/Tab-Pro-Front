'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { api } from '@/lib/api'
import { formatSize } from '@/lib/utils'
import dynamic from 'next/dynamic'

const TabEditor = dynamic(() => import('@/components/TabEditor'), { ssr: false })

interface Tab {
  id: string
  name: string
  originalName: string
  fileSize: number
  shared: boolean
  shareToken?: string
  createdAt: string
}

export default function TabDetailPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const { token, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !token) { router.replace('/login'); return }
    if (!token || !id) return

    async function load() {
      try {
        const t = await api.get(`/api/tabs/${id}`, token!)
        setTab(t)
        const { url: presignUrl } = await api.get(`/api/tabs/${id}/download`, token!)
        const res = await fetch(presignUrl)
        if (!res.ok) throw new Error('Failed to load file')
        setFileData(await res.arrayBuffer())
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, token, authLoading, router])

  async function handleDelete() {
    if (!confirm('Delete this tab?')) return
    try {
      await api.del(`/api/tabs/${id}`, token!)
      router.push('/dashboard')
    } catch (err: any) { setError(err.message) }
  }

  async function handleShare() {
    try {
      const data = await api.post(`/api/tabs/${id}/share`, {}, token!)
      await navigator.clipboard.writeText(data.shareUrl)
      alert('Share link copied!')
    } catch (err: any) { setError(err.message) }
  }

  async function handleDownload() {
    try {
      const { url } = await api.get(`/api/tabs/${id}/download`, token!)
      window.open(url, '_blank')
    } catch (err: any) { setError(err.message) }
  }

  async function handleSave(data: Uint8Array, filename: string) {
    if (!token) return
    const fd = new FormData()
    fd.append('file', new Blob([data as BlobPart]), filename)
    await api.putForm(`/api/tabs/${id}`, fd, token!)
  }

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 animate-pulse">
        <div className="h-4 w-36 rounded bg-bg-card" />
        <div className="space-y-2">
          <div className="h-8 w-64 rounded bg-bg-card" />
          <div className="h-4 w-96 rounded bg-bg-card" />
        </div>
        <div className="h-96 rounded-xl bg-bg-card" />
      </div>
    )
  }
  if (error && !tab) return <div className="flex flex-1 items-center justify-center py-20"><p className="text-danger text-sm">{error}</p></div>
  if (!tab || !fileData) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">{tab.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {tab.originalName} &mdash; {formatSize(tab.fileSize)} &mdash; {new Date(tab.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-card hover:border-border-light transition-all cursor-pointer"
          >
            Download
          </button>
          <button
            onClick={handleShare}
            className="rounded-lg bg-cta px-4 py-2 text-sm font-medium text-white hover:bg-cta-hover transition-colors cursor-pointer shadow-lg shadow-cta-glow"
          >
            Share
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/20 transition-all cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Editor */}
      <TabEditor data={fileData} tabId={id} token={token!} onSave={handleSave} />
    </div>
  )
}
