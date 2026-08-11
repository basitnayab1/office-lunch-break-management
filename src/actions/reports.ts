"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/actions/auth";
import { getOfficeSettings } from "@/actions/settings";
import { todayInTimezone, monthRangeInTimezone } from "@/lib/time/timezone";
import { breakTypeLabel } from "@/lib/breaks/types";
import { toCsv } from "@/lib/utils";
import type {
  BreakSession,
  BreakType,
  DailyReport,
  MonthlyReportRow,
  TodayStats,
} from "@/types/database";

function emptyTypeStats(): DailyReport["byBreakType"] {
  return {
    breakfast: { count: 0, totalMinutes: 0, overtimeMinutes: 0 },
    coffee: { count: 0, totalMinutes: 0, overtimeMinutes: 0 },
    lunch: { count: 0, totalMinutes: 0, overtimeMinutes: 0 },
  };
}

export async function getTodayStats(): Promise<TodayStats> {
  const empty: TodayStats = {
    totalEmployees: 0,
    currentlyOnBreak: 0,
    completedBreaks: 0,
    employeesOverTime: 0,
    totalExtraMinutes: 0,
    breakfastCount: 0,
    coffeeCount: 0,
    lunchCount: 0,
  };

  try {
    await requireAdmin();
  } catch {
    return empty;
  }

  const supabase = await createClient();
  const settings = await getOfficeSettings();
  const today = todayInTimezone(settings.timezone);

  const [{ count: totalEmployees }, { data: active }, completedResult] =
    await Promise.all([
      supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("role", "employee"),
      supabase
        .from("break_sessions")
        .select("id")
        .eq("status", "active"),
      supabase
        .from("break_sessions")
        .select("*")
        .eq("break_date", today)
        .neq("status", "active"),
    ]);

  const completed = (completedResult.data ?? []) as BreakSession[];

  const completedBreaks = completed.length;
  const employeesOverTime = new Set(
    completed
      .filter((b) => b.status === "exceeded")
      .map((b) => b.employee_id)
  ).size;
  const totalExtraMinutes = completed.reduce(
    (sum, b) => sum + (Number(b.extra_minutes) || 0),
    0
  );

  return {
    totalEmployees: totalEmployees ?? 0,
    currentlyOnBreak: active?.length ?? 0,
    completedBreaks,
    employeesOverTime,
    totalExtraMinutes: Math.round(totalExtraMinutes * 100) / 100,
    breakfastCount: completed.filter((b) => b.break_type === "breakfast").length,
    coffeeCount: completed.filter((b) => b.break_type === "coffee").length,
    lunchCount: completed.filter((b) => b.break_type === "lunch").length,
  };
}

export async function getActiveBreaks(): Promise<BreakSession[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .eq("status", "active")
    .order("started_at", { ascending: true });

  return (data ?? []) as BreakSession[];
}

export async function getBreakHistory(filters: {
  date?: string;
  employeeId?: string;
  department?: string;
  breakType?: BreakType;
  status?: string;
  exceededOnly?: boolean;
}): Promise<BreakSession[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }
  const supabase = await createClient();

  let query = supabase
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .neq("status", "active")
    .order("started_at", { ascending: false })
    .limit(500);

  if (filters.date) {
    query = query.eq("break_date", filters.date);
  }
  if (filters.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }
  if (filters.breakType) {
    query = query.eq("break_type", filters.breakType);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.exceededOnly) {
    query = query.eq("status", "exceeded");
  }

  const { data } = await query;
  let rows = (data ?? []) as BreakSession[];

  if (filters.department) {
    rows = rows.filter(
      (r) => r.employee?.department === filters.department
    );
  }

  return rows;
}

export async function getDailyReport(date: string): Promise<DailyReport> {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .eq("break_date", date)
    .neq("status", "active");

  const breaks = (data ?? []) as BreakSession[];
  const totalBreaks = breaks.length;
  const averageBreakMinutes =
    totalBreaks === 0
      ? 0
      : Math.round(
          (breaks.reduce((s, b) => s + (Number(b.actual_minutes) || 0), 0) /
            totalBreaks) *
            100
        ) / 100;
  const totalOvertimeMinutes =
    Math.round(
      breaks.reduce((s, b) => s + (Number(b.extra_minutes) || 0), 0) * 100
    ) / 100;

  const byBreakType = emptyTypeStats();
  for (const b of breaks) {
    const key = b.break_type;
    if (!byBreakType[key]) continue;
    byBreakType[key].count += 1;
    byBreakType[key].totalMinutes += Number(b.actual_minutes) || 0;
    byBreakType[key].overtimeMinutes += Number(b.extra_minutes) || 0;
  }
  for (const key of Object.keys(byBreakType) as BreakType[]) {
    byBreakType[key].totalMinutes =
      Math.round(byBreakType[key].totalMinutes * 100) / 100;
    byBreakType[key].overtimeMinutes =
      Math.round(byBreakType[key].overtimeMinutes * 100) / 100;
  }

  const overtimeMap = new Map<
    string,
    { employee_id: string; full_name: string; department: string; extra_minutes: number }
  >();

  for (const b of breaks) {
    if ((b.extra_minutes ?? 0) <= 0 || !b.employee) continue;
    const key = b.employee_id;
    const prev = overtimeMap.get(key);
    overtimeMap.set(key, {
      employee_id: b.employee.employee_id,
      full_name: b.employee.full_name,
      department: b.employee.department,
      extra_minutes:
        Math.round(
          ((prev?.extra_minutes ?? 0) + Number(b.extra_minutes)) * 100
        ) / 100,
    });
  }

  return {
    date,
    totalBreaks,
    averageBreakMinutes,
    totalOvertimeMinutes,
    byBreakType,
    employeesWithOvertime: Array.from(overtimeMap.values()).sort(
      (a, b) => b.extra_minutes - a.extra_minutes
    ),
  };
}

export async function getMonthlyReport(
  year: number,
  month: number
): Promise<MonthlyReportRow[]> {
  await requireAdmin();
  const settings = await getOfficeSettings();
  const { start, endExclusive } = monthRangeInTimezone(
    settings.timezone,
    year,
    month
  );
  const supabase = await createClient();

  const { data } = await supabase
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .gte("break_date", start)
    .lt("break_date", endExclusive)
    .neq("status", "active");

  const breaks = (data ?? []) as BreakSession[];
  const map = new Map<string, MonthlyReportRow>();

  for (const b of breaks) {
    if (!b.employee) continue;
    const key = b.employee_id;
    const row = map.get(key) ?? {
      employee_id: b.employee.employee_id,
      full_name: b.employee.full_name,
      department: b.employee.department,
      totalBreakMinutes: 0,
      totalOvertimeMinutes: 0,
      exceededCount: 0,
      breakCount: 0,
      averageBreakMinutes: 0,
      breakfastCount: 0,
      coffeeCount: 0,
      lunchCount: 0,
      breakfastMinutes: 0,
      coffeeMinutes: 0,
      lunchMinutes: 0,
    };
    row.breakCount += 1;
    row.totalBreakMinutes += Number(b.actual_minutes) || 0;
    row.totalOvertimeMinutes += Number(b.extra_minutes) || 0;
    if (b.status === "exceeded") row.exceededCount += 1;
    if (b.break_type === "breakfast") {
      row.breakfastCount += 1;
      row.breakfastMinutes += Number(b.actual_minutes) || 0;
    } else if (b.break_type === "coffee") {
      row.coffeeCount += 1;
      row.coffeeMinutes += Number(b.actual_minutes) || 0;
    } else if (b.break_type === "lunch") {
      row.lunchCount += 1;
      row.lunchMinutes += Number(b.actual_minutes) || 0;
    }
    map.set(key, row);
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalBreakMinutes: Math.round(r.totalBreakMinutes * 100) / 100,
      totalOvertimeMinutes: Math.round(r.totalOvertimeMinutes * 100) / 100,
      breakfastMinutes: Math.round(r.breakfastMinutes * 100) / 100,
      coffeeMinutes: Math.round(r.coffeeMinutes * 100) / 100,
      lunchMinutes: Math.round(r.lunchMinutes * 100) / 100,
      averageBreakMinutes:
        r.breakCount === 0
          ? 0
          : Math.round((r.totalBreakMinutes / r.breakCount) * 100) / 100,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function exportBreakHistoryCsv(filters: {
  date?: string;
  employeeId?: string;
  department?: string;
  breakType?: BreakType;
  status?: string;
  exceededOnly?: boolean;
}): Promise<string> {
  const rows = await getBreakHistory(filters);
  return toCsv(
    rows.map((r) => ({
      Date: r.break_date,
      "Employee ID": r.employee?.employee_id ?? "",
      Employee: r.employee?.full_name ?? "",
      Department: r.employee?.department ?? "",
      "Break Type": breakTypeLabel(r.break_type),
      Start: r.started_at,
      End: r.ended_at,
      Allowed: r.allowed_minutes,
      Actual: r.actual_minutes,
      Extra: r.extra_minutes,
      Status: r.status,
      "Sheets Sync": r.google_sheet_sync_status,
    }))
  );
}

export async function exportDailyReportCsv(date: string): Promise<string> {
  const report = await getDailyReport(date);
  return toCsv([
    {
      Date: report.date,
      "Total Breaks": report.totalBreaks,
      "Average Minutes": report.averageBreakMinutes,
      "Total Overtime Minutes": report.totalOvertimeMinutes,
      "Breakfast Count": report.byBreakType.breakfast.count,
      "Coffee Count": report.byBreakType.coffee.count,
      "Lunch Count": report.byBreakType.lunch.count,
    },
    ...report.employeesWithOvertime.map((e) => ({
      Date: report.date,
      "Employee ID": e.employee_id,
      Employee: e.full_name,
      Department: e.department,
      "Extra Minutes": e.extra_minutes,
    })),
  ]);
}

export async function exportMonthlyReportCsv(
  year: number,
  month: number
): Promise<string> {
  const rows = await getMonthlyReport(year, month);
  return toCsv(
    rows.map((r) => ({
      "Employee ID": r.employee_id,
      Employee: r.full_name,
      Department: r.department,
      "Break Count": r.breakCount,
      Breakfast: r.breakfastCount,
      Coffee: r.coffeeCount,
      Lunch: r.lunchCount,
      "Breakfast Minutes": r.breakfastMinutes,
      "Coffee Minutes": r.coffeeMinutes,
      "Lunch Minutes": r.lunchMinutes,
      "Total Break Minutes": r.totalBreakMinutes,
      "Total Overtime Minutes": r.totalOvertimeMinutes,
      "Exceeded Breaks": r.exceededCount,
      "Average Break Minutes": r.averageBreakMinutes,
    }))
  );
}
