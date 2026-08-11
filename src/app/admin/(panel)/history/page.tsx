import { listEmployees } from "@/actions/employees";
import { getBreakHistory } from "@/actions/reports";
import { getOfficeSettings } from "@/actions/settings";
import { BreakHistoryPanel } from "@/components/admin/break-history-panel";
import { todayInTimezone } from "@/lib/time/timezone";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const settings = await getOfficeSettings();
  const today = todayInTimezone(settings.timezone);
  const [rows, employees] = await Promise.all([
    getBreakHistory({ date: today }),
    listEmployees(),
  ]);
  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Break Records
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Search, filter, export, and retry Google Sheets sync.
        </p>
      </div>
      <BreakHistoryPanel
        initialRows={rows}
        employees={employees}
        departments={departments}
        timezone={settings.timezone}
        initialDate={today}
      />
    </div>
  );
}
