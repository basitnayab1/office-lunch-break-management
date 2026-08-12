'use client';

import Link from 'next/link';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-white">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
          <h1 className="mb-4 text-4xl font-semibold">Something went wrong</h1>
          <p className="mb-6 text-base text-neutral-300">{error?.message ?? 'An unexpected error occurred.'}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
