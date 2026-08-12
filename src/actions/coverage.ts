"use server";

import { requireAdmin } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import type { CoverageRule, DepartmentCoverage, Employee } from "@/types/database";

export async function getDepartmentCoverage(): Promise<DepartmentCoverage[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const supabase = await createClient();
  const [{ data: employees }, { data: activeBreaks }, { data: rules }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, department, is_active, role")
        .eq("role", "employee")
        .eq("is_active", true),
      supabase
        .from("break_sessions")
        .select("id, employee:employees(department)")
        .eq("status", "active"),
      supabase.from("coverage_rules").select("*").eq("is_active", true),
    ]);

  const employeeRows = (employees ?? []) as Pick<
    Employee,
    "id" | "department" | "is_active" | "role"
  >[];
  const ruleRows = (rules ?? []) as CoverageRule[];
  const departments = new Set([
    ...employeeRows.map((employee) => employee.department || "General"),
    ...ruleRows.map((rule) => rule.department),
  ]);

  return Array.from(departments)
    .sort((a, b) => a.localeCompare(b))
    .map((department) => {
      const totalEmployees = employeeRows.filter(
        (employee) => employee.department === department
      ).length;
      const activeBreakCount = (activeBreaks ?? []).filter((row) => {
        const related = row.employee as
          | { department?: string }
          | { department?: string }[]
          | null;
        const rowDepartment = Array.isArray(related)
          ? related[0]?.department
          : related?.department;
        return rowDepartment === department;
      }).length;
      const rule = ruleRows.find((item) => item.department === department);
      const minimumAvailable = rule?.minimum_available ?? 1;
      const availableEmployees = Math.max(0, totalEmployees - activeBreakCount);
      const status =
        availableEmployees < minimumAvailable
          ? "low"
          : availableEmployees === minimumAvailable
            ? "tight"
            : "healthy";

      return {
        department,
        totalEmployees,
        activeBreaks: activeBreakCount,
        availableEmployees,
        minimumAvailable,
        maxOnBreak: rule?.max_on_break ?? null,
        status,
      };
    });
}

