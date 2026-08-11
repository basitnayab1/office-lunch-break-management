import { BREAK_TYPE_OPTIONS } from "@/lib/breaks/types";

/** Compact dashboard preview for device mockups on the login hero. */
export function DashboardPreview({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={`h-full w-full overflow-hidden bg-[#f4f1ea] text-[var(--ink)] ${
        compact ? "p-2 text-[6px]" : "p-3 text-[8px]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold tracking-wide text-[var(--brand)]">
            Bite Station
          </p>
          <p
            className={`mt-0.5 font-[family-name:var(--font-display)] font-semibold ${
              compact ? "text-[8px]" : "text-[11px]"
            }`}
          >
            Welcome, Ali
          </p>
        </div>
        <span className="rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 font-medium text-[var(--brand-dark)]">
          Ready
        </span>
      </div>

      <p className={`mt-2 text-[var(--ink-muted)] ${compact ? "text-[5px]" : ""}`}>
        Select a break type to begin
      </p>

      <div className={`mt-2 grid grid-cols-3 ${compact ? "gap-1" : "gap-1.5"}`}>
        {BREAK_TYPE_OPTIONS.map((option) => (
          <div
            key={option.type}
            className={`rounded-md border border-[var(--line)] bg-white ${
              compact ? "p-1" : "p-1.5"
            } ${option.type === "lunch" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : ""}`}
          >
            <p className="font-semibold text-[var(--brand)]">{option.label}</p>
            <p className={`font-semibold ${compact ? "text-[7px]" : "text-[9px]"}`}>
              {option.minutes}m
            </p>
          </div>
        ))}
      </div>

      <div
        className={`mt-2 flex items-center justify-center rounded-md bg-[var(--brand)] font-semibold text-white ${
          compact ? "h-4 text-[6px]" : "h-6 text-[8px]"
        }`}
      >
        START BREAK
      </div>

      {!compact ? (
        <div className="mt-2 rounded-md border border-[var(--line)] bg-white p-1.5">
          <p className="font-medium text-[var(--ink-muted)]">Recent</p>
          <div className="mt-1 flex justify-between">
            <span>Lunch</span>
            <span className="text-[var(--ok)]">Within Limit</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span>Coffee</span>
            <span className="text-[var(--ok)]">Within Limit</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
