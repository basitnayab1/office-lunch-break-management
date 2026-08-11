"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { getActiveBreaks } from "@/actions/reports";
import { calculateBreakMetrics } from "@/lib/breaks/calculations";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatDuration, formatMinutesDisplay } from "@/lib/utils";
import { formatOfficeTime } from "@/lib/time/timezone";
import type { BreakSession } from "@/types/database";
import { Badge, Card } from "@/components/ui/card";

export function ActiveBreaksTable({
  initialBreaks,
  timezone,
}: {
  initialBreaks: BreakSession[];
  timezone: string;
}) {
  const [breaks, setBreaks] = useState(initialBreaks);
  const [nowMs, setNowMs] = useState(Date.now());
  const [, startTransition] = useTransition();

  useEffect(() => {
    setBreaks(initialBreaks);
  }, [initialBreaks]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const refresh = () => {
      startTransition(async () => {
        try {
          // Server action enforces requireAdmin — no admin data without auth.
          const data = await getActiveBreaks();
          setBreaks(data);
        } catch {
          setBreaks([]);
        }
      });
    };

    const channel = supabase
      .channel("admin-active-breaks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "break_sessions" },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const rows = useMemo(() => {
    return breaks.map((b) => {
      const metrics = calculateBreakMetrics(
        b.started_at,
        b.allowed_minutes,
        new Date(nowMs).toISOString()
      );
      return { break: b, metrics };
    });
  }, [breaks, nowMs]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Live Active Breaks
        </h2>
        <Badge tone="brand">{rows.length} active</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-8 text-[var(--ink-muted)]">
          No employees are currently on break.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Break Type</th>
                <th className="px-4 py-3 font-medium">Start Time</th>
                <th className="px-4 py-3 font-medium">Allowed</th>
                <th className="px-4 py-3 font-medium">Elapsed</th>
                <th className="px-4 py-3 font-medium">Remaining / Overtime</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ break: b, metrics }) => (
                <tr key={b.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-medium">
                    {b.employee?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{breakTypeLabel(b.break_type)}</td>
                  <td className="px-4 py-3">
                    {formatOfficeTime(b.started_at, timezone)}
                  </td>
                  <td className="px-4 py-3">{b.allowed_minutes} min</td>
                  <td className="px-4 py-3">
                    {formatMinutesDisplay(metrics.actualMinutes)}
                  </td>
                  <td
                    className={`px-4 py-3 font-[family-name:var(--font-mono)] font-semibold ${
                      metrics.isOvertime ? "text-[var(--danger)]" : ""
                    }`}
                  >
                    {metrics.isOvertime
                      ? `+${formatDuration(metrics.extraSeconds)}`
                      : `${formatDuration(metrics.remainingSeconds)} left`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={metrics.isOvertime ? "danger" : "brand"}>
                      {metrics.isOvertime ? "EXCEEDED" : "ON BREAK"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
