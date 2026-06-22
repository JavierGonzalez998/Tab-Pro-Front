'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/providers'

export default function Navbar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  const linkClass = (href: string) =>
    `text-sm font-medium transition-colors duration-200 ${
      pathname === href
        ? 'text-accent'
        : 'text-text-secondary hover:text-text-primary'
    }`

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-heading text-xl tracking-tight text-text-primary hover:text-accent transition-colors duration-200"
        >
          TabsPro
        </Link>

        <div className="flex items-center gap-4 sm:gap-5 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className={linkClass('/dashboard')}>
                Dashboard
              </Link>
              <span className="hidden sm:inline text-text-muted text-xs px-2 py-1 rounded-full border border-border bg-bg-card">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="text-text-muted hover:text-danger transition-colors duration-200 cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass('/login')}>
                Sign In
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors duration-200 shadow-lg shadow-accent-glow"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
