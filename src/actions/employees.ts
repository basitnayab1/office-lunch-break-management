"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdmin, requireEmployee, type ActionResult } from "@/actions/auth";
import { generateTemporaryPin, isValidPin, pinToAuthPassword, isLikelyLeakedPasswordError } from "@/lib/auth/pin";
import { revalidatePath } from "next/cache";
import type { Employee, UserRole } from "@/types/database";
import {
  AuthAccessError,
  isAuthAccessError,
} from "@/lib/auth/guards";
import { logAudit } from "@/actions/audit";

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

const ADMIN_PASSWORD_MIN_LENGTH = 8;

function isExistingAccountError(message?: string, code?: string): boolean {
  const lower = (message ?? "").toLowerCase();
  const errorCode = (code ?? "").toLowerCase();
  return (
    errorCode === "email_exists" ||
    errorCode === "user_already_exists" ||
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("already exists") ||
    lower.includes("user already exists")
  );
}

function safeCreateAdminAuthMessage(error: {
  message?: string;
  code?: string;
} | null): string {
  const raw = (error?.message ?? "Unable to create admin account.").replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[redacted]"
  );
  if (isExistingAccountError(raw, error?.code)) {
    return "An account with this email already exists.";
  }
  if (isLikelyLeakedPasswordError(raw)) {
    return "That password appears in known data breaches. Please choose a stronger password.";
  }
  const code = (error?.code ?? "").toLowerCase();
  if (code === "weak_password" || raw.toLowerCase().includes("password should be")) {
    return raw.length < 200 ? raw : "Password is too weak. Choose a stronger password.";
  }
  if (raw.length < 180 && !/token|secret|apikey|authorization/i.test(raw)) {
    return raw;
  }
  return "Unable to create admin account.";
}

async function allocateAdminEmployeeId(
  service: ReturnType<typeof createServiceClient>,
  requested: string,
  email: string
): Promise<{ employeeId: string } | { error: string }> {
  const trimmed = requested.trim();
  if (trimmed) {
    const { data, error } = await service
      .from("employees")
      .select("id")
      .eq("employee_id", trimmed)
      .maybeSingle();
    if (error) return { error: formatSupabaseError(error) };
    if (data) return { error: "Employee ID already exists." };
    return { employeeId: trimmed };
  }

  const local =
    email
      .split("@")[0]
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 12) || "USER";
  const base = `ADMIN-${local}`;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base}-${Math.floor(10 + Math.random() * 90)}`;
    const { data, error } = await service
      .from("employees")
      .select("id")
      .eq("employee_id", candidate)
      .maybeSingle();
    if (error) return { error: formatSupabaseError(error) };
    if (!data) return { employeeId: candidate };
  }

  return { error: "Unable to allocate a unique Employee ID. Please enter one." };
}

async function createAdminEmployee(
  actor: Employee,
  input: {
    full_name: string;
    employee_id: string;
    email?: string;
    department: string;
    password?: string;
    confirmPassword?: string;
    is_active?: boolean;
  }
): Promise<ActionResult<EmployeeWithTempPin>> {
  const fullName = input.full_name.trim();
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";
  const confirmPassword = input.confirmPassword ?? "";
  const department = input.department.trim() || "General";
  const isActive = input.is_active ?? true;

  if (!fullName) {
    return { success: false, error: "Full name is required." };
  }
  if (!department.trim()) {
    return { success: false, error: "Department is required." };
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    return { success: false, error: "A valid email address is required." };
  }
  if (!password) {
    return { success: false, error: "Password is required." };
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (!confirmPassword) {
    return { success: false, error: "Please confirm the password." };
  }
  if (password !== confirmPassword) {
    return { success: false, error: "Password and confirmation do not match." };
  }

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

  const { data: existingEmail, error: existingEmailError } = await service
    .from("employees")
    .select("id")
    .ilike("email", email.replace(/[%_]/g, "\\$&"))
    .maybeSingle();

  if (existingEmailError) {
    return { success: false, error: formatSupabaseError(existingEmailError) };
  }
  if (existingEmail) {
    return { success: false, error: "An account with this email already exists." };
  }

  const employeeIdResult = await allocateAdminEmployeeId(
    service,
    input.employee_id,
    email
  );
  if ("error" in employeeIdResult) {
    return { success: false, error: employeeIdResult.error };
  }

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      department,
    },
  });

  if (created.error || !created.data.user?.id) {
    console.error("[createEmployee] createUser failed:", {
      code: created.error?.code ?? null,
      message: created.error?.message ?? null,
    });
    return {
      success: false,
      error: safeCreateAdminAuthMessage(created.error),
    };
  }

  const createdUserId = created.data.user.id;

  const profilePayload = {
    id: createdUserId,
    employee_id: employeeIdResult.employeeId,
    full_name: fullName,
    email,
    department,
    allowed_break_minutes: 60,
    role: "admin" as UserRole,
    is_active: isActive,
  };

  const { data: existingProfile } = await service
    .from("employees")
    .select("id")
    .eq("id", createdUserId)
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
      .eq("id", createdUserId)
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

    const { error: cleanupError } =
      await service.auth.admin.deleteUser(createdUserId);
    if (cleanupError) {
      console.error(
        "[createEmployee] auth cleanup failed:",
        cleanupError.message
      );
      return {
        success: false,
        error:
          "Admin Auth account was created but the employee profile could not be saved, and automatic cleanup failed. Do not retry with the same email until this is resolved.",
      };
    }

    return {
      success: false,
      error: `Admin profile could not be saved (${message}). The Auth user was removed. Please try again.`,
    };
  }

  if (data.role !== "admin" || data.id !== createdUserId) {
    const { error: cleanupError } =
      await service.auth.admin.deleteUser(createdUserId);
    if (cleanupError) {
      console.error(
        "[createEmployee] auth cleanup failed:",
        cleanupError.message
      );
    }
    return {
      success: false,
      error: "Admin profile was not saved with the Auth user id. Please try again.",
    };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/");
  revalidatePath("/admin");

  const normalized = normalizeEmployee(data);

  await logAudit({
    actorId: actor.id,
    actorType: "admin",
    action: "admin_created",
    targetType: "employee",
    targetId: data.id,
    newData: {
      id: normalized.id,
      employee_id: normalized.employee_id,
      full_name: normalized.full_name,
      email: normalized.email,
      department: normalized.department,
      role: normalized.role,
      is_active: normalized.is_active,
    },
  });

  return {
    success: true,
    data: {
      employee: normalized,
      temporaryPin: "",
      pinWasGenerated: false,
    },
    message:
      "Admin created successfully. They can sign in at Admin Login with their email and password.",
  };
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
  return ((data ?? []) as Partial<Employee>[]).map((row) =>
    normalizeEmployee(row)
  );
}

export async function createEmployee(input: {
  full_name: string;
  employee_id: string;
  email?: string;
  department: string;
  role: "employee" | "admin";
  pin?: string;
  password?: string;
  confirmPassword?: string;
  is_active?: boolean;
}): Promise<ActionResult<EmployeeWithTempPin>> {
  let admin: Employee;
  try {
    admin = await requireAdmin();
  } catch (error) {
    console.error("[createEmployee] admin auth failed:", error);
    if (isAuthAccessError(error)) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unauthorized. Admin access required." };
  }

  let createdAuthUserId: string | null = null;

  try {
    if (input.role === "admin") {
      return await createAdminEmployee(admin, input);
    }

    if (!input.full_name.trim() || !input.employee_id.trim()) {
      return { success: false, error: "Name and Employee ID are required." };
    }

    if (!input.department.trim()) {
      return { success: false, error: "Department is required." };
    }

    const role: UserRole = "employee";
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
    // Auth password uses a prefixed form so HIBP can stay enabled for admin passwords.
    let authPassword = pinToAuthPassword(temporaryPin);
    let workingPin = temporaryPin;
    let createdUserId: string | null = null;
    let authError: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await service.auth.admin.createUser({
        email,
        password: authPassword,
        email_confirm: true,
        user_metadata: {
          full_name: input.full_name.trim(),
          department: input.department.trim(),
        },
      });
      authError = created.error;
      createdUserId = created.data.user?.id ?? null;

      if (!authError && createdUserId) break;

      if (
        pinWasGenerated &&
        isLikelyLeakedPasswordError(authError?.message) &&
        attempt < 4
      ) {
        workingPin = generateTemporaryPin();
        authPassword = pinToAuthPassword(workingPin);
        continue;
      }
      break;
    }

    if (authError || !createdUserId) {
      const message = authError
        ? `Supabase Auth: ${authError.message}${
            authError.code ? ` (code=${authError.code})` : ""
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

    const finalPin = workingPin;
    createdAuthUserId = createdUserId;

    const profilePayload = {
      id: createdUserId,
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
      .eq("id", createdUserId)
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
        .eq("id", createdUserId)
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

    const normalized = normalizeEmployee(data);

    await logAudit({
      actorId: admin.id,
      actorType: "admin",
      action: "employee_created",
      targetType: "employee",
      targetId: data.id,
      newData: normalized,
    });

    return {
      success: true,
      data: {
        employee: normalized,
        temporaryPin: finalPin,
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
  let admin: Employee;
  try {
    admin = await requireAdmin();
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
    const { data: before } = await service
      .from("employees")
      .select(employeeSelect())
      .eq("id", id)
      .maybeSingle();

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
    const normalized = normalizeEmployee(data as Partial<Employee>);

    await logAudit({
      actorId: admin.id,
      actorType: "admin",
      action: "employee_updated",
      targetType: "employee",
      targetId: id,
      oldData: before ? normalizeEmployee(before as Partial<Employee>) : null,
      newData: normalized,
    });
    return {
      success: true,
      data: normalized,
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

type AdminProfileInput = {
  full_name: string;
  profile_image_file?: File | null;
};

async function uploadProfileImage(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  file: File | null
): Promise<ActionResult<string | null>> {
  if (!file || file.size <= 0) return { success: true, data: null };

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Profile picture must be an image file." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { success: false, error: "Profile picture must be 2 MB or smaller." };
  }

  const bucket = "profile-images";
  const { error: bucketError } = await service.storage.createBucket(bucket, {
    public: true,
  });
  if (
    bucketError &&
    !bucketError.message.toLowerCase().includes("already exists")
  ) {
    console.error("[uploadProfileImage] bucket create failed:", bucketError);
    return { success: false, error: bucketError.message };
  }

  const extension =
    file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() ||
    "png";
  const objectPath = `${userId}/${Date.now()}.${extension}`;
  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    const alreadyExists = uploadError.message.toLowerCase().includes("already exists");
    if (!alreadyExists) {
      console.error("[uploadProfileImage] image upload failed:", uploadError);
      return { success: false, error: uploadError.message };
    }
  }

  const { data: publicUrl } = service.storage.from(bucket).getPublicUrl(objectPath);
  return { success: true, data: publicUrl.publicUrl };
}

export async function updateMyAdminProfile(
  input: AdminProfileInput | FormData
): Promise<ActionResult<Employee>> {
  let admin: Employee;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return {
      success: false,
      error: isAuthAccessError(error)
        ? error.message
        : "Unauthorized. Admin access required.",
    };
  }

  const fullName =
    input instanceof FormData
      ? String(input.get("full_name") ?? "").trim()
      : input.full_name.trim();
  const profileImageFile =
    input instanceof FormData
      ? input.get("profile_image_file")
      : input.profile_image_file;

  if (fullName.length < 2) {
    return { success: false, error: "Profile name must be at least 2 characters." };
  }

  try {
    const service = createServiceClient();
    const imageFile = profileImageFile instanceof File ? profileImageFile : null;
    const uploaded = await uploadProfileImage(service, admin.id, imageFile);
    if (!uploaded.success) return uploaded;
    const imageUrl = uploaded.data ?? admin.avatar_url ?? null;

    const { data: before } = await service
      .from("employees")
      .select(employeeSelect())
      .eq("id", admin.id)
      .maybeSingle();

    const { data, error } = await service
      .from("employees")
      .update({ full_name: fullName })
      .eq("id", admin.id)
      .select(employeeSelect())
      .single();

    if (error || !data) {
      const message = error
        ? formatSupabaseError(error)
        : "Profile update returned no row.";
      console.error("[updateMyAdminProfile] failed:", message);
      return { success: false, error: message };
    }

    await service.auth.admin.updateUserById(admin.id, {
      user_metadata: {
        full_name: fullName,
        avatar_url: imageUrl,
      },
    });

    const normalized = normalizeEmployee(data as Partial<Employee>, {
      avatar_url: imageUrl,
    });

    await logAudit({
      actorId: admin.id,
      actorType: "admin",
      action: "admin_profile_updated",
      targetType: "employee",
      targetId: admin.id,
      oldData: before ? normalizeEmployee(before as Partial<Employee>) : null,
      newData: normalized,
    });

    revalidatePath("/admin", "layout");
    revalidatePath("/admin/settings");
    return {
      success: true,
      data: normalized,
      message: "Profile updated.",
    };
  } catch (error) {
    console.error("[updateMyAdminProfile] unexpected error:", error);
    return {
      success: false,
      error: `Unable to update profile: ${formatUnknownError(error)}`,
    };
  }
}

export async function updateMyEmployeeProfile(
  input: FormData
): Promise<ActionResult<Employee>> {
  let employee: Employee;
  try {
    employee = await requireEmployee();
  } catch (error) {
    return {
      success: false,
      error: isAuthAccessError(error) ? error.message : "Unauthorized.",
    };
  }

  const fullName = String(input.get("full_name") ?? "").trim();
  const email = String(input.get("email") ?? "").trim().toLowerCase();
  const profileImageFile = input.get("profile_image_file");

  if (fullName.length < 2) {
    return { success: false, error: "Profile name must be at least 2 characters." };
  }
  if (!email || !email.includes("@")) {
    return { success: false, error: "Please enter a valid real email address." };
  }

  try {
    const service = createServiceClient();
    const imageFile = profileImageFile instanceof File ? profileImageFile : null;
    const uploaded = await uploadProfileImage(service, employee.id, imageFile);
    if (!uploaded.success) return uploaded;
    const imageUrl = uploaded.data ?? employee.avatar_url ?? null;

    const { data: before } = await service
      .from("employees")
      .select(employeeSelect())
      .eq("id", employee.id)
      .maybeSingle();

    const { data, error } = await service
      .from("employees")
      .update({ full_name: fullName, email })
      .eq("id", employee.id)
      .select(employeeSelect())
      .single();

    if (error || !data) {
      const message = error
        ? formatSupabaseError(error)
        : "Profile update returned no row.";
      console.error("[updateMyEmployeeProfile] failed:", message);
      return { success: false, error: message };
    }

    const { error: authUpdateError } = await service.auth.admin.updateUserById(employee.id, {
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        avatar_url: imageUrl,
      },
    });
    if (authUpdateError) {
      console.error("[updateMyEmployeeProfile] auth update failed:", authUpdateError);
      const previousEmail =
        (before as Partial<Employee> | null)?.email ?? employee.email;
      await service
        .from("employees")
        .update({ email: previousEmail })
        .eq("id", employee.id);
      return {
        success: false,
        error: `Unable to update login email: ${authUpdateError.message}`,
      };
    }

    const normalized = normalizeEmployee(data as Partial<Employee>, {
      avatar_url: imageUrl,
    });

    await logAudit({
      actorId: employee.id,
      actorType: employee.role,
      action: "employee_profile_updated",
      targetType: "employee",
      targetId: employee.id,
      oldData: before ? normalizeEmployee(before as Partial<Employee>) : null,
      newData: normalized,
    });

    revalidatePath("/dashboard");
    return {
      success: true,
      data: normalized,
      message: "Profile updated.",
    };
  } catch (error) {
    console.error("[updateMyEmployeeProfile] unexpected error:", error);
    return {
      success: false,
      error: `Unable to update profile: ${formatUnknownError(error)}`,
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
  let admin: Employee;
  try {
    admin = await requireAdmin();
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
    let authPassword = pinToAuthPassword(temporaryPin);
    let workingPin = temporaryPin;
    let error: { message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const updated = await service.auth.admin.updateUserById(id, {
        password: authPassword,
      });
      error = updated.error;
      if (!error) break;
      if (isLikelyLeakedPasswordError(error.message) && attempt < 4) {
        workingPin = generateTemporaryPin();
        authPassword = pinToAuthPassword(workingPin);
        continue;
      }
      break;
    }

    if (error) {
      console.error("[resetEmployeePin] Auth update failed:", error);
      return {
        success: false,
        error: `Supabase Auth: ${error.message}`,
      };
    }

    await logAudit({
      actorId: admin.id,
      actorType: "admin",
      action: "employee_pin_reset",
      targetType: "employee",
      targetId: id,
      newData: { pin_reset: true },
    });

    return {
      success: true,
      data: {
        temporaryPin: workingPin,
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
  let admin: Employee;
  try {
    admin = await requireAdmin();
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
      const { data: before } = await service
        .from("employees")
        .select(employeeSelect())
        .eq("id", id)
        .maybeSingle();
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
    await logAudit({
      actorId: admin.id,
      actorType: "admin",
      action: isActive ? "employee_activated" : "employee_deactivated",
      targetType: "employee",
      targetId: id,
      oldData: before as unknown as Employee | null,
      newData: { is_active: isActive },
    });
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
