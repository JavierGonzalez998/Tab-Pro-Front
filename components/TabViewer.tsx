'use client'

import { useEffect, useRef, useState } from 'react'
import * as alphaTab from '@coderline/alphatab'

// ponytail: minimal AlphaTab wrapper, add track selector / zoom / playback if needed
export default function TabViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!containerRef.current) return
    setError('')

    try {
      const api = new alphaTab.AlphaTabApi(containerRef.current, {
        core: { engine: 'html5', fontDirectory: '/font/' },
        display: { layoutMode: 'page' },
      })

      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(data))
      api.renderScore(score, [0])

      return () => { api.destroy() }
    } catch (e: any) {
      setError(e.message || 'Failed to render tab')
    }
  }, [data])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-xl">
      {error && (
        <p className="p-4 text-sm text-danger border-b border-danger/20 bg-danger/10">{error}</p>
      )}
      <div ref={containerRef} className="at-wrap" style={{ colorScheme: 'only light' }} />
    </div>
  )
}
