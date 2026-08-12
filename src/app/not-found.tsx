import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="mb-4 text-4xl font-semibold">Page not found</h1>
        <p className="mb-6 text-base text-neutral-300">The page you are looking for does not exist or has moved.</p>
        <Link
          href="/"
          className="rounded-md border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          Return to home
        </Link>
      </div>
    </main>
  );
}
