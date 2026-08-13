"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Employee } from "@/types/database";
import {
  getSessionEmployee,
  requireActiveEmployee,
  requireAdminSession,
} from "@/lib/auth/guards";
import { isValidPin, pinToAuthPassword } from "@/lib/auth/pin";
import { getPinLock, recordPinAttempt } from "@/lib/auth/rate-limit";
import { logAudit } from "@/actions/audit";

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

const INVALID_EMPLOYEE_CREDENTIALS = "Invalid Employee ID or PIN.";

export async function loginWithPin(
  employeeIdInput: string,
  pinInput: string
): Promise<ActionResult<{ role: string }>> {
  const employeeId = employeeIdInput.trim();
  const pin = pinInput.trim();

  if (!employeeId || !pin) {
    return { success: false, error: "Employee ID and PIN are required." };
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
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error || !employee) {
    await recordPinAttempt({
      identifier: employeeId,
      succeeded: false,
      reason: "employee_not_found",
    });
    return { success: false, error: INVALID_EMPLOYEE_CREDENTIALS };
  }

  if (!employee.is_active) {
    await recordPinAttempt({
      identifier: employeeId,
      employeeId: employee.id,
      succeeded: false,
      reason: "inactive",
    });
    return { success: false, error: INVALID_EMPLOYEE_CREDENTIALS };
  }

  if (employee.role === "admin") {
    return {
      success: false,
      error: "Admin accounts must sign in at /admin/login.",
    };
  }

  if (!employee.email) {
    await recordPinAttempt({
      identifier: employeeId,
      employeeId: employee.id,
      succeeded: false,
      reason: "not_configured",
    });
    return { success: false, error: INVALID_EMPLOYEE_CREDENTIALS };
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
        identifier: employeeId,
        employeeId: employee.id,
        succeeded: false,
        reason: "invalid_pin",
      });
      const postFailureLock = await getPinLock(employeeId);
      if (postFailureLock.locked) {
        await logAudit({
          actorId: employee.id,
          actorType: "employee",
          action: "pin_login_locked",
          targetType: "employee",
          targetId: employee.id,
          newData: { reason: "failed_pin_limit" },
        });
      }
      return { success: false, error: INVALID_EMPLOYEE_CREDENTIALS };
    }
  }

  await recordPinAttempt({
    identifier: employeeId,
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

export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await getSessionEmployee();
  if (!session?.employee.email) {
    return { success: false, error: "Login session not found." };
  }
  const email = session.employee.email;

  const currentPassword = input.currentPassword.trim();
  const newPassword = input.newPassword.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "Current and new password are required." };
  }
  if (newPassword !== confirmPassword) {
    return { success: false, error: "New password confirmation does not match." };
  }

  const supabase = await createClient();
  const employee = session.employee;

  if (employee.role === "employee") {
    if (!isValidPin(currentPassword) || !isValidPin(newPassword)) {
      return { success: false, error: "Employee PIN must be exactly 4 digits." };
    }

    const primary = await supabase.auth.signInWithPassword({
      email,
      password: pinToAuthPassword(currentPassword),
    });
    if (primary.error) {
      const legacy = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (legacy.error) {
        return { success: false, error: "Current PIN is incorrect." };
      }
    }

    const { error } = await supabase.auth.updateUser({
      password: pinToAuthPassword(newPassword),
    });
    if (error) {
      return { success: false, error: `Unable to change PIN: ${error.message}` };
    }

    await logAudit({
      actorId: employee.id,
      actorType: "employee",
      action: "employee_pin_changed",
      targetType: "employee",
      targetId: employee.id,
      newData: { changed_by_self: true },
    });
    return { success: true, message: "PIN changed successfully." };
  }

  if (newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters." };
  }

  const verified = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verified.error) {
    return { success: false, error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { success: false, error: `Unable to change password: ${error.message}` };
  }

  await logAudit({
    actorId: employee.id,
    actorType: "admin",
    action: "admin_password_changed",
    targetType: "employee",
    targetId: employee.id,
    newData: { changed_by_self: true },
  });
  return { success: true, message: "Password changed successfully." };
}

/**
 * Records that the signed-in admin changed their own Auth password.
 * The password update itself runs on the browser Supabase client so it
 * uses the same session cookies as login. This action never receives
 * passwords and never uses the service role.
 */
export async function recordAdminPasswordChanged(): Promise<ActionResult> {
  let admin: Employee;
  try {
    admin = await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized. Admin access required." };
  }

  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_password_changed",
    targetType: "employee",
    targetId: admin.id,
    newData: { changed_by_self: true },
  });

  return { success: true };
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
