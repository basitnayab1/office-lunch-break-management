"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdmin, type ActionResult } from "@/actions/auth";
import { revalidatePath } from "next/cache";
import type { OfficeSettings } from "@/types/database";
import { DEFAULT_TIMEZONE } from "@/lib/time/timezone";

const WARNING_MINUTE_OPTIONS = [1, 2, 3, 5] as const;

function defaultSettings(): OfficeSettings {
  return {
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
  };
}

function normalizeSettings(row: Partial<OfficeSettings> | null): OfficeSettings {
  const base = defaultSettings();
  if (!row) return base;
  return {
    ...base,
    ...row,
    break_warning_minutes: row.break_warning_minutes ?? 2,
    break_test_mode: row.break_test_mode ?? false,
    break_test_minutes: row.break_test_minutes ?? 3,
  };
}

export async function getOfficeSettings(): Promise<OfficeSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("office_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return normalizeSettings(data as Partial<OfficeSettings> | null);
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
    const { data, error } = await (
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
      .upsert({
        id: 1,
        office_name: input.office_name.trim(),
        timezone: input.timezone.trim() || DEFAULT_TIMEZONE,
        default_break_minutes: input.default_break_minutes,
        break_warning_minutes: warningMinutes,
        break_test_mode: Boolean(input.break_test_mode),
        break_test_minutes: testMinutes,
        google_sheet_id: input.google_sheet_id?.trim() || null,
        google_sheet_name: input.google_sheet_name.trim() || "Break Records",
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("[updateOfficeSettings]", error);
      return {
        success: false,
        error: error?.message
          ? `Unable to save settings: ${error.message}`
          : "Unable to save settings.",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/sheets");
    revalidatePath("/dashboard");
    return {
      success: true,
      data: normalizeSettings(data),
      message: "Settings saved.",
    };
  } catch (err) {
    console.error("[updateOfficeSettings] unexpected", err);
    return { success: false, error: "Unable to save settings." };
  }
}
