"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdmin, type ActionResult } from "@/actions/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import type { OfficeSettings } from "@/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/time/timezone";
import {
  defaultOfficeSettings,
  normalizeOfficeSettings,
} from "@/lib/settings/defaults";

const WARNING_MINUTE_OPTIONS = [1, 2, 3, 5] as const;

async function fetchOfficeSettingsRow(): Promise<{
  settings: OfficeSettings;
  usedFallback: boolean;
}> {
  const supabase = createServiceClient();
  const fullSelect = await supabase
    .from("office_settings")
    .select(
      "id, office_name, timezone, default_break_minutes, break_warning_minutes, break_test_mode, break_test_minutes, grace_period_minutes, daily_max_breaks, min_work_minutes_before_break, max_simultaneous_breaks, office_start_time, office_end_time, allow_weekend_breaks, auto_end_breaks, google_sheet_id, google_sheet_name, created_at, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (!fullSelect.error) {
    return {
      settings: normalizeOfficeSettings(fullSelect.data as Partial<OfficeSettings> | null),
      usedFallback: false,
    };
  }

  const fallbackSelect = await supabase
    .from("office_settings")
    .select(
      "id, office_name, timezone, default_break_minutes, google_sheet_id, google_sheet_name, created_at, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  return {
    settings: normalizeOfficeSettings(
      fallbackSelect.data as Partial<OfficeSettings> | null
    ),
    usedFallback: true,
  };
}

export async function getOfficeSettings(): Promise<OfficeSettings> {
  const { settings } = await fetchOfficeSettingsRow();
  return settings;
}

export async function updateOfficeSettings(input: {
  office_name: string;
  timezone: string;
  default_break_minutes: number;
  break_warning_minutes: number;
  break_test_mode: boolean;
  break_test_minutes: number;
  google_sheet_id: string | null;
  google_sheet_name: string;
}): Promise<ActionResult<OfficeSettings>> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized. Admin access required." };
  }

  try {
    if (!input.office_name.trim()) {
      return { success: false, error: "Office name is required." };
    }
    if (input.default_break_minutes < 1) {
      return {
        success: false,
        error: "Default break duration must be at least 1 minute.",
      };
    }

    const warningMinutes = Number(input.break_warning_minutes);
    if (
      !WARNING_MINUTE_OPTIONS.includes(
        warningMinutes as (typeof WARNING_MINUTE_OPTIONS)[number]
      )
    ) {
      return {
        success: false,
        error: "Break warning time must be 1, 2, 3, or 5 minutes.",
      };
    }

    const testMinutes = Number(input.break_test_minutes);
    if (testMinutes < 1 || testMinutes > 10) {
      return {
        success: false,
        error: "Test break duration must be between 1 and 10 minutes.",
      };
    }

    if (warningMinutes >= testMinutes && input.break_test_mode) {
      return {
        success: false,
        error:
          "In test mode, warning time must be shorter than the test break duration.",
      };
    }

    const service = createServiceClient();
    const { settings: current, usedFallback } = await fetchOfficeSettingsRow().catch(
      () => ({
        settings: defaultOfficeSettings(),
        usedFallback: true,
      })
    );
    const settingsPayload = {
      id: 1,
      office_name: input.office_name.trim(),
      timezone: input.timezone.trim() || DEFAULT_TIMEZONE,
      default_break_minutes:
        Number(input.default_break_minutes) || current.default_break_minutes,
      break_warning_minutes: warningMinutes,
      break_test_mode: Boolean(input.break_test_mode),
      break_test_minutes: testMinutes,
      grace_period_minutes: current.grace_period_minutes,
      daily_max_breaks: current.daily_max_breaks,
      min_work_minutes_before_break: current.min_work_minutes_before_break,
      max_simultaneous_breaks: current.max_simultaneous_breaks,
      office_start_time: current.office_start_time || "09:00:00",
      office_end_time: current.office_end_time || "18:00:00",
      allow_weekend_breaks: current.allow_weekend_breaks,
      auto_end_breaks: current.auto_end_breaks,
      google_sheet_id: input.google_sheet_id?.trim() || null,
      google_sheet_name: input.google_sheet_name.trim() || "Break Records",
    };
    const minimalSettingsPayload = {
      id: 1,
      office_name: settingsPayload.office_name,
      timezone: settingsPayload.timezone,
      default_break_minutes: settingsPayload.default_break_minutes,
      google_sheet_id: settingsPayload.google_sheet_id,
      google_sheet_name: settingsPayload.google_sheet_name,
    };
    const payload = usedFallback ? minimalSettingsPayload : settingsPayload;

    let saved = await (
      service as unknown as {
        from: (t: string) => {
          upsert: (v: Record<string, unknown>) => {
            select: (c: string) => {
              single: () => Promise<{
                data: OfficeSettings | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from("office_settings")
      .upsert(payload)
      .select("*")
      .single();

    if (saved.error && "code" in saved.error && saved.error.code === "PGRST204") {
      saved = await (
        service as unknown as {
          from: (t: string) => {
            upsert: (v: Record<string, unknown>) => {
              select: (c: string) => {
                single: () => Promise<{
                  data: OfficeSettings | null;
                  error: { message: string; code?: string } | null;
                }>;
              };
            };
          };
        }
      )
        .from("office_settings")
        .upsert(minimalSettingsPayload)
        .select("*")
        .single();
    }

    const { data, error } = saved;

    if (error || !data) {
      console.error("[updateOfficeSettings]", error);
      return {
        success: false,
        error: error?.message
          ? `Unable to save settings: ${error.message}`
          : "Unable to save settings.",
      };
    }

    revalidatePath("/admin", "layout");
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/sheets");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard", "page");
    revalidatePath("/");
    revalidatePath("/admin/login");
    revalidateTag("office-settings");
    return {
      success: true,
      data: normalizeOfficeSettings(data),
      message: "Settings saved.",
    };
  } catch (err) {
    console.error("[updateOfficeSettings] unexpected", err);
    return { success: false, error: "Unable to save settings." };
  }
}
