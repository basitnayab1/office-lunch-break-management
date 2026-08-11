import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
}) {
  const tones = {
    default: "bg-white",
    ok: "bg-[var(--ok-soft)]",
    warn: "bg-[var(--warn-soft)]",
    danger: "bg-[var(--danger-soft)]",
    brand: "bg-[var(--brand-soft)]",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] p-5 shadow-[var(--shadow)]",
        tones[tone]
      )}
    >
      <p className="text-sm text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "brand";
}) {
  const tones = {
    neutral: "bg-[#ece7dc] text-[var(--ink)]",
    ok: "bg-[var(--ok-soft)] text-[var(--ok)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    brand: "bg-[var(--brand-soft)] text-[var(--brand-dark)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
