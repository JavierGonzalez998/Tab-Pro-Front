'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-sm space-y-4 text-center rounded-xl border border-border bg-bg-card p-8 shadow-xl">
          <div className="mx-auto w-12 h-12 rounded-full bg-cta-soft flex items-center justify-center">
            <svg className="w-6 h-6 text-cta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-heading text-xl">Check your email</h2>
          <p className="text-sm text-text-muted">
            If an account exists for <span className="text-text-secondary font-medium">{email}</span>, a reset link has been sent.
          </p>
          <Link href="/login" className="inline-block text-sm text-accent hover:text-accent-hover transition-colors">Back to Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-bg-card p-6 sm:p-8 shadow-xl"
      >
        <div className="space-y-1 text-center">
          <h2 className="font-heading text-2xl">Forgot Password</h2>
          <p className="text-sm text-text-muted">Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        {error && (
          <p className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">{error}</p>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Email</span>
          <input
            type="email" required autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all duration-200"
          />
        </label>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-accent-glow"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>

        <p className="text-center text-sm text-text-muted">
          <Link href="/login" className="text-accent hover:text-accent-hover transition-colors">Back to Sign In</Link>
        </p>
      </form>
    </div>
  )
}
