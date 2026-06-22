'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center space-y-4 rounded-xl border border-border bg-bg-card p-8 shadow-xl">
        <div className="mx-auto w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="font-heading text-xl">Something went wrong</h2>
        <p className="text-sm text-text-muted">{error.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => unstable_retry()}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-lg shadow-accent-glow"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
