'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatSize } from '@/lib/utils'
import dynamic from 'next/dynamic'

const TabViewer = dynamic(() => import('@/components/TabViewer'), { ssr: false })

interface Tab {
  id: string
  name: string
  originalName: string
  fileSize: number
  shared: boolean
  shareToken?: string
  createdAt: string
}

export default function SharedTabPage() {
  const { token } = useParams() as { token: string }
  const [tab, setTab] = useState<Tab | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const t = await api.get(`/api/shared/${token}`)
        setTab(t)

        const { url } = await api.get(`/api/shared/${token}/download`)
        const res = await fetch(url)
        if (res.ok) setFileData(await res.arrayBuffer())
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleDownload() {
    try {
      const { url } = await api.get(`/api/shared/${token}/download`)
      window.open(url, '_blank')
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-16 animate-pulse">
        <div className="h-8 w-96 rounded bg-bg-card" />
        <div className="h-4 w-64 rounded bg-bg-card" />
        <div className="h-96 rounded-xl bg-bg-card" />
      </div>
    )
  }
  if (error) return <div className="flex flex-1 items-center justify-center py-20"><p className="text-danger text-sm">{error}</p></div>
  if (!tab) return null

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      {/* Read-only badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-1.5 text-sm text-text-muted">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Read-only shared tab
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tight">{tab.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {tab.originalName} &mdash; {formatSize(tab.fileSize)} &mdash; shared on {new Date(tab.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-lg shadow-accent-glow"
        >
          Download
        </button>
      </div>

      {/* Viewer */}
      {fileData && <TabViewer data={fileData} />}

      {/* Footer */}
      <p className="text-center pt-8">
        <Link
          href="/"
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          TabsPro &mdash; Guitar Pro Tab Manager
        </Link>
      </p>
    </div>
  )
}
