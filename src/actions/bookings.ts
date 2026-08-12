"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireEmployee, type ActionResult } from "@/actions/auth";
import { createEmployeeNotification } from "@/actions/notifications";
import { logAudit } from "@/actions/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TIMEZONE,
  officeDateTimeInputToUtcIso,
} from "@/lib/time/timezone";
import { getOfficeSettings } from "@/actions/settings";
import type { BreakBooking } from "@/types/database";

const SLOT_CAPACITY = 1;
const BOOKINGS_DISABLED = "__BOOKINGS_DISABLED__";

function isMissingBookingsTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    (message.includes("schema cache") && message.includes("break_bookings")) ||
    message.includes('relation "public.break_bookings" does not exist')
  );
}

function normalizeDateInput(value: string, timezone: string) {
  const iso = officeDateTimeInputToUtcIso(value, timezone);
  if (iso) return new Date(iso);

  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) return null;
  return fallback;
}

function currentMinuteStart() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.getTime();
}

async function nextPositionForSlot(startIso: string, endIso: string) {
  const service = createServiceClient();
  const { count, error } = await service
    .from("break_bookings")
    .select("*", { count: "exact", head: true })
    .eq("scheduled_start", startIso)
    .eq("scheduled_end", endIso)
    .in("status", ["scheduled", "waiting"]);

  if (error) {
    if (isMissingBookingsTable(error)) {
      throw new Error(BOOKINGS_DISABLED);
    }
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getMyUpcomingBookings(): Promise<BreakBooking[]> {
  const employee = await requireEmployee();
  const service = createServiceClient();
  const { data, error } = await service
    .from("break_bookings")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("scheduled_end", new Date().toISOString())
    .in("status", ["scheduled", "waiting"])
    .order("scheduled_start", { ascending: true })
    .limit(5);

  if (error) {
    if (!isMissingBookingsTable(error)) {
      console.error("[getMyUpcomingBookings]", error);
    }
    return [];
  }

  return (data ?? []) as BreakBooking[];
}

export async function isBreakBookingAvailable(): Promise<boolean> {
  try {
    await requireEmployee();
  } catch {
    return false;
  }

  const service = createServiceClient();
  const { error } = await service
    .from("break_bookings")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (!error) return true;
  if (!isMissingBookingsTable(error)) {
    console.error("[isBreakBookingAvailable]", error);
  }
  return false;
}

export async function getUpcomingBookings(): Promise<BreakBooking[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("break_bookings")
    .select("*, employee:employees(*)")
    .gte("scheduled_end", new Date().toISOString())
    .order("scheduled_start", { ascending: true })
    .limit(100);

  if (error) {
    if (!isMissingBookingsTable(error)) {
      console.error("[getUpcomingBookings]", error);
    }
    return [];
  }

  return (data ?? []) as BreakBooking[];
}

export async function reserveBreakSlot(
  scheduledStart: string,
  minutes = 60
): Promise<ActionResult<BreakBooking>> {
  const employee = await requireEmployee();
  const settings = await getOfficeSettings().catch(() => null);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const start = normalizeDateInput(scheduledStart, timezone);
  if (!start) return { success: false, error: "Please choose a valid slot time." };

  const duration = Math.max(5, Math.min(180, Number(minutes) || 60));
  const end = new Date(start.getTime() + duration * 60_000);
  if (start.getTime() < currentMinuteStart()) {
    return { success: false, error: "Please choose a future slot." };
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const service = createServiceClient();

  const { data: duplicate, error: duplicateError } = await service
    .from("break_bookings")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("scheduled_start", startIso)
    .eq("scheduled_end", endIso)
    .in("status", ["scheduled", "waiting"])
    .maybeSingle();

  if (isMissingBookingsTable(duplicateError)) {
    return { success: false, error: BOOKINGS_DISABLED };
  }
  if (duplicateError) {
    return { success: false, error: duplicateError.message };
  }

  if (duplicate) {
    return { success: false, error: "You already reserved this slot." };
  }

  let position = 0;
  try {
    position = await nextPositionForSlot(startIso, endIso);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : BOOKINGS_DISABLED,
    };
  }
  const status = position < SLOT_CAPACITY ? "scheduled" : "waiting";

  const { data, error } = await service
    .from("break_bookings")
    .insert({
      employee_id: employee.id,
      scheduled_start: startIso,
      scheduled_end: endIso,
      status,
      position,
    })
    .select("*")
    .single();

  if (error) {
    console.error("reserveBreakSlot", error);
    if (isMissingBookingsTable(error)) {
      return { success: false, error: BOOKINGS_DISABLED };
    }
    return {
      success: false,
      error: error.message || "Unable to reserve this slot.",
    };
  }

  await createEmployeeNotification({
    recipientId: employee.id,
    kind: status === "waiting" ? "booking_reminder" : "booking_reminder",
    title: status === "waiting" ? "Added to waiting list" : "Break slot reserved",
    body:
      status === "waiting"
        ? `This slot is full. You are #${position} on the waiting list.`
        : "Your reserved break slot is scheduled.",
    entityType: "break_booking",
    entityId: data.id,
  });
  await logAudit({
    actorId: employee.id,
    actorType: employee.role,
    action: "booking_reserved",
    targetType: "break_booking",
    targetId: data.id,
    newData: data as BreakBooking,
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  return {
    success: true,
    data: data as BreakBooking,
    message:
      status === "waiting"
        ? `Slot is full. You are #${position + 1} on the waiting list.`
        : "Break slot reserved.",
  };
}

export async function cancelBreakBooking(
  bookingId: string,
  reason = "Cancelled by employee"
): Promise<ActionResult> {
  const employee = await requireEmployee();
  const service = createServiceClient();
  const { data: booking } = await service
    .from("break_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (!booking) {
    return { success: false, error: "Booking not found." };
  }

  const { error: cancelError } = await service
    .from("break_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq("id", bookingId);

  if (cancelError) {
    return {
      success: false,
      error: isMissingBookingsTable(cancelError)
        ? BOOKINGS_DISABLED
        : cancelError.message,
    };
  }

  await promoteNextWaitingBooking(booking.scheduled_start, booking.scheduled_end);
  await logAudit({
    actorId: employee.id,
    actorType: employee.role,
    action: "booking_cancelled",
    targetType: "break_booking",
    targetId: bookingId,
    oldData: booking as BreakBooking,
    newData: { status: "cancelled", reason },
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin/schedule");
  return { success: true, message: "Booking cancelled." };
}

export async function adminCancelBreakBooking(
  bookingId: string,
  reason: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!reason.trim()) {
    return { success: false, error: "Reason is required." };
  }

  const service = createServiceClient();
  const { data: booking } = await service
    .from("break_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return { success: false, error: "Booking not found." };
  }

  await service
    .from("break_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason.trim(),
    })
    .eq("id", bookingId);

  await promoteNextWaitingBooking(booking.scheduled_start, booking.scheduled_end);
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_cancel_booking",
    targetType: "break_booking",
    targetId: bookingId,
    oldData: booking as BreakBooking,
    newData: { status: "cancelled", reason: reason.trim() },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  return { success: true, message: "Booking cancelled." };
}

export async function adminCreateBreakBooking(input: {
  employeeId: string;
  scheduledStart: string;
  minutes?: number;
  reason: string;
}): Promise<ActionResult<BreakBooking>> {
  const admin = await requireAdmin();
  if (!input.reason.trim()) {
    return { success: false, error: "Reason is required." };
  }

  const settings = await getOfficeSettings().catch(() => null);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const start = normalizeDateInput(input.scheduledStart, timezone);
  if (!start) return { success: false, error: "Please choose a valid slot time." };

  const duration = Math.max(5, Math.min(180, Number(input.minutes) || 60));
  const end = new Date(start.getTime() + duration * 60_000);
  if (start.getTime() < currentMinuteStart()) {
    return { success: false, error: "Please choose a future slot." };
  }
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  let position = 0;
  try {
    position = await nextPositionForSlot(startIso, endIso);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : BOOKINGS_DISABLED,
    };
  }
  const status = position < SLOT_CAPACITY ? "scheduled" : "waiting";
  const service = createServiceClient();

  const { data, error } = await service
    .from("break_bookings")
    .insert({
      employee_id: input.employeeId,
      scheduled_start: startIso,
      scheduled_end: endIso,
      status,
      position,
      approved_by: admin.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error && isMissingBookingsTable(error)
        ? BOOKINGS_DISABLED
        : error?.message || "Unable to create booking.",
    };
  }

  await createEmployeeNotification({
    recipientId: input.employeeId,
    kind: "booking_reminder",
    title: "Break slot created by admin",
    body: input.reason.trim(),
    entityType: "break_booking",
    entityId: data.id,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "admin",
    action: "admin_create_booking",
    targetType: "break_booking",
    targetId: data.id,
    newData: data as BreakBooking,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  return { success: true, data: data as BreakBooking, message: "Booking created." };
}

async function promoteNextWaitingBooking(startIso: string, endIso: string) {
  const service = createServiceClient();
  const { data: next } = await service
    .from("break_bookings")
    .select("id")
    .eq("scheduled_start", startIso)
    .eq("scheduled_end", endIso)
    .eq("status", "waiting")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return;

  const { data: before } = await service
    .from("break_bookings")
    .select("*")
    .eq("id", next.id)
    .maybeSingle();

  await service
    .from("break_bookings")
    .update({ status: "scheduled", position: 0 })
    .eq("id", next.id);

  const { data: promoted } = await service
    .from("break_bookings")
    .select("employee_id")
    .eq("id", next.id)
    .maybeSingle();

  if (promoted?.employee_id) {
    await createEmployeeNotification({
      recipientId: promoted.employee_id,
      kind: "waiting_slot_promoted",
      title: "Your waiting-list slot is available",
      body: "You have been promoted from waiting list to scheduled.",
      entityType: "break_booking",
      entityId: next.id,
    });
  }

  await logAudit({
    actorType: "system",
    action: "waiting_booking_promoted",
    targetType: "break_booking",
    targetId: next.id,
    oldData: before as BreakBooking | null,
    newData: { status: "scheduled", position: 0 },
  });
}
