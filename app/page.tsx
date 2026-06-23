import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cloud Guitar Pro Tab Manager",
  description:
    "Upload, view, edit and share your Guitar Pro files (.gp, .gp3, .gp4, .gp5, .gpx) online. Built-in player, AlphaTex editor, MIDI export. Free to start — no credit card required.",
};

const features = [
  {
    title: "Multi-format Support",
    desc: "Upload .gp, .gp3, .gp4, .gp5 and .gpx files. TabsPro renders them instantly with full notation, tablature, and playback.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Built-in Player",
    desc: "Listen to your tabs with high-quality synthesis. Adjust playback speed from 0.25x to 2x and isolate individual tracks.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "AlphaTex Editor",
    desc: "Edit tabs with AlphaTex, a text-based notation format. Toggle between visual sheet music and raw notation in one click.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    title: "Share with Bandmates",
    desc: "Generate read-only share links. Your bandmates can view and download tabs without an account. One click, instant link.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
  },
  {
    title: "MIDI Export",
    desc: "Export any tab as a MIDI file. Use it in your DAW, notation software, or as a backing track for practice.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
  {
    title: "Cloud Storage",
    desc: "All your tabs stored securely in the cloud. Access them from any device, any browser. Never lose a tab again.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
  },
];

const steps = [
  {
    step: "1",
    title: "Upload",
    desc: "Drag and drop any Guitar Pro file. We support .gp through .gpx formats.",
  },
  {
    step: "2",
    title: "View & Edit",
    desc: "See your tabs rendered instantly. Play them back, edit in AlphaTex, or export to MIDI.",
  },
  {
    step: "3",
    title: "Share",
    desc: "Generate a read-only link. Send it to your bandmates. No account needed for them.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "TabsPro",
  description:
    "Upload, view, edit and share Guitar Pro tablatures from any browser. Cloud tab manager with built-in player, AlphaTex editor, MIDI export and share links.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Organization", name: "TabsPro" },
};

export default function Home() {
  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ───── Section 1: Hero ───── */}
      <section className="relative overflow-hidden">
        {/* Background image with overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{
              backgroundImage:
                'url(https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=1920&q=80)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/60 via-bg-primary/40 to-bg-primary" />
          <div className="absolute top-1/4 left-1/4 w-[32rem] h-[32rem] bg-accent-glow rounded-full blur-3xl opacity-20" />
          <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-cta-glow rounded-full blur-3xl opacity-10" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 py-28 sm:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-bg-card text-xs text-text-secondary font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-cta animate-pulse" />
            Guitar Pro tab management, reimagined
          </div>

          <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl leading-tight tracking-tight">
            Your tabs,{" "}
            <span className="text-accent">in the cloud</span>
          </h1>

          <p className="mx-auto max-w-xl mt-6 text-base sm:text-lg text-text-secondary leading-relaxed">
            Upload, view, edit and share your Guitar Pro tablatures from any
            browser. Built for musicians who want their library always
            accessible.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
            <Link
              href="/register"
              className="rounded-xl bg-accent px-8 py-3.5 font-semibold text-white hover:bg-accent-hover transition-all duration-200 shadow-lg shadow-accent-glow hover:shadow-xl hover:shadow-accent-glow"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-border px-8 py-3.5 font-medium text-text-primary hover:bg-bg-card hover:border-border-light transition-all duration-200"
            >
              Sign In
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-8 text-xs text-text-muted">
            <span className="px-3 py-1 rounded-full border border-border bg-bg-card">.GP</span>
            <span className="px-3 py-1 rounded-full border border-border bg-bg-card">.GP3</span>
            <span className="px-3 py-1 rounded-full border border-border bg-bg-card">.GP4</span>
            <span className="px-3 py-1 rounded-full border border-border bg-bg-card">.GP5</span>
            <span className="px-3 py-1 rounded-full border border-border bg-bg-card">.GPX</span>
            <span className="px-3 py-1 rounded-full border border-cta/30 bg-cta-soft text-cta">MIDI</span>
            <span className="px-3 py-1 rounded-full border border-accent/30 bg-accent-soft text-accent">Share</span>
          </div>
        </div>
      </section>

      {/* ───── Section 2: Features ───── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="text-center mb-14">
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight">
              Everything you need for your tab library
            </h2>
            <p className="mt-3 text-text-muted text-sm sm:text-base max-w-lg mx-auto">
              TabsPro is built for guitarists who want a clean, fast, and
              shareable way to manage their collection.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-bg-card p-6 hover:bg-bg-card-hover hover:border-border-light transition-all duration-200 cursor-default"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent-soft text-accent mb-4 group-hover:scale-110 transition-transform duration-200">
                  {f.icon}
                </div>
                <h3 className="font-heading text-lg tracking-tight mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Section 3: How it works ───── */}
      <section className="border-t border-border bg-bg-secondary/50">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:py-28">
          <div className="text-center mb-14">
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight">
              Three steps. That&apos;s it.
            </h2>
            <p className="mt-3 text-text-muted text-sm sm:text-base">
              From upload to sharing with your band in under a minute.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.step} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-8 left-[60%] w-[80%] h-px bg-border">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border-t border-r border-border" />
                  </div>
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-soft text-accent font-heading text-xl mb-5 shadow-lg shadow-accent-glow/30">
                  {s.step}
                </div>
                <h3 className="font-heading text-lg tracking-tight mb-2">
                  {s.title}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed max-w-xs mx-auto">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Section 4: CTA ───── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:py-28 text-center">
          <h2 className="font-heading text-3xl sm:text-4xl tracking-tight">
            Ready to organize your tabs?
          </h2>
          <p className="mt-3 text-text-muted text-sm sm:text-base">
            Free to start. No credit card required. Upload your first tab in
            seconds.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
            <Link
              href="/register"
              className="rounded-xl bg-cta px-8 py-3.5 font-semibold text-white hover:bg-cta-hover transition-all duration-200 shadow-lg shadow-cta-glow hover:shadow-xl hover:shadow-cta-glow"
            >
              Create Free Account
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-border px-8 py-3.5 font-medium text-text-primary hover:bg-bg-card hover:border-border-light transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-text-muted">
          <span className="font-heading text-sm text-text-secondary">TabsPro</span>
          <span className="mx-2">&mdash;</span>
          Guitar Pro Tab Manager. Built for musicians.
        </div>
      </footer>
    </div>
  );
}
