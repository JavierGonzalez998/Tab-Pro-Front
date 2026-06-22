'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { api } from '@/lib/api'
import { formatSize } from '@/lib/utils'

interface Tab {
  id: string
  name: string
  originalName: string
  fileSize: number
  shared: boolean
  shareToken?: string
  createdAt: string
}

export default function DashboardPage() {
  const { token, user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [tabCount, setTabCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTabs = useCallback(async () => {
    if (!token) return
    try {
      const [me, list] = await Promise.all([
        api.get('/api/auth/me', token),
        api.get('/api/tabs', token),
      ])
      setTabCount(me.tabCount)
      setTabs(list)
    } catch { /* handled by auth redirect */ } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!authLoading && !token) router.replace('/login')
    else if (token) fetchTabs()
  }, [authLoading, token, router, fetchTabs])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post('/api/tabs', fd, token!)
      await fetchTabs()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      // ponytail: reset input value so re-selecting same file triggers onChange
      e.target.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tab?')) return
    try {
      await api.del(`/api/tabs/${id}`, token!)
      setTabs(t => t.filter(tab => tab.id !== id))
      setTabCount(c => c - 1)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleShare(id: string) {
    try {
      const data = await api.post(`/api/tabs/${id}/share`, {}, token!)
      setShareUrl(data.shareUrl)
      setTabs(t => t.map(tab => tab.id === id ? { ...tab, shared: true, shareToken: data.shareToken } : tab))
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await api.get(`/api/tabs/${id}/download`, token!)
      window.open(url, '_blank')
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (authLoading || !token) return null

  // ponytail: inline skeleton, no separate component unless reused elsewhere
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-bg-card" />
          <div className="h-4 w-64 rounded bg-bg-card" />
        </div>
        <div className="h-28 rounded-xl bg-bg-card" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-bg-card" />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          {user?.email} &mdash; {tabCount} tab{tabCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-danger/70 hover:text-danger transition-colors cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Share URL banner */}
      {shareUrl && (
        <div className="rounded-xl border border-cta/30 bg-cta-soft p-4">
          <p className="text-sm font-medium text-cta">Share link ready!</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 rounded-lg border border-cta/30 bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl!)}
              className="rounded-lg bg-cta px-4 py-2 text-sm font-medium text-white hover:bg-cta-hover transition-colors cursor-pointer"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Upload */}
      <label className="block rounded-xl border-2 border-dashed border-border hover:border-accent/50 transition-colors duration-200 p-6 text-center group cursor-pointer">
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-text-secondary">Uploading...</span>
          </div>
        ) : (
          <>
            <svg className="mx-auto w-8 h-8 text-text-muted group-hover:text-accent transition-colors mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-text-secondary">Drop a Guitar Pro file or click to browse</p>
            <p className="text-xs text-text-muted mt-1">.gp .gp3 .gp4 .gp5 .gpx</p>
          </>
        )}
        <input
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {/* Tab list */}
      <div className="space-y-2">
        {tabs.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-border bg-bg-card/50">
            <p className="text-text-muted text-sm">No tabs yet. Upload your first one above.</p>
          </div>
        ) : (
          tabs.map(tab => (
            <div
              key={tab.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-bg-card p-4 hover:bg-bg-card-hover hover:border-border-light transition-all duration-200 cursor-pointer group"
              onClick={() => router.push(`/tabs/${tab.id}`)}
            >
              <div className="min-w-0">
                <Link
                  href={`/tabs/${tab.id}`}
                  className="font-medium text-text-primary hover:text-accent transition-colors group-hover:text-accent"
                >
                  {tab.name}
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-text-muted">
                  <span>{tab.originalName}</span>
                  <span className="hidden sm:inline">&mdash;</span>
                  <span>{formatSize(tab.fileSize)}</span>
                  <span className="hidden sm:inline">&mdash;</span>
                  <span>{new Date(tab.createdAt).toLocaleDateString()}</span>
                  {tab.shared && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cta-soft text-cta text-xs font-medium">
                      Shared
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 text-sm shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleDownload(tab.id)}
                  className="rounded-lg px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-input transition-all cursor-pointer"
                >
                  Download
                </button>
                <button
                  onClick={() => handleShare(tab.id)}
                  className="rounded-lg px-3 py-1.5 text-cta hover:text-cta hover:bg-cta-soft transition-all cursor-pointer"
                >
                  Share
                </button>
                <button
                  onClick={() => handleDelete(tab.id)}
                  className="rounded-lg px-3 py-1.5 text-danger/70 hover:text-danger hover:bg-danger/5 transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
