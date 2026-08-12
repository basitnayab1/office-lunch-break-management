"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireEmployee, type ActionResult } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { AppNotification, NotificationKind } from "@/types/database";

export async function getMyNotifications(limit = 20): Promise<AppNotification[]> {
  const employee = await requireEmployee();
  const supabase = await createClient();
  const query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data } =
    employee.role === "admin"
      ? await query.or(`recipient_id.eq.${employee.id},audience.eq.admin`)
      : await query.eq("recipient_id", employee.id);

  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const employee = await requireEmployee();
  const service = createServiceClient();
  const { error } = await service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .or(`recipient_id.eq.${employee.id},audience.eq.admin`);

  if (error) {
    return { success: false, error: "Unable to mark notification as read." };
  }

  revalidatePath(employee.role === "admin" ? "/admin" : "/dashboard");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const employee = await requireEmployee();
  const service = createServiceClient();
  const query = service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  const { error } =
    employee.role === "admin"
      ? await query.or(`recipient_id.eq.${employee.id},audience.eq.admin`)
      : await query.eq("recipient_id", employee.id);

  if (error) {
    return { success: false, error: "Unable to mark notifications as read." };
  }

  revalidatePath(employee.role === "admin" ? "/admin" : "/dashboard");
  return { success: true };
}

export async function createEmployeeNotification(input: {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  const service = createServiceClient();
  await service.from("notifications").insert({
    recipient_id: input.recipientId,
    audience: "employee",
    kind: input.kind,
    title: input.title,
    body: input.body,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });
}

export async function createEmployeeNotificationOnce(input: {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  const service = createServiceClient();
  const query = service
    .from("notifications")
    .select("id")
    .eq("recipient_id", input.recipientId)
    .eq("kind", input.kind);

  const { data: existing } = input.entityId
    ? await query.eq("entity_id", input.entityId).maybeSingle()
    : await query.is("entity_id", null).maybeSingle();

  if (existing) return;
  await createEmployeeNotification(input);
}

export async function createAdminNotification(input: {
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  const service = createServiceClient();
  await service.from("notifications").insert({
    recipient_id: null,
    audience: "admin",
    kind: input.kind,
    title: input.title,
    body: input.body,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });
}

export async function createAdminNotificationOnce(input: {
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  const service = createServiceClient();
  const query = service
    .from("notifications")
    .select("id")
    .eq("audience", "admin")
    .eq("kind", input.kind);

  const { data: existing } = input.entityId
    ? await query.eq("entity_id", input.entityId).maybeSingle()
    : await query.is("entity_id", null).maybeSingle();

  if (existing) return;
  await createAdminNotification(input);
}


export async function createBreakReminderNotification(input: {
  breakSessionId: string;
  kind: "break_10_min_remaining" | "break_5_min_remaining" | "overtime_warning";
  title: string;
  body: string;
}): Promise<ActionResult> {
  const employee = await requireEmployee();
  const service = createServiceClient();
  const { data: active } = await service
    .from("break_sessions")
    .select("id, employee_id, status")
    .eq("id", input.breakSessionId)
    .eq("employee_id", employee.id)
    .eq("status", "active")
    .maybeSingle();

  if (!active) {
    return { success: false, error: "Active break not found." };
  }

  const { data: existing } = await service
    .from("notifications")
    .select("id")
    .eq("recipient_id", employee.id)
    .eq("kind", input.kind)
    .eq("entity_id", input.breakSessionId)
    .maybeSingle();

  if (existing) return { success: true };

  await createEmployeeNotification({
    recipientId: employee.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    entityType: "break_session",
    entityId: input.breakSessionId,
  });

  if (input.kind === "overtime_warning") {
    await createAdminNotification({
      kind: "admin_overtime_alert",
      title: `${employee.full_name} is overtime`,
      body: `${employee.department} break has exceeded allowed time.`,
      entityType: "break_session",
      entityId: input.breakSessionId,
    });
  }

  return { success: true };
}

export async function requireNotificationAdmin() {
  return requireAdmin();
}
