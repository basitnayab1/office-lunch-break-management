import { Badge, Card } from "@/components/ui/card";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatOfficeDateTime, formatOfficeTime } from "@/lib/time/timezone";
import { formatMinutesDisplay } from "@/lib/utils";
import type { BreakSession } from "@/types/database";

export function BreakHistoryList({
  breaks,
  timezone,
}: {
  breaks: BreakSession[];
  timezone: string;
}) {
  if (breaks.length === 0) {
    return (
      <Card className="p-6 text-[var(--ink-muted)]">
        No previous break records yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] px-6 py-4">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Your recent breaks
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Start</th>
              <th className="px-4 py-3 font-medium">End</th>
              <th className="px-4 py-3 font-medium">Allowed</th>
              <th className="px-4 py-3 font-medium">Actual</th>
              <th className="px-4 py-3 font-medium">Extra</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {breaks.map((b) => (
              <tr key={b.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{b.break_date}</td>
                <td className="px-4 py-3">{breakTypeLabel(b.break_type)}</td>
                <td className="px-4 py-3">
                  {formatOfficeTime(b.started_at, timezone)}
                </td>
                <td className="px-4 py-3">
                  {b.ended_at ? formatOfficeTime(b.ended_at, timezone) : "—"}
                </td>
                <td className="px-4 py-3">{b.allowed_minutes} min</td>
                <td className="px-4 py-3">
                  {formatMinutesDisplay(b.actual_minutes)}
                </td>
                <td
                  className={`px-4 py-3 font-semibold ${
                    (b.extra_minutes ?? 0) > 0 ? "text-[var(--danger)]" : ""
                  }`}
                >
                  {(b.extra_minutes ?? 0) > 0
                    ? formatMinutesDisplay(b.extra_minutes)
                    : "0"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={b.status === "exceeded" ? "danger" : "ok"}>
                    {b.status === "exceeded" ? "Exceeded" : "Within Limit"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--line)] px-6 py-3 text-xs text-[var(--ink-muted)]">
        Times shown in {timezone}. Last updated{" "}
        {formatOfficeDateTime(new Date().toISOString(), timezone)}.
      </p>
    </Card>
  );
}
