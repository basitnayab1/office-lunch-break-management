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
  DashboardAnalytics,
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

function addDaysToDateString(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function shortDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

type DashboardRange = DashboardAnalytics["range"];

function dashboardRangeMeta(range: DashboardRange, today: string) {
  if (range === "today") {
    return {
      start: today,
      end: today,
      title: "Today",
      days: 1,
    };
  }
  if (range === "this_month") {
    const start = `${today.slice(0, 7)}-01`;
    const days =
      Math.floor(
        (new Date(`${today}T00:00:00`).getTime() -
          new Date(`${start}T00:00:00`).getTime()) /
          86_400_000
      ) + 1;
    return {
      start,
      end: today,
      title: "This Month",
      days,
    };
  }
  if (range === "this_week") {
    const date = new Date(`${today}T00:00:00`);
    const mondayOffset = (date.getDay() + 6) % 7;
    const start = addDaysToDateString(today, -mondayOffset);
    return {
      start,
      end: today,
      title: "This Week",
      days: mondayOffset + 1,
    };
  }
  return {
    start: addDaysToDateString(today, -6),
    end: today,
    title: "Last 7 Days",
    days: 7,
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

export async function getDashboardAnalytics(
  range: DashboardRange = "this_week"
): Promise<DashboardAnalytics> {
  try {
    await requireAdmin();
  } catch {
    return {
      range,
      title: "This Week",
      weekActivity: [],
      breakTypeDistribution: { breakfast: 0, coffee: 0, lunch: 0 },
      todayByBreakType: { breakfast: 0, coffee: 0, lunch: 0 },
      weeklyTotalBreaks: 0,
    };
  }

  const settings = await getOfficeSettings();
  const today = todayInTimezone(settings.timezone);
  const meta = dashboardRangeMeta(range, today);
  const supabase = await createClient();
  const { data } = await supabase
    .from("break_sessions")
    .select("*")
    .gte("break_date", meta.start)
    .lte("break_date", meta.end)
    .neq("status", "active");

  const rows = (data ?? []) as BreakSession[];
  const dates = Array.from({ length: meta.days }, (_, index) =>
    addDaysToDateString(meta.start, index)
  );
  const distribution: Record<BreakType, number> = {
    breakfast: 0,
    coffee: 0,
    lunch: 0,
  };
  const todayByBreakType: Record<BreakType, number> = {
    breakfast: 0,
    coffee: 0,
    lunch: 0,
  };

  for (const row of rows) {
    distribution[row.break_type] += 1;
    if (row.break_date === today) {
      todayByBreakType[row.break_type] += 1;
    }
  }

  return {
    range,
    title: meta.title,
    weekActivity: dates.map((date) => ({
      date,
      label: shortDateLabel(date),
      completedBreaks: rows.filter((row) => row.break_date === date).length,
    })),
    breakTypeDistribution: distribution,
    todayByBreakType,
    weeklyTotalBreaks: rows.length,
  };
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

export async function exportAdvancedAnalyticsCsv(input: {
  startDate: string;
  endDate: string;
}): Promise<string> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .gte("break_date", input.startDate)
    .lte("break_date", input.endDate)
    .neq("status", "active")
    .order("started_at", { ascending: true });

  const breaks = (data ?? []) as BreakSession[];
  const departmentMap = new Map<
    string,
    {
      breaks: number;
      totalMinutes: number;
      overtimeMinutes: number;
      overtimeCount: number;
    }
  >();
  const employeeMap = new Map<
    string,
    {
      employeeId: string;
      employee: string;
      department: string;
      breaks: number;
      overtimeCount: number;
      overtimeMinutes: number;
      onTimeCount: number;
    }
  >();
  const hourMap = new Map<number, number>();

  for (const item of breaks) {
    const department = item.employee?.department ?? "Unassigned";
    const dept = departmentMap.get(department) ?? {
      breaks: 0,
      totalMinutes: 0,
      overtimeMinutes: 0,
      overtimeCount: 0,
    };
    dept.breaks += 1;
    dept.totalMinutes += Number(item.actual_minutes) || 0;
    dept.overtimeMinutes += Number(item.extra_minutes) || 0;
    if ((Number(item.extra_minutes) || 0) > 0) dept.overtimeCount += 1;
    departmentMap.set(department, dept);

    if (item.employee) {
      const employee = employeeMap.get(item.employee_id) ?? {
        employeeId: item.employee.employee_id,
        employee: item.employee.full_name,
        department,
        breaks: 0,
        overtimeCount: 0,
        overtimeMinutes: 0,
        onTimeCount: 0,
      };
      employee.breaks += 1;
      employee.overtimeMinutes += Number(item.extra_minutes) || 0;
      if ((Number(item.extra_minutes) || 0) > 0) {
        employee.overtimeCount += 1;
      } else {
        employee.onTimeCount += 1;
      }
      employeeMap.set(item.employee_id, employee);
    }

    const hour = new Date(item.started_at).getHours();
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
  }

  const totalBreaks = breaks.length || 1;
  const rows = [
    {
      Section: "Summary",
      Metric: "Total breaks",
      Name: "",
      Department: "",
      Value: breaks.length,
      Extra: "",
    },
    {
      Section: "Summary",
      Metric: "Overtime percentage",
      Name: "",
      Department: "",
      Value:
        Math.round(
          (breaks.filter((b) => (Number(b.extra_minutes) || 0) > 0).length /
            totalBreaks) *
            10000
        ) / 100,
      Extra: "%",
    },
    ...Array.from(departmentMap.entries()).map(([department, value]) => ({
      Section: "Department",
      Metric: "Comparison",
      Name: department,
      Department: department,
      Value: value.breaks,
      Extra: `avg=${Math.round((value.totalMinutes / value.breaks) * 100) / 100}; overtime=${Math.round(value.overtimeMinutes * 100) / 100}`,
    })),
    ...Array.from(hourMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hour, count]) => ({
        Section: "Peak Hours",
        Metric: "Break starts",
        Name: `${String(hour).padStart(2, "0")}:00`,
        Department: "",
        Value: count,
        Extra: "",
      })),
    ...Array.from(employeeMap.values())
      .sort((a, b) => b.overtimeMinutes - a.overtimeMinutes)
      .map((employee) => ({
        Section: "Employee",
        Metric: "Punctuality",
        Name: employee.employee,
        Department: employee.department,
        Value:
          Math.round((employee.onTimeCount / Math.max(1, employee.breaks)) * 10000) /
          100,
        Extra: `employee_id=${employee.employeeId}; breaks=${employee.breaks}; overtime_count=${employee.overtimeCount}; overtime_minutes=${Math.round(employee.overtimeMinutes * 100) / 100}`,
      })),
  ];

  return toCsv(rows);
}
