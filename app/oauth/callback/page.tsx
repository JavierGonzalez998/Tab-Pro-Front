'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const error = searchParams.get('error')

    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`)
    } else if (token) {
      localStorage.setItem('token', token)
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [searchParams, router])

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex items-center gap-3 text-text-muted">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Signing in...
      </div>
    </div>
  )
}
