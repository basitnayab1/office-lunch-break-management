"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdmin, type ActionResult } from "@/actions/auth";
import { generateTemporaryPin, isValidPin } from "@/lib/auth/pin";
import { revalidatePath } from "next/cache";
import type { Employee, UserRole } from "@/types/database";
import {
  AuthAccessError,
  isAuthAccessError,
} from "@/lib/auth/guards";

export type EmployeeWithTempPin = {
  employee: Employee;
  temporaryPin: string;
  pinWasGenerated: boolean;
};

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function formatSupabaseError(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null
): string {
  if (!error) return "Unknown Supabase error";
  const parts = [
    error.message,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function employeeSelect() {
  return "id, employee_id, full_name, email, department, allowed_break_minutes, role, is_active, created_at, updated_at";
}

function buildEmployeeEmail(
  employeeId: string,
  email?: string
): { email: string } | { error: string } {
  const provided = email?.trim().toLowerCase();
  if (provided) {
    if (!provided.includes("@")) {
      return { error: "Email must include @." };
    }
    return { email: provided };
  }

  const local = employeeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._+-]/g, "");

  if (!local) {
    return {
      error:
        "Employee ID must contain letters or numbers so a login email can be generated.",
    };
  }

  return { email: `${local}@office.local` };
}

export async function listEmployees(): Promise<Employee[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select(employeeSelect())
    .order("full_name");
  return (data ?? []) as Employee[];
}

export async function createEmployee(input: {
  full_name: string;
  employee_id: string;
  email?: string;
  department: string;
  role: "employee" | "admin";
  pin?: string;
  is_active?: boolean;
}): Promise<ActionResult<EmployeeWithTempPin>> {
  try {
    await requireAdmin();
  } catch (error) {
    console.error("[createEmployee] admin auth failed:", error);
    if (isAuthAccessError(error)) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unauthorized. Admin access required." };
  }

  let createdAuthUserId: string | null = null;

  try {
    if (!input.full_name.trim() || !input.employee_id.trim()) {
      return { success: false, error: "Name and Employee ID are required." };
    }

    if (!input.department.trim()) {
      return { success: false, error: "Department is required." };
    }

    const role: UserRole = input.role === "admin" ? "admin" : "employee";
    const isActive = input.is_active ?? true;

    const providedPin = input.pin?.trim() ?? "";
    const pinWasGenerated = !providedPin;
    const temporaryPin = providedPin || generateTemporaryPin();

    if (!isValidPin(temporaryPin)) {
      return {
        success: false,
        error: "PIN must be exactly 4 digits.",
      };
    }

    const emailResult = buildEmployeeEmail(
      input.employee_id,
      input.email
    );
    if ("error" in emailResult) {
      return { success: false, error: emailResult.error };
    }
    const email = emailResult.email;

    let service;
    try {
      service = createServiceClient();
    } catch (error) {
      const message = formatUnknownError(error);
      console.error("[createEmployee] service client error:", message);
      return {
        success: false,
        error: `Supabase service role not configured: ${message}`,
      };
    }

    // Pre-check unique employee_id (clearer than failing after Auth user create)
    const { data: existingId, error: existingIdError } = await service
      .from("employees")
      .select("id")
      .eq("employee_id", input.employee_id.trim())
      .maybeSingle();

    if (existingIdError) {
      const message = formatSupabaseError(existingIdError);
      console.error("[createEmployee] employee_id precheck failed:", message);
      return { success: false, error: message };
    }
    if (existingId) {
      return { success: false, error: "Employee ID already exists." };
    }

    // PIN is stored hashed by Supabase Auth — never plain-text in employees.
    const { data: authUser, error: authError } =
      await service.auth.admin.createUser({
        email,
        password: temporaryPin,
        email_confirm: true,
        user_metadata: {
          full_name: input.full_name.trim(),
          department: input.department.trim(),
        },
      });

    if (authError || !authUser.user) {
      const message = authError
        ? `Supabase Auth: ${authError.message}${
            (authError as { code?: string }).code
              ? ` (code=${(authError as { code?: string }).code})`
              : ""
          }`
        : "Supabase Auth: createUser returned no user.";
      console.error("[createEmployee] createUser failed:", authError);
      return {
        success: false,
        error: authError?.message?.toLowerCase().includes("already")
          ? `An account with email ${email} already exists in Supabase Auth.`
          : message,
      };
    }

    createdAuthUserId = authUser.user.id;

    const profilePayload = {
      id: authUser.user.id,
      employee_id: input.employee_id.trim(),
      full_name: input.full_name.trim(),
      email,
      department: input.department.trim() || "General",
      allowed_break_minutes: 60,
      role,
      is_active: isActive,
    };

    // Auth trigger (004) may already insert a stub row (USR-...).
    // Prefer update-then-insert so we surface precise DB errors.
    const { data: existingProfile } = await service
      .from("employees")
      .select("id")
      .eq("id", authUser.user.id)
      .maybeSingle();

    let data: Employee | null = null;
    let error: {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    } | null = null;

    if (existingProfile) {
      const updated = await service
        .from("employees")
        .update({
          employee_id: profilePayload.employee_id,
          full_name: profilePayload.full_name,
          email: profilePayload.email,
          department: profilePayload.department,
          allowed_break_minutes: profilePayload.allowed_break_minutes,
          role: profilePayload.role,
          is_active: profilePayload.is_active,
        })
        .eq("id", authUser.user.id)
        .select(employeeSelect())
        .single();
      data = updated.data as Employee | null;
      error = updated.error;
    } else {
      const inserted = await service
        .from("employees")
        .insert(profilePayload)
        .select(employeeSelect())
        .single();
      data = inserted.data as Employee | null;
      error = inserted.error;
    }

    if (error || !data) {
      const message = error
        ? formatSupabaseError(error)
        : "employees insert/update returned no row.";
      console.error("[createEmployee] employees write failed:", error);

      if (createdAuthUserId) {
        const { error: cleanupError } =
          await service.auth.admin.deleteUser(createdAuthUserId);
        if (cleanupError) {
          console.error(
            "[createEmployee] auth cleanup failed:",
            cleanupError.message
          );
        }
      }

      if (error?.code === "23505") {
        return {
          success: false,
          error: `Duplicate value: ${message}`,
        };
      }

      return { success: false, error: message };
    }

    revalidatePath("/admin/employees");
    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      data: {
        employee: data,
        temporaryPin,
        pinWasGenerated,
      },
      message: "Employee created successfully",
    };
  } catch (error) {
    console.error("[createEmployee] unexpected error:", error);

    if (createdAuthUserId) {
      try {
        const service = createServiceClient();
        await service.auth.admin.deleteUser(createdAuthUserId);
      } catch (cleanupError) {
        console.error("[createEmployee] auth cleanup failed:", cleanupError);
      }
    }

    if (error instanceof AuthAccessError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: `Unable to create employee: ${formatUnknownError(error)}`,
    };
  }
}

export async function updateEmployee(
  id: string,
  input: {
    full_name: string;
    employee_id: string;
    email?: string | null;
    department: string;
    role: "employee" | "admin";
    is_active: boolean;
  }
): Promise<ActionResult<Employee>> {
  try {
    await requireAdmin();
  } catch (error) {
    console.error("[updateEmployee] admin auth failed:", error);
    return {
      success: false,
      error: isAuthAccessError(error)
        ? error.message
        : "Unauthorized. Admin access required.",
    };
  }

  try {
    const service = createServiceClient();

    const { data, error } = await service
      .from("employees")
      .update({
        full_name: input.full_name.trim(),
        employee_id: input.employee_id.trim(),
        email: input.email?.trim().toLowerCase() || null,
        department: input.department.trim(),
        role: input.role,
        is_active: input.is_active,
      })
      .eq("id", id)
      .select(employeeSelect())
      .single();

    if (error) {
      const message = formatSupabaseError(error);
      console.error("[updateEmployee] failed:", message);
      return {
        success: false,
        error:
          error.code === "23505"
            ? `Employee ID already exists. (${message})`
            : message,
      };
    }

    revalidatePath("/admin/employees");
    revalidatePath("/");
    return {
      success: true,
      data: data as unknown as Employee,
      message: "Employee updated.",
    };
  } catch (error) {
    console.error("[updateEmployee] unexpected error:", error);
    return {
      success: false,
      error: `Unable to update employee: ${formatUnknownError(error)}`,
    };
  }
}

/**
 * Generates a new temporary PIN and sets it as the Auth password.
 * Old PINs cannot be retrieved (hashed). Returns the new PIN once.
 */
export async function resetEmployeePin(
  id: string
): Promise<ActionResult<{ temporaryPin: string; employee: Employee }>> {
  try {
    await requireAdmin();
  } catch (error) {
    console.error("[resetEmployeePin] admin auth failed:", error);
    return {
      success: false,
      error: isAuthAccessError(error)
        ? error.message
        : "Unauthorized. Admin access required.",
    };
  }

  try {
    const service = createServiceClient();
    const { data: employee, error: findError } = await service
      .from("employees")
      .select(employeeSelect())
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      const message = formatSupabaseError(findError);
      console.error("[resetEmployeePin] lookup failed:", message);
      return { success: false, error: message };
    }

    if (!employee) {
      return { success: false, error: "Employee not found." };
    }

    const temporaryPin = generateTemporaryPin();
    const { error } = await service.auth.admin.updateUserById(id, {
      password: temporaryPin,
    });

    if (error) {
      console.error("[resetEmployeePin] Auth update failed:", error);
      return {
        success: false,
        error: `Supabase Auth: ${error.message}`,
      };
    }

    return {
      success: true,
      data: {
        temporaryPin,
        employee: employee as unknown as Employee,
      },
      message: "New temporary PIN generated.",
    };
  } catch (error) {
    console.error("[resetEmployeePin] unexpected error:", error);
    return {
      success: false,
      error: `Unable to reset PIN: ${formatUnknownError(error)}`,
    };
  }
}

export async function setEmployeeActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (error) {
    console.error("[setEmployeeActive] admin auth failed:", error);
    return {
      success: false,
      error: isAuthAccessError(error)
        ? error.message
        : "Unauthorized. Admin access required.",
    };
  }

  try {
    const service = createServiceClient();
    const { error } = await service
      .from("employees")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      const message = formatSupabaseError(error);
      console.error("[setEmployeeActive] failed:", message);
      return { success: false, error: message };
    }

    revalidatePath("/admin/employees");
    revalidatePath("/");
    return {
      success: true,
      message: isActive ? "Employee activated." : "Employee deactivated.",
    };
  } catch (error) {
    console.error("[setEmployeeActive] unexpected error:", error);
    return {
      success: false,
      error: `Unable to update status: ${formatUnknownError(error)}`,
    };
  }
}
