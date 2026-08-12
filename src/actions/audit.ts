"use server";

import { requireAdmin } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { AuditLog, Json } from "@/types/database";

export async function logAudit(input: {
  actorId?: string | null;
  actorType?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
}) {
  const service = createServiceClient();
  const { error } = await service.from("audit_logs").insert({
    actor_id: input.actorId ?? null,
    actor_type: input.actorType ?? "system",
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    old_data: (input.oldData ?? null) as Json | null,
    new_data: (input.newData ?? null) as Json | null,
    ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("[audit] insert failed:", error.message);
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*, actor:employees(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AuditLog[];
}
