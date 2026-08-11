import { BiteStationLogo } from "@/components/brand/bite-station-logo";

/** Instant branded shell while the login route streams. */
export default function LoginLoading() {
  return (
    <main className="min-h-screen bg-[var(--bg-elevated)] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
      <div className="hidden bg-[var(--bg)] md:block md:h-56 lg:min-h-screen" aria-hidden />
      <section className="relative flex min-h-[70vh] flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:min-h-screen lg:px-12">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <BiteStationLogo size={88} priority className="shrink-0" />
            <div>
              <p className="text-lg font-semibold tracking-wide text-[var(--brand)]">
                Bite Station
              </p>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                Eat · Relax · Recharge
              </p>
            </div>
          </div>
          <div className="h-10 w-48 animate-pulse rounded-lg bg-black/5" />
          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-black/5" />
          <div className="mt-8 space-y-4">
            <div className="h-12 animate-pulse rounded-xl bg-black/5" />
            <div className="h-12 animate-pulse rounded-xl bg-black/5" />
            <div className="h-12 animate-pulse rounded-xl bg-[var(--brand-soft)]" />
          </div>
        </div>
      </section>
    </main>
  );
}
