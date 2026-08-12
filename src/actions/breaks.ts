"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { finalizeBreak } from "@/lib/breaks/calculations";
import {
  allowedMinutesForBreakType,
  breakTypeLabel,
  isBreakType,
} from "@/lib/breaks/types";
import { getOfficeDate } from "@/lib/time/timezone";
import { formatOfficeTime } from "@/lib/time/timezone";
import {
  appendBreakToSheet,
  getGoogleSheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/service";
import { requireAdmin, requireEmployee, type ActionResult } from "@/actions/auth";
import {
  createAdminNotification,
  createEmployeeNotification,
} from "@/actions/notifications";
import { logAudit } from "@/actions/audit";
import { revalidatePath } from "next/cache";
import type { BreakSession, OfficeSettings } from "@/types/database";
import { normalizeOfficeSettings } from "@/lib/settings/defaults";

function formatActionError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("schema cache") ||
    message.includes("validate_break_start")
  );
}

function isMissingColumnError(
  error: { code?: string; message?: string } | null,
  column: string
) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    (message.includes("schema cache") && message.includes(column.toLowerCase()))
  );
}

function breakStatusFromMetrics(extraSeconds: number): "within_limit" | "exceeded" {
  return extraSeconds > 0 ? "exceeded" : "within_limit";
}

async function getSettings(): Promise<OfficeSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("office_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return normalizeOfficeSettings(data as Partial<OfficeSettings> | null);
}

function timeToMinutes(value: string | null | undefined, fallback: string) {
  const [hours = "0", minutes = "0"] = (value || fallback).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isWithinOfficeWindow(nowIso: string, settings: OfficeSettings) {
  const weekday = formatOfficeTime(nowIso, settings.timezone, "i");
  if (!settings.allow_weekend_breaks && (weekday === "6" || weekday === "7")) {
    return false;
  }

  const current = timeToMinutes(
    formatOfficeTime(nowIso, settings.timezone, "HH:mm"),
    "00:00"
  );
  const startTime = settings.office_start_time || "09:00:00";
  const endTime = settings.office_end_time || "18:00:00";
  const start = timeToMinutes(startTime, "09:00:00");
  const end = timeToMinutes(endTime, "18:00:00");

  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
}

async function validateBreakStartRules({
  employee,
  settings,
  startedAt,
  breakDate,
}: {
  employee: Awaited<ReturnType<typeof requireEmployee>>;
  settings: OfficeSettings;
  startedAt: string;
  breakDate: string;
}): Promise<string | null> {
  const service = createServiceClient();
  const blockedUntil = employee.break_access_blocked_until
    ? new Date(employee.break_access_blocked_until).getTime()
    : 0;

  if (!employee.is_active || blockedUntil > Date.now()) {
    return employee.break_access_block_reason || "Your break access is temporarily blocked.";
  }

  if (!isWithinOfficeWindow(startedAt, settings)) {
    const startTime = settings.office_start_time || "09:00:00";
    const endTime = settings.office_end_time || "18:00:00";
    return `Breaks are allowed during office hours (${startTime.slice(0, 5)}-${endTime.slice(0, 5)}).`;
  }

  const { data: rpcRows, error: rpcError } = await service.rpc("validate_break_start", {
    p_employee_id: employee.id,
    p_break_date: breakDate,
    p_now: startedAt,
  });
  if (rpcError && !isMissingSchemaError(rpcError)) {
    console.error("[validate_break_start RPC]", rpcError);
    return rpcError.message || "Break validation failed.";
  }
  const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : null;
  if (rpcResult && !rpcResult.ok) {
    return rpcResult.message || "Break cannot be started right now.";
  }

  const [{ count: todayCount }, { count: activeCount }, { data: activeRows }, { data: rule }] =
    await Promise.all([
      service
        .from("break_sessions")
        .select("*", { count: "exact", head: true })
        .eq("employee_id", employee.id)
        .eq("break_date", breakDate)
        .neq("status", "cancelled"),
      service
        .from("break_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      service
        .from("break_sessions")
        .select("id, employee:employees(department)")
        .eq("status", "active"),
      service
        .from("coverage_rules")
        .select("*")
        .eq("department", employee.department)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if ((todayCount ?? 0) >= settings.daily_max_breaks) {
    return `Daily break limit reached (${settings.daily_max_breaks}).`;
  }

  if ((activeCount ?? 0) >= settings.max_simultaneous_breaks) {
    return "Office break capacity is full right now. Please try again shortly.";
  }

  const departmentActiveBreaks = (activeRows ?? []).filter((row) => {
    const related = row.employee as { department?: string } | { department?: string }[] | null;
    const relatedDepartment = Array.isArray(related)
      ? related[0]?.department
      : related?.department;
    return relatedDepartment === employee.department;
  }).length;

  const coverageRule = rule as {
    minimum_available?: number;
    max_on_break?: number | null;
  } | null;

  if (
    coverageRule?.max_on_break != null &&
    departmentActiveBreaks >= coverageRule.max_on_break
  ) {
    return `${employee.department} already has ${departmentActiveBreaks} employee(s) on break. Please try again later.`;
  }

  if (coverageRule?.minimum_available != null) {
    const { count: departmentEmployees } = await service
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("role", "employee")
      .eq("is_active", true)
      .eq("department", employee.department);

    const availableAfterStart =
      (departmentEmployees ?? 0) - departmentActiveBreaks - 1;

    if (availableAfterStart < coverageRule.minimum_available) {
      return `Your team currently requires at least ${coverageRule.minimum_available} active employee(s). Please try again in a few minutes.`;
    }
  }

  return null;
}

export async function getActiveBreak(): Promise<BreakSession | null> {
  const employee = await requireEmployee();
  const supabase = await createClient();

  const { data } = await supabase
    .from("break_sessions")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("status", "active")
    .maybeSingle();

  return data;
}

export async function getMyBreakHistory(limit = 30): Promise<BreakSession[]> {
  const employee = await requireEmployee();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("break_sessions")
    .select(
      "id, employee_id, break_date, break_type, started_at, ended_at, allowed_minutes, actual_minutes, actual_seconds, extra_minutes, extra_seconds, status, google_sheet_sync_status, google_sheet_row_id, google_sheet_synced_at, google_sheet_error, created_at, updated_at"
    )
    .eq("employee_id", employee.id)
    .neq("status", "active")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getMyBreakHistory]", error.message, error.code, error.details);
    return [];
  }

  return (data as BreakSession[] | null) ?? [];
}

export async function startBreak(
  breakTypeInput: string
): Promise<ActionResult<BreakSession>> {
  try {
    const employee = await requireEmployee();
    const settings = await getSettings();
    const service = createServiceClient();

    if (!isBreakType(breakTypeInput)) {
      return {
        success: false,
        error: "Please select Breakfast, Coffee, or Lunch.",
      };
    }

    const breakType = breakTypeInput;
    // Server determines duration — never trust client-sent minutes.
    // Production: Breakfast 15 / Coffee 15 / Lunch 60.
    // Test mode (admin setting): short duration for alarm testing only.
    const allowedMinutes =
      settings.break_test_mode && settings.break_test_minutes > 0
        ? settings.break_test_minutes
        : allowedMinutesForBreakType(breakType);

    const { data: existing } = await service
      .from("break_sessions")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return { success: false, error: "Your break has already started." };
    }

    const startedAt = new Date().toISOString();
    const breakDate = getOfficeDate(startedAt, settings.timezone);
    const rulesError = await validateBreakStartRules({
      employee,
      settings,
      startedAt,
      breakDate,
    });

    if (rulesError) {
      return { success: false, error: rulesError };
    }

    let inserted = await service
      .from("break_sessions")
      .insert({
        employee_id: employee.id,
        break_date: breakDate,
        break_type: breakType,
        started_at: startedAt,
        ended_at: null,
        allowed_minutes: allowedMinutes,
        status: "active",
        google_sheet_sync_status: "not_applicable",
      })
      .select("*")
      .single();

    if (isMissingColumnError(inserted.error, "google_sheet_sync_status")) {
      inserted = await service
        .from("break_sessions")
        .insert({
          employee_id: employee.id,
          break_date: breakDate,
          break_type: breakType,
          started_at: startedAt,
          ended_at: null,
          allowed_minutes: allowedMinutes,
          status: "active",
          google_sheet_sync_status: "not_applicable",
        })
        .select("*")
        .single();
    }

    const { data, error } = inserted;

    // Unique partial index blocks duplicate active breaks under race conditions.
    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Your break has already started." };
      }
      console.error("startBreak error", error);
      return {
        success: false,
        error: error.message || "Unable to start break. Please try again.",
      };
    }

    await createEmployeeNotification({
      recipientId: employee.id,
      kind: "system",
      title: `${breakTypeLabel(breakType)} break started`,
      body: `Your break is active for ${allowedMinutes} minutes.`,
      entityType: "break_session",
      entityId: data.id,
    });
    await logAudit({
      actorId: employee.id,
      actorType: employee.role,
      action: "break_started",
      targetType: "break_session",
      targetId: data.id,
      newData: data as BreakSession,
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin");
    return {
      success: true,
      data,
      message: `${breakTypeLabel(breakType)} break started.`,
    };
  } catch (error) {
    const message = formatActionError(error);
    console.error("[startBreak] unexpected", message, error);
    return { success: false, error: `Unable to start break: ${message}` };
  }
}

export async function endBreak(): Promise<ActionResult<BreakSession>> {
  try {
    const employee = await requireEmployee();
    const service = createServiceClient();

    const { data: active, error: findError } = await service
      .from("break_sessions")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("status", "active")
      .maybeSingle();

    if (findError || !active) {
      return { success: false, error: "No active break found to end." };
    }

    // Server timestamp as source of truth
    const endedAt = new Date().toISOString();
    const metrics = finalizeBreak(
      active.started_at,
      endedAt,
      active.allowed_minutes
    );

    let endedUpdate = await service
      .from("break_sessions")
      .update({
        ended_at: endedAt,
        actual_minutes: metrics.actual_minutes,
        actual_seconds: metrics.actual_seconds,
        extra_minutes: metrics.extra_minutes,
        extra_seconds: metrics.extra_seconds,
        status: breakStatusFromMetrics(metrics.extra_seconds),
        google_sheet_sync_status: "pending",
        google_sheet_error: null,
      })
      .eq("id", active.id)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (
      isMissingColumnError(endedUpdate.error, "google_sheet_error") ||
      isMissingColumnError(endedUpdate.error, "google_sheet_sync_status")
    ) {
      endedUpdate = await service
        .from("break_sessions")
        .update({
          ended_at: endedAt,
          actual_minutes: metrics.actual_minutes,
          actual_seconds: metrics.actual_seconds,
          extra_minutes: metrics.extra_minutes,
          extra_seconds: metrics.extra_seconds,
          status: breakStatusFromMetrics(metrics.extra_seconds),
        })
        .eq("id", active.id)
        .eq("status", "active")
        .select("*")
        .maybeSingle();
    }

    const { data: completed, error: updateError } = endedUpdate;

    if (updateError || !completed) {
      return {
        success: false,
        error: "Unable to end break. It may have already ended.",
      };
    }

    // Sync to Google Sheets (non-blocking failure)
    await syncBreakToGoogleSheets(completed.id);

    await createEmployeeNotification({
      recipientId: employee.id,
      kind: metrics.extra_seconds > 0 ? "overtime_warning" : "break_completed",
      title:
        metrics.extra_seconds > 0
          ? "Break ended with overtime"
          : "Break completed",
      body:
        metrics.extra_seconds > 0
          ? `You exceeded by ${metrics.extra_minutes} minutes.`
          : "You returned within the allowed time.",
      entityType: "break_session",
      entityId: completed.id,
    });
    await logAudit({
      actorId: employee.id,
      actorType: employee.role,
      action: "break_ended",
      targetType: "break_session",
      targetId: completed.id,
      oldData: active as BreakSession,
      newData: completed as BreakSession,
    });

    if (metrics.extra_seconds > 0) {
      await createAdminNotification({
        kind: "admin_overtime_alert",
        title: `${employee.full_name} returned late`,
        body: `${employee.department} overtime: ${metrics.extra_minutes} minute(s).`,
        entityType: "break_session",
        entityId: completed.id,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    return {
      success: true,
      data: completed,
      message:
        metrics.extra_seconds > 0
          ? `Break ended. You exceeded by ${metrics.extra_minutes} minutes.`
          : "Break ended successfully.",
    };
  } catch (e) {
    console.error("endBreak", e);
    return { success: false, error: "Unable to end break. Please try again." };
  }
}

export async function syncBreakToGoogleSheets(
  breakSessionId: string
): Promise<ActionResult> {
  const service = createServiceClient();

  const { data: session } = await service
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .eq("id", breakSessionId)
    .maybeSingle();

  if (!session || session.status === "active") {
    return { success: false, error: "Break record not found or still active." };
  }

  const employee = session.employee as unknown as {
    id: string;
    employee_id: string;
    full_name: string;
    department: string;
    designation?: string;
    shift?: string;
    email: string | null;
    allowed_break_minutes: number;
    role: "employee" | "admin";
    is_active: boolean;
    avatar_url?: string | null;
    joining_date?: string | null;
    break_access_blocked_until?: string | null;
    break_access_block_reason?: string | null;
    created_at: string;
    updated_at: string;
  } | null;

  if (!employee) {
    return { success: false, error: "Employee missing for break record." };
  }

  const { data: settings } = await service
    .from("office_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (!settings) {
    return { success: false, error: "Office settings missing." };
  }

  if (!isGoogleSheetsConfigured(settings.google_sheet_id)) {
    const syncSkippedUpdate = await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "not_applicable",
        google_sheet_error: getGoogleSheetId(settings.google_sheet_id)
          ? "Google Sheets credentials not configured"
          : "GOOGLE_SHEET_ID not configured",
      })
      .eq("id", breakSessionId);
    if (isMissingColumnError(syncSkippedUpdate.error, "google_sheet_error")) {
      await service
        .from("break_sessions")
        .update({ google_sheet_sync_status: "not_applicable" })
        .eq("id", breakSessionId);
    }
    return {
      success: true,
      message: "Google Sheets sync skipped (not configured).",
    };
  }

  try {
    const forceAppend =
      session.google_sheet_sync_status === "failed" ||
      session.google_sheet_sync_status === "pending" ||
      !session.google_sheet_row_id;

    const { rowNumber, spreadsheetId, sheetName, updatedRange } =
      await appendBreakToSheet({
        session,
        employee: {
          ...employee,
          designation: employee.designation ?? "",
          shift: employee.shift ?? "General",
          avatar_url: employee.avatar_url ?? null,
          joining_date: employee.joining_date ?? null,
          break_access_blocked_until: employee.break_access_blocked_until ?? null,
          break_access_block_reason: employee.break_access_block_reason ?? null,
        },
        settings,
        forceAppend,
      });

    if (!rowNumber || rowNumber < 2) {
      throw new Error(
        `Google Sheets did not return a valid data row number (got ${rowNumber}).`
      );
    }

    console.info("[Google Sheets] sync confirmed", {
      breakSessionId,
      spreadsheetId,
      sheetName,
      rowNumber,
      updatedRange,
    });

    const syncedUpdate = await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "synced",
        google_sheet_row_id: rowNumber,
        google_sheet_synced_at: new Date().toISOString(),
        google_sheet_error: null,
      })
      .eq("id", breakSessionId);
    if (isMissingColumnError(syncedUpdate.error, "google_sheet_error")) {
      await service
        .from("break_sessions")
        .update({
          google_sheet_sync_status: "synced",
          google_sheet_row_id: rowNumber,
          google_sheet_synced_at: new Date().toISOString(),
        })
        .eq("id", breakSessionId);
    }

    return {
      success: true,
      message: `Synced to Google Sheets (${sheetName} row ${rowNumber}).`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown Google Sheets sync error";
    console.error(
      `[Google Sheets] sync failed for break ${breakSessionId}:`,
      message,
      err
    );
    const failedUpdate = await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "failed",
        google_sheet_error: message,
      })
      .eq("id", breakSessionId);
    if (isMissingColumnError(failedUpdate.error, "google_sheet_error")) {
      await service
        .from("break_sessions")
        .update({ google_sheet_sync_status: "failed" })
        .eq("id", breakSessionId);
    }

    await createAdminNotification({
      kind: "google_sheets_failed",
      title: "Google Sheets sync failed",
      body: message,
      entityType: "break_session",
      entityId: breakSessionId,
    });

    return {
      success: false,
      error: message,
    };
  }
}

export async function retryFailedSheetSyncs(): Promise<ActionResult<{ count: number }>> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized. Admin access required." };
  }
  const service = createServiceClient();

  const failedQuery = await service
    .from("break_sessions")
    .select("id")
    .in("google_sheet_sync_status", ["failed", "pending"])
    .neq("status", "active");
  const failed = isMissingColumnError(
    failedQuery.error,
    "google_sheet_sync_status"
  )
    ? []
    : failedQuery.data;

  let count = 0;
  for (const row of failed ?? []) {
    const result = await syncBreakToGoogleSheets(row.id);
    if (result.success) count += 1;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/history");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/sheets");
  return {
    success: true,
    data: { count },
    message: `Retried sync for ${count} record(s).`,
  };
}

export async function retrySingleSheetSync(
  breakSessionId: string
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized. Admin access required." };
  }
  const result = await syncBreakToGoogleSheets(breakSessionId);
  revalidatePath("/admin/history");
  return result;
}

export async function adminEndEmployeeBreak(
  breakSessionId: string,
  reason: string
): Promise<ActionResult<BreakSession>> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { success: false, error: "Reason is required." };

  const service = createServiceClient();
  const { data: active } = await service
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .eq("id", breakSessionId)
    .eq("status", "active")
    .maybeSingle();

  if (!active) return { success: false, error: "Active break not found." };

  const endedAt = new Date().toISOString();
  const metrics = finalizeBreak(
    active.started_at,
    endedAt,
    active.allowed_minutes
  );
  let adminEndUpdate = await service
    .from("break_sessions")
    .update({
      ended_at: endedAt,
      actual_minutes: metrics.actual_minutes,
      actual_seconds: metrics.actual_seconds,
      extra_minutes: metrics.extra_minutes,
      extra_seconds: metrics.extra_seconds,
      status: breakStatusFromMetrics(metrics.extra_seconds),
      google_sheet_sync_status: "pending",
      google_sheet_error: null,
      admin_note: reason.trim(),
    })
    .eq("id", breakSessionId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (isMissingColumnError(adminEndUpdate.error, "google_sheet_error")) {
    adminEndUpdate = await service
      .from("break_sessions")
      .update({
        ended_at: endedAt,
        actual_minutes: metrics.actual_minutes,
        actual_seconds: metrics.actual_seconds,
        extra_minutes: metrics.extra_minutes,
        extra_seconds: metrics.extra_seconds,
        status: breakStatusFromMetrics(metrics.extra_seconds),
        admin_note: reason.trim(),
      })
      .eq("id", breakSessionId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();
  }

  const { data: ended, error } = adminEndUpdate;

  if (error || !ended) {
    return { success: false, error: "Unable to end employee break." };
  }

  await createEmployeeNotification({
    recipientId: ended.employee_id,
    kind: "break_completed",
    title: "Break ended by admin",
    body: reason.trim(),
    entityType: "break_session",
    entityId: breakSessionId,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_end_break",
    targetType: "break_session",
    targetId: breakSessionId,
    oldData: active as BreakSession,
    newData: ended as BreakSession,
  });
  await syncBreakToGoogleSheets(breakSessionId);
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  return { success: true, data: ended as BreakSession, message: "Break ended." };
}

export async function adminExtendBreak(
  breakSessionId: string,
  minutes: 5 | 10 | 15,
  reason: string
): Promise<ActionResult<BreakSession>> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { success: false, error: "Reason is required." };

  const service = createServiceClient();
  const { data: active } = await service
    .from("break_sessions")
    .select("*")
    .eq("id", breakSessionId)
    .eq("status", "active")
    .maybeSingle();

  if (!active) return { success: false, error: "Active break not found." };

  const { data: updated, error } = await service
    .from("break_sessions")
    .update({
      allowed_minutes: Number(active.allowed_minutes) + minutes,
      admin_note: reason.trim(),
    })
    .eq("id", breakSessionId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    return { success: false, error: "Unable to extend break." };
  }

  await createEmployeeNotification({
    recipientId: updated.employee_id,
    kind: "system",
    title: `Break extended by ${minutes} minutes`,
    body: reason.trim(),
    entityType: "break_session",
    entityId: breakSessionId,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_extend_break",
    targetType: "break_session",
    targetId: breakSessionId,
    oldData: active as BreakSession,
    newData: updated as BreakSession,
  });
  revalidatePath("/admin");
  return { success: true, data: updated as BreakSession, message: "Break extended." };
}

export async function adminApproveOvertime(
  breakSessionId: string,
  approvedMinutes: number,
  reason: string
): Promise<ActionResult<BreakSession>> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { success: false, error: "Reason is required." };

  const service = createServiceClient();
  const { data: existing } = await service
    .from("break_sessions")
    .select("*")
    .eq("id", breakSessionId)
    .maybeSingle();

  if (!existing) return { success: false, error: "Break record not found." };

  const { data: updated, error } = await service
    .from("break_sessions")
    .update({
      approved_overtime_minutes: Math.max(0, Number(approvedMinutes) || 0),
      admin_note: reason.trim(),
    })
    .eq("id", breakSessionId)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    return { success: false, error: "Unable to approve overtime." };
  }

  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_approve_overtime",
    targetType: "break_session",
    targetId: breakSessionId,
    oldData: existing as BreakSession,
    newData: updated as BreakSession,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  return {
    success: true,
    data: updated as BreakSession,
    message: "Overtime approved.",
  };
}

export async function adminSendBreakReminder(
  breakSessionId: string,
  reason: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { success: false, error: "Reason is required." };

  const service = createServiceClient();
  const { data: active } = await service
    .from("break_sessions")
    .select("id, employee_id, status")
    .eq("id", breakSessionId)
    .eq("status", "active")
    .maybeSingle();

  if (!active) return { success: false, error: "Active break not found." };

  await createEmployeeNotification({
    recipientId: active.employee_id,
    kind: "system",
    title: "Admin reminder",
    body: reason.trim(),
    entityType: "break_session",
    entityId: breakSessionId,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_send_break_reminder",
    targetType: "break_session",
    targetId: breakSessionId,
    newData: { reason: reason.trim() },
  });
  return { success: true, message: "Reminder sent." };
}

export async function adminTemporarilyBlockBreakAccess(
  employeeId: string,
  minutes: number,
  reason: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { success: false, error: "Reason is required." };

  const blockMinutes = Math.max(5, Math.min(1440, Number(minutes) || 15));
  const blockedUntil = new Date(Date.now() + blockMinutes * 60_000).toISOString();
  const service = createServiceClient();
  const { data: existing } = await service
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();

  if (!existing) return { success: false, error: "Employee not found." };

  const { data: updated, error } = await service
    .from("employees")
    .update({
      break_access_blocked_until: blockedUntil,
      break_access_block_reason: reason.trim(),
    })
    .eq("id", employeeId)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    return { success: false, error: "Unable to block break access." };
  }

  await createEmployeeNotification({
    recipientId: employeeId,
    kind: "system",
    title: "Break access temporarily blocked",
    body: `${reason.trim()} Until ${blockedUntil}.`,
    entityType: "employee",
    entityId: employeeId,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_block_break_access",
    targetType: "employee",
    targetId: employeeId,
    oldData: existing,
    newData: updated,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/employees");
  return { success: true, message: "Break access blocked temporarily." };
}

export async function getServerNow(): Promise<string> {
  // Expose approximate server time for countdown alignment
  return new Date().toISOString();
}
