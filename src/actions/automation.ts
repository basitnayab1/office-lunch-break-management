"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/actions/auth";
import { logAudit } from "@/actions/audit";
import {
  createAdminNotificationOnce,
  createEmployeeNotificationOnce,
} from "@/actions/notifications";
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

    if (remaining <= 10 && remaining > 5) {
      await createEmployeeNotificationOnce({
        recipientId: employee.id,
        kind: "break_10_min_remaining",
        title: "10 minutes remaining",
        body: "Your break is nearing its allowed duration.",
        entityType: "break_session",
        entityId: session.id,
      });
      summary.breakReminders += 1;
    }

    if (remaining <= 5 && remaining >= 0) {
      await createEmployeeNotificationOnce({
        recipientId: employee.id,
        kind: "break_5_min_remaining",
        title: "5 minutes remaining",
        body: "Please wrap up and return on time.",
        entityType: "break_session",
        entityId: session.id,
      });
      summary.breakReminders += 1;
    }

    if (remaining < 0) {
      await createEmployeeNotificationOnce({
        recipientId: employee.id,
        kind: "overtime_warning",
        title: "Break overtime",
        body: "Your break has passed the allowed duration.",
        entityType: "break_session",
        entityId: session.id,
      });
      await createAdminNotificationOnce({
        kind: "admin_overtime_alert",
        title: `${employee.full_name} is overtime`,
        body: `${employee.department} break is past the allowed duration.`,
        entityType: "break_session",
        entityId: session.id,
      });
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
        await createEmployeeNotificationOnce({
          recipientId: employee.id,
          kind: "break_completed",
          title: "Break auto-ended",
          body: "Your break was auto-ended after the grace period.",
          entityType: "break_session",
          entityId: session.id,
        });
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

  const reminderWindowEnd = new Date(nowMs + 10 * 60_000).toISOString();
  const { data: bookings, error: bookingsError } = await service
    .from("break_bookings")
    .select("*, employee:employees(*)")
    .eq("status", "scheduled")
    .gte("scheduled_start", nowIso)
    .lte("scheduled_start", reminderWindowEnd);

  for (const booking of ((bookingsError ? [] : bookings ?? []) as BreakBooking[])) {
    await createEmployeeNotificationOnce({
      recipientId: booking.employee_id,
      kind: "booking_reminder",
      title: "Break slot starting soon",
      body: "Your reserved break slot starts within 10 minutes.",
      entityType: "break_booking",
      entityId: booking.id,
    });
    summary.bookingReminders += 1;
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
