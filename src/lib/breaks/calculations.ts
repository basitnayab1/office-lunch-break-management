import type { BreakMetrics } from "@/types/database";

/**
 * Break duration math using absolute timestamps (UTC ISO strings or Date).
 * Never rely on the client clock for start/end — use DB timestamps.
 * The `now` argument should be server time (or polled server time) when computing remaining.
 */
export function calculateBreakMetrics(
  startedAt: string | Date,
  allowedMinutes: number,
  endedAtOrNow: string | Date
): BreakMetrics {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAtOrNow).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("Invalid timestamp");
  }

  const actualSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const allowedSeconds = allowedMinutes * 60;
  const remainingSeconds = allowedSeconds - actualSeconds;
  const extraSeconds = Math.max(0, actualSeconds - allowedSeconds);
  const isOvertime = remainingSeconds <= 0;

  return {
    actualSeconds,
    actualMinutes: Math.round((actualSeconds / 60) * 100) / 100,
    extraSeconds,
    extraMinutes: Math.round((extraSeconds / 60) * 100) / 100,
    status: isOvertime ? "exceeded" : "within_limit",
    remainingSeconds,
    isOvertime,
  };
}

export function finalizeBreak(
  startedAt: string,
  endedAt: string,
  allowedMinutes: number
) {
  const metrics = calculateBreakMetrics(startedAt, allowedMinutes, endedAt);
  return {
    actual_seconds: metrics.actualSeconds,
    actual_minutes: metrics.actualMinutes,
    extra_seconds: metrics.extraSeconds,
    extra_minutes: metrics.extraMinutes,
    status: metrics.status as "within_limit" | "exceeded",
  };
}
