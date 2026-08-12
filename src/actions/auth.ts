"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Employee, EmployeeLoginOption } from "@/types/database";
import {
  getSessionEmployee,
  requireActiveEmployee,
  requireAdminSession,
} from "@/lib/auth/guards";
import { pinToAuthPassword } from "@/lib/auth/pin";
import { getPinLock, recordPinAttempt } from "@/lib/auth/rate-limit";
import { logAudit } from "@/actions/audit";

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

export async function listEmployeesForLogin(): Promise<
  ActionResult<EmployeeLoginOption[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_active_employees_for_login");

  if (error) {
    return { success: false, error: "Unable to load employees. Please try again." };
  }

  return { success: true, data: (data ?? []) as EmployeeLoginOption[] };
}

export async function loginWithPin(
  employeeId: string,
  pin: string
): Promise<ActionResult<{ role: string }>> {
  if (!employeeId || !pin) {
    return { success: false, error: "Please select your name and enter your PIN." };
  }

  const lock = await getPinLock(employeeId);
  if (lock.locked) {
    return {
      success: false,
      error: `Too many failed PIN attempts. Try again in ${lock.retryAfterMinutes} minute(s).`,
    };
  }

  const service = createServiceClient();
  const { data: employee, error } = await service
    .from("employees")
    .select("id, email, role, is_active, employee_id, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !employee) {
    await recordPinAttempt({
      identifier: employeeId,
      succeeded: false,
      reason: "employee_not_found",
    });
    return { success: false, error: "Employee not found." };
  }

  if (!employee.is_active) {
    return { success: false, error: "This account is inactive. Contact your admin." };
  }

  if (employee.role === "admin") {
    return {
      success: false,
      error: "Admin accounts must sign in at /admin/login.",
    };
  }

  if (!employee.email) {
    return { success: false, error: "Account is not configured for login." };
  }

  const supabase = await createClient();
  // Prefer prefixed Auth password (HIBP-safe). Fall back to legacy raw PIN.
  const primary = await supabase.auth.signInWithPassword({
    email: employee.email,
    password: pinToAuthPassword(pin),
  });

  if (primary.error) {
    const legacy = await supabase.auth.signInWithPassword({
      email: employee.email,
      password: pin,
    });
    if (legacy.error) {
      await recordPinAttempt({
        identifier: employee.id,
        employeeId: employee.id,
        succeeded: false,
        reason: "invalid_pin",
      });
      const postFailureLock = await getPinLock(employee.id);
      if (postFailureLock.locked) {
        await service.from("notifications").insert({
          recipient_id: null,
          audience: "admin",
          kind: "suspicious_pin_attempt",
          title: "PIN login locked",
          body: `${employee.full_name} reached the failed PIN attempt limit.`,
          entity_type: "employee",
          entity_id: employee.id,
        });
        await logAudit({
          actorId: employee.id,
          actorType: "employee",
          action: "pin_login_locked",
          targetType: "employee",
          targetId: employee.id,
          newData: { reason: "failed_pin_limit" },
        });
      }
      return { success: false, error: "Incorrect PIN. Please try again." };
    }
  }

  await recordPinAttempt({
    identifier: employee.id,
    employeeId: employee.id,
    succeeded: true,
  });
  await logAudit({
    actorId: employee.id,
    actorType: "employee",
    action: "employee_login",
    targetType: "employee",
    targetId: employee.id,
  });

  revalidatePath("/", "layout");
  return { success: true, data: { role: employee.role }, message: `Welcome, ${employee.full_name}` };
}

/**
 * Admin login via Supabase Auth email + password.
 * Role is checked from `employees` (profile) — never trust client claims.
 * Passwords are verified by Supabase Auth only (hashed); never stored in DB.
 */
export async function adminLogin(
  email: string,
  password: string
): Promise<ActionResult<{ role: string }>> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@") || !password) {
    return {
      success: false,
      error: "Admin email and password are required.",
    };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

  if (authError || !authData.user) {
    return { success: false, error: "Invalid admin credentials." };
  }

  const { data: profileData } = await supabase
    .from("employees")
    .select("id, full_name, role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  const profile = profileData as Pick<
    Employee,
    "id" | "full_name" | "role" | "is_active"
  > | null;

  if (!profile?.is_active || profile.role !== "admin") {
    await supabase.auth.signOut();
    return {
      success: false,
      error: "Access denied. This account is not an admin.",
    };
  }

  revalidatePath("/", "layout");
  await logAudit({
    actorId: profile.id,
    actorType: "admin",
    action: "admin_login",
    targetType: "employee",
    targetId: profile.id,
  });
  return {
    success: true,
    data: { role: "admin" },
    message: `Welcome, ${profile.full_name}`,
  };
}

export async function logout(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return { success: true, message: "Signed out." };
}

export async function getCurrentEmployee(): Promise<Employee | null> {
  const session = await getSessionEmployee();
  return session?.employee ?? null;
}

export async function requireEmployee(): Promise<Employee> {
  return requireActiveEmployee();
}

export async function requireAdmin(): Promise<Employee> {
  return requireAdminSession();
}
