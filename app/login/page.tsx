'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'

export default function LoginPage() {
  const { login, user } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (user) router.replace('/dashboard') }, [user, router])
  if (user) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-bg-card p-6 sm:p-8 shadow-xl"
      >
        <div className="space-y-1 text-center">
          <h2 className="font-heading text-2xl">Sign In</h2>
          <p className="text-sm text-text-muted">Welcome back to TabsPro</p>
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

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-secondary">Password</span>
          <input
            type="password" required minLength={6} autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
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
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-bg-card px-2 text-text-muted">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.location.href = '/api/auth/google'}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-all duration-200 hover:bg-bg-card-hover cursor-pointer"
        >
          Sign in with Google
        </button>

        <p className="text-center text-sm text-text-muted">
          <Link href="/forgot-password" className="text-accent hover:text-accent-hover transition-colors">Forgot password?</Link>
        </p>
        <p className="text-center text-sm text-text-muted">
          No account?{' '}
          <Link href="/register" className="text-accent hover:text-accent-hover transition-colors font-medium">Register</Link>
        </p>
      </form>
    </div>
  )
}
