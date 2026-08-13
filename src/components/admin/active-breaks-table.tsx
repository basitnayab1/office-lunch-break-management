"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  adminEndEmployeeBreak,
  adminExtendBreak,
  adminSendBreakReminder,
} from "@/actions/breaks";
import { getActiveBreaks } from "@/actions/reports";
import { calculateBreakMetrics } from "@/lib/breaks/calculations";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatDuration, formatMinutesDisplay } from "@/lib/utils";
import { formatOfficeTime } from "@/lib/time/timezone";
import type { BreakSession } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";

export function ActiveBreaksTable({
  initialBreaks,
  timezone,
  compact = false,
}: {
  initialBreaks: BreakSession[];
  timezone: string;
  compact?: boolean;
}) {
  const [breaks, setBreaks] = useState(initialBreaks);
  const [nowMs, setNowMs] = useState(Date.now());
  const [, startTransition] = useTransition();
  const refreshTimer = useRef<number | null>(null);

  const refreshBreaks = useCallback(() => {
    startTransition(async () => {
      try {
        setBreaks(await getActiveBreaks());
      } catch {
        setBreaks([]);
      }
    });
  }, []);

  const queueRefreshBreaks = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      refreshBreaks();
    }, 1200);
  }, [refreshBreaks]);

  useEffect(() => {
    setBreaks(initialBreaks);
  }, [initialBreaks]);

  useEffect(() => {
    if (compact) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [compact]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    if (compact) return;

    const supabase = createClient();

    const channel = supabase
      .channel("admin-active-breaks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "break_sessions" },
        queueRefreshBreaks
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [compact, queueRefreshBreaks]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-4 sm:px-6">
        <h2 className="text-lg font-bold">
          Live Active Breaks
        </h2>
        <Badge tone="brand">{rows.length} active</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="flex min-h-[170px] items-center gap-5 px-6 py-8">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--brand-soft)] text-2xl text-[var(--brand)]">
            ☕
          </span>
          <div>
            <p className="font-medium">No employees are currently on break.</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              When someone starts a break, they will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                {!compact ? <th className="px-4 py-3 font-medium">Break Type</th> : null}
                {!compact ? <th className="px-4 py-3 font-medium">Start Time</th> : null}
                {!compact ? <th className="px-4 py-3 font-medium">Allowed</th> : null}
                <th className="px-4 py-3 font-medium">Elapsed</th>
                <th className="px-4 py-3 font-medium">Remaining / Overtime</th>
                {!compact ? <th className="px-4 py-3 font-medium">Status</th> : null}
                {!compact ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ break: b, metrics }) => (
                <tr key={b.id} className="border-t border-[var(--line)]">
                  <td className="max-w-[12rem] truncate px-4 py-3 font-medium" title={b.employee?.full_name ?? "—"}>
                    {b.employee?.full_name ?? "—"}
                  </td>
                  {!compact ? (
                    <td className="px-4 py-3">{breakTypeLabel(b.break_type)}</td>
                  ) : null}
                  {!compact ? (
                    <td className="px-4 py-3">
                      {formatOfficeTime(b.started_at, timezone)}
                    </td>
                  ) : null}
                  {!compact ? (
                    <td className="px-4 py-3">{b.allowed_minutes} min</td>
                  ) : null}
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
                  {!compact ? (
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        metrics.isOvertime
                          ? "danger"
                          : metrics.remainingSeconds <= 300
                            ? "warn"
                            : "ok"
                      }
                    >
                      {metrics.isOvertime
                        ? "OVERTIME"
                        : metrics.remainingSeconds <= 300
                          ? "5 MIN LEFT"
                          : "NORMAL"}
                    </Badge>
                  </td>
                  ) : null}
                  {!compact ? (
                  <td className="px-4 py-3">
                    <div className="flex min-w-[320px] flex-wrap gap-2">
                      {[5, 10, 15].map((minutes) => (
                        <Button
                          key={minutes}
                          variant="secondary"
                          className="h-9 px-3"
                          onClick={() => {
                            const reason = window.prompt(
                              `Reason to extend by ${minutes} minutes`
                            );
                            if (!reason) return;
                            startTransition(async () => {
                              await adminExtendBreak(
                                b.id,
                                minutes as 5 | 10 | 15,
                                reason
                              );
                              refreshBreaks();
                            });
                          }}
                        >
                          +{minutes}
                        </Button>
                      ))}
                      <Button
                        variant="secondary"
                        className="h-9 px-3"
                        onClick={() => {
                          const reason = window.prompt("Reminder message");
                          if (!reason) return;
                          startTransition(async () => {
                            await adminSendBreakReminder(b.id, reason);
                          });
                        }}
                      >
                        Remind
                      </Button>
                      <Button
                        variant="danger"
                        className="h-9 px-3"
                        onClick={() => {
                          const reason = window.prompt("Reason to end break");
                          if (!reason) return;
                          startTransition(async () => {
                            await adminEndEmployeeBreak(b.id, reason);
                            refreshBreaks();
                          });
                        }}
                      >
                        End
                      </Button>
                    </div>
                  </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
