import { getAuditLogs } from "@/actions/audit";
import { Badge, Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const logs = await getAuditLogs(150);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">
          Audit Logs
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Admin actions, security events, automation, and employee lifecycle changes.
        </p>
      </div>

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <p className="px-6 py-6 text-[var(--ink-muted)]">No audit logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-[var(--line)]">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <p className="truncate font-medium" title={log.actor?.full_name ?? log.actor_type}>
                        {log.actor?.full_name ?? log.actor_type}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-muted)]" title={log.actor_id ?? "system"}>
                        {log.actor_id ?? "system"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={log.actor_type === "admin" ? "brand" : "neutral"}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      <p>{log.target_type}</p>
                      <p className="truncate text-xs text-[var(--ink-muted)]" title={log.target_id ?? ""}>
                        {log.target_id ?? ""}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
