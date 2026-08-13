"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/actions/auth";
import { logAudit } from "@/actions/audit";
import { getOfficeSettings } from "@/actions/settings";
import { syncBreakToGoogleSheets } from "@/actions/breaks";
import { createServiceClient } from "@/lib/supabase/admin";
import { finalizeBreak } from "@/lib/breaks/calculations";
import type { BreakBooking, BreakSession, Employee } from "@/types/database";

type AutomationSummary = {
  breakReminders: number;
  bookingReminders: number;
  overtimeAlerts: number;
  autoEnded: number;
  missedBookings: number;
  sheetRetries: number;
};

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("schema cache")
  );
}

function minutesUntil(targetIso: string, nowMs: number) {
  return Math.ceil((new Date(targetIso).getTime() - nowMs) / 60_000);
}

export async function runOperationalAutomation(): Promise<{
  success: true;
  data: AutomationSummary;
}> {
  await requireAdmin();
  const service = createServiceClient();
  const settings = await getOfficeSettings();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const summary: AutomationSummary = {
    breakReminders: 0,
    bookingReminders: 0,
    overtimeAlerts: 0,
    autoEnded: 0,
    missedBookings: 0,
    sheetRetries: 0,
  };

  const { data: activeBreaks } = await service
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .eq("status", "active");

  for (const session of ((activeBreaks ?? []) as BreakSession[])) {
    const employee = session.employee as Employee | null | undefined;
    if (!employee) continue;

    const startedAt = new Date(session.started_at).getTime();
    const dueAt = new Date(
      startedAt + session.allowed_minutes * 60_000
    ).toISOString();
    const remaining = minutesUntil(dueAt, nowMs);

    if (remaining < 0) {
      summary.overtimeAlerts += 1;
    }

    if (
      settings.auto_end_breaks &&
      remaining < -Math.max(0, settings.grace_period_minutes)
    ) {
      const metrics = finalizeBreak(
        session.started_at,
        nowIso,
        session.allowed_minutes
      );
      let autoEndUpdate = await service
        .from("break_sessions")
        .update({
          ended_at: nowIso,
          actual_minutes: metrics.actual_minutes,
          actual_seconds: metrics.actual_seconds,
          extra_minutes: metrics.extra_minutes,
          extra_seconds: metrics.extra_seconds,
          status: metrics.extra_seconds > 0 ? "exceeded" : "within_limit",
          google_sheet_sync_status: "pending",
          google_sheet_error: null,
        })
        .eq("id", session.id)
        .eq("status", "active")
        .select("*")
        .maybeSingle();
      if (isMissingSchemaError(autoEndUpdate.error)) {
        autoEndUpdate = await service
          .from("break_sessions")
          .update({
            ended_at: nowIso,
            actual_minutes: metrics.actual_minutes,
            actual_seconds: metrics.actual_seconds,
            extra_minutes: metrics.extra_minutes,
            extra_seconds: metrics.extra_seconds,
            status: metrics.extra_seconds > 0 ? "exceeded" : "within_limit",
          })
          .eq("id", session.id)
          .eq("status", "active")
          .select("*")
          .maybeSingle();
      }
      const { data: ended } = autoEndUpdate;

      if (ended) {
        await logAudit({
          actorType: "system",
          action: "break_auto_ended",
          targetType: "break_session",
          targetId: session.id,
          oldData: session,
          newData: ended as BreakSession,
        });
        await syncBreakToGoogleSheets(session.id);
        summary.autoEnded += 1;
      }
    }
  }

  const { data: missed, error: missedError } = await service
    .from("break_bookings")
    .select("*")
    .in("status", ["scheduled", "waiting"])
    .lt("scheduled_end", nowIso);

  for (const booking of ((missedError ? [] : missed ?? []) as BreakBooking[])) {
    await service
      .from("break_bookings")
      .update({ status: "missed" })
      .eq("id", booking.id);
    await logAudit({
      actorType: "system",
      action: "booking_marked_missed",
      targetType: "break_booking",
      targetId: booking.id,
      oldData: booking,
      newData: { status: "missed" },
    });
    summary.missedBookings += 1;
  }

  const failedSyncsQuery = await service
    .from("break_sessions")
    .select("id")
    .in("google_sheet_sync_status", ["failed", "pending"])
    .neq("status", "active")
    .limit(20);

  for (const row of failedSyncsQuery.error ? [] : failedSyncsQuery.data ?? []) {
    const result = await syncBreakToGoogleSheets(row.id);
    if (result.success) summary.sheetRetries += 1;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/history");
  return { success: true, data: summary };
}
