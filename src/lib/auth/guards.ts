import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/types/database";

export class AuthAccessError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthAccessError";
    this.status = status;
  }
}

function normalizeEmployee(
  row: Partial<Employee>,
  overrides: Partial<Employee> = {}
): Employee {
  return {
    id: row.id ?? "",
    employee_id: row.employee_id ?? "",
    full_name: row.full_name ?? "",
    email: row.email ?? null,
    department: row.department ?? "General",
    designation: row.designation ?? "",
    shift: row.shift ?? "General",
    allowed_break_minutes: row.allowed_break_minutes ?? 60,
    role: row.role ?? "employee",
    is_active: row.is_active ?? false,
    avatar_url: row.avatar_url ?? null,
    joining_date: row.joining_date ?? null,
    break_access_blocked_until: row.break_access_blocked_until ?? null,
    break_access_block_reason: row.break_access_block_reason ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Resolves the current session user to an employees row.
 * Uses getUser() (validated JWT), not getSession() alone.
 * Cached per request to avoid duplicate Auth/DB lookups.
 */
export async function getSessionEmployee(): Promise<{
  userId: string;
  employee: Employee;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select(
      "id, employee_id, full_name, email, department, allowed_break_minutes, role, is_active, created_at, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!employee) return null;
  return {
    userId: user.id,
    employee: normalizeEmployee(employee as Partial<Employee>, {
      avatar_url:
        typeof user.user_metadata?.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : null,
    }),
  };
}

/** Active employee session required. */
export async function requireActiveEmployee(): Promise<Employee> {
  const session = await getSessionEmployee();
  if (!session || !session.employee.is_active) {
    throw new AuthAccessError("Unauthorized", 401);
  }
  return session.employee;
}

/**
 * Active admin session required.
 * Used by server actions, layouts, and API routes — never rely on UI alone.
 */
export async function requireAdminSession(): Promise<Employee> {
  const employee = await requireActiveEmployee();
  if (employee.role !== "admin") {
    throw new AuthAccessError("Forbidden. Admin access required.", 403);
  }
  return employee;
}

export function isAuthAccessError(error: unknown): error is AuthAccessError {
  return error instanceof AuthAccessError;
}
