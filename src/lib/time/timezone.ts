import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

export const DEFAULT_TIMEZONE = "Asia/Karachi";

export function getOfficeDate(isoUtc: string | Date, timezone: string): string {
  return formatInTimeZone(isoUtc, timezone, "yyyy-MM-dd");
}

export function formatOfficeTime(
  isoUtc: string | Date,
  timezone: string,
  pattern = "h:mm a"
): string {
  return formatInTimeZone(isoUtc, timezone, pattern);
}

export function formatOfficeDateTime(
  isoUtc: string | Date,
  timezone: string
): string {
  return formatInTimeZone(isoUtc, timezone, "MMM d, yyyy h:mm a");
}

export function officeDateTimeInputToUtcIso(
  value: string,
  timezone: string
): string | null {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const utcDate = fromZonedTime(normalized, timezone);
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate.toISOString();
}

export function todayInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

export function monthRangeInTimezone(timezone: string, year: number, month: number) {
  // month is 1-12
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export function displayLocalPreview(date: Date, pattern = "PPpp"): string {
  return format(toZonedTime(date, DEFAULT_TIMEZONE), pattern);
}
