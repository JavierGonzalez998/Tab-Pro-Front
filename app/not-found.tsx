import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center space-y-4 rounded-xl border border-border bg-bg-card p-8 shadow-xl">
        <div className="font-heading text-6xl text-text-muted">404</div>
        <h2 className="font-heading text-xl">Page not found</h2>
        <p className="text-sm text-text-muted">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent-glow"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}
