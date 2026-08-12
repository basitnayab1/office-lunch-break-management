import { createServiceClient } from "@/lib/supabase/admin";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export async function getPinLock(identifier: string): Promise<{
  locked: boolean;
  retryAfterMinutes: number;
}> {
  const service = createServiceClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await service
    .from("login_attempts")
    .select("created_at")
    .eq("identifier", normalizeIdentifier(identifier))
    .eq("succeeded", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_FAILED_ATTEMPTS);

  const failures = data ?? [];
  if (failures.length < MAX_FAILED_ATTEMPTS) {
    return { locked: false, retryAfterMinutes: 0 };
  }

  const latest = new Date(failures[0].created_at).getTime();
  const unlocksAt = latest + LOCK_MINUTES * 60_000;
  if (unlocksAt <= Date.now()) {
    return { locked: false, retryAfterMinutes: 0 };
  }

  return {
    locked: true,
    retryAfterMinutes: Math.max(1, Math.ceil((unlocksAt - Date.now()) / 60_000)),
  };
}

export async function recordPinAttempt(input: {
  identifier: string;
  employeeId?: string | null;
  succeeded: boolean;
  reason?: string | null;
}) {
  const service = createServiceClient();
  const { error } = await service.from("login_attempts").insert({
    identifier: normalizeIdentifier(input.identifier),
    employee_id: input.employeeId ?? null,
    succeeded: input.succeeded,
    reason: input.reason ?? null,
  });

  if (error) {
    console.error("[pin-rate-limit] unable to record login attempt:", error.message);
  }
}
