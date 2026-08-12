import { getMyNotifications } from "@/actions/notifications";
import { AutomationRunner } from "@/components/admin/automation-runner";
import { Badge, Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const notifications = await getMyNotifications(100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Notifications
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Overtime, Google Sheets, PIN security, booking, and system alerts.
        </p>
      </div>

      <AutomationRunner />

      <Card className="overflow-hidden">
        {notifications.length === 0 ? (
          <p className="px-6 py-6 text-[var(--ink-muted)]">No notifications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <Badge tone={item.read_at ? "neutral" : "brand"}>
                        {item.read_at ? "Read" : "New"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{item.kind}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-[var(--ink-muted)]">{item.body}</p>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(item.created_at).toLocaleString()}
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
