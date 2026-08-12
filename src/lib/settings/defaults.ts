import type { OfficeSettings } from "@/types/database";
import { DEFAULT_TIMEZONE, normalizeTimezone } from "@/lib/time/timezone";

export function defaultOfficeSettings(): OfficeSettings {
  return {
    id: 1,
    office_name: "Office",
    timezone: DEFAULT_TIMEZONE,
    default_break_minutes: 60,
    break_warning_minutes: 2,
    break_test_mode: false,
    break_test_minutes: 3,
    grace_period_minutes: 5,
    daily_max_breaks: 3,
    min_work_minutes_before_break: 0,
    max_simultaneous_breaks: 10,
    office_start_time: "09:00:00",
    office_end_time: "18:00:00",
    allow_weekend_breaks: false,
    auto_end_breaks: false,
    google_sheet_id: null,
    google_sheet_name: "Break Records",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function normalizeOfficeSettings(
  row: Partial<OfficeSettings> | null
): OfficeSettings {
  const base = defaultOfficeSettings();
  if (!row) return base;
  return {
    ...base,
    ...row,
    office_name: row.office_name?.trim() || base.office_name,
    timezone: normalizeTimezone(row.timezone) || base.timezone || DEFAULT_TIMEZONE,
    break_warning_minutes: row.break_warning_minutes ?? base.break_warning_minutes,
    break_test_mode: row.break_test_mode ?? base.break_test_mode,
    break_test_minutes: row.break_test_minutes ?? base.break_test_minutes,
    grace_period_minutes: row.grace_period_minutes ?? base.grace_period_minutes,
    daily_max_breaks: row.daily_max_breaks ?? base.daily_max_breaks,
    min_work_minutes_before_break:
      row.min_work_minutes_before_break ?? base.min_work_minutes_before_break,
    max_simultaneous_breaks:
      row.max_simultaneous_breaks ?? base.max_simultaneous_breaks,
    office_start_time: row.office_start_time || base.office_start_time,
    office_end_time: row.office_end_time || base.office_end_time,
    allow_weekend_breaks: row.allow_weekend_breaks ?? base.allow_weekend_breaks,
    auto_end_breaks: row.auto_end_breaks ?? base.auto_end_breaks,
    google_sheet_name: row.google_sheet_name?.trim() || base.google_sheet_name,
  };
}
