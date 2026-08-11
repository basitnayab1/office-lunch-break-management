import type { BreakMetrics } from "@/types/database";

export type BreakAlarmPhase = "normal" | "warning" | "exceeded";

export function getBreakAlarmPhase(
  metrics: BreakMetrics,
  warningMinutes: number
): BreakAlarmPhase {
  if (metrics.isOvertime || metrics.remainingSeconds <= 0) {
    return "exceeded";
  }
  const warningSeconds = Math.max(1, warningMinutes) * 60;
  if (metrics.remainingSeconds <= warningSeconds) {
    return "warning";
  }
  return "normal";
}

/**
 * Absolute deadline timestamps derived from DB start + allowed duration.
 * Prefer these over counting intervals alone.
 */
export function getBreakDeadlines(
  startedAt: string,
  allowedMinutes: number,
  warningMinutes: number
): { warningAtMs: number; endsAtMs: number } {
  const startMs = new Date(startedAt).getTime();
  const endsAtMs = startMs + allowedMinutes * 60 * 1000;
  const warningAtMs = endsAtMs - Math.max(1, warningMinutes) * 60 * 1000;
  return { warningAtMs, endsAtMs };
}
