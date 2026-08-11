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
import { DEFAULT_TIMEZONE } from "@/lib/time/timezone";
import {
  appendBreakToSheet,
  getGoogleSheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/service";
import { requireAdmin, requireEmployee, type ActionResult } from "@/actions/auth";
import { revalidatePath } from "next/cache";
import type { BreakSession, OfficeSettings } from "@/types/database";

async function getSettings(): Promise<OfficeSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("office_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    (data as OfficeSettings | null) ?? {
      id: 1,
      office_name: "Office",
      timezone: DEFAULT_TIMEZONE,
      default_break_minutes: 60,
      break_warning_minutes: 2,
      break_test_mode: false,
      break_test_minutes: 3,
      google_sheet_id: null,
      google_sheet_name: "Break Records",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );
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

    // Server/runtime timestamp — never use the browser clock for start/end.
    const startedAt = new Date().toISOString();
    const breakDate = getOfficeDate(startedAt, settings.timezone);

    const { data, error } = await service
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

    // Unique partial index blocks duplicate active breaks under race conditions.
    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Your break has already started." };
      }
      console.error("startBreak error", error);
      return { success: false, error: "Unable to start break. Please try again." };
    }

    revalidatePath("/dashboard");
    revalidatePath("/admin");
    return {
      success: true,
      data,
      message: `${breakTypeLabel(breakType)} break started.`,
    };
  } catch {
    return { success: false, error: "Unable to start break. Please try again." };
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

    const { data: completed, error: updateError } = await service
      .from("break_sessions")
      .update({
        ended_at: endedAt,
        actual_minutes: metrics.actual_minutes,
        actual_seconds: metrics.actual_seconds,
        extra_minutes: metrics.extra_minutes,
        extra_seconds: metrics.extra_seconds,
        status: metrics.status,
        google_sheet_sync_status: "pending",
        google_sheet_error: null,
      })
      .eq("id", active.id)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (updateError || !completed) {
      return {
        success: false,
        error: "Unable to end break. It may have already ended.",
      };
    }

    // Sync to Google Sheets (non-blocking failure)
    await syncBreakToGoogleSheets(completed.id);

    revalidatePath("/dashboard");
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    return {
      success: true,
      data: completed,
      message:
        metrics.status === "exceeded"
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
    email: string | null;
    allowed_break_minutes: number;
    role: "employee" | "admin";
    is_active: boolean;
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
    await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "not_applicable",
        google_sheet_error: getGoogleSheetId(settings.google_sheet_id)
          ? "Google Sheets credentials not configured"
          : "GOOGLE_SHEET_ID not configured",
      })
      .eq("id", breakSessionId);
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
        employee,
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

    await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "synced",
        google_sheet_row_id: rowNumber,
        google_sheet_synced_at: new Date().toISOString(),
        google_sheet_error: null,
      })
      .eq("id", breakSessionId);

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
    await service
      .from("break_sessions")
      .update({
        google_sheet_sync_status: "failed",
        google_sheet_error: message,
      })
      .eq("id", breakSessionId);

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

  const { data: failed } = await service
    .from("break_sessions")
    .select("id")
    .in("google_sheet_sync_status", ["failed", "pending"])
    .neq("status", "active");

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

export async function getServerNow(): Promise<string> {
  // Expose approximate server time for countdown alignment
  return new Date().toISOString();
}
