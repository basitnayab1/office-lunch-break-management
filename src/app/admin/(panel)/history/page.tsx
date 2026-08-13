import nextDynamic from "next/dynamic";
import { listEmployees } from "@/actions/employees";
import { getBreakHistory } from "@/actions/reports";
import { getOfficeSettings } from "@/actions/settings";
import { todayInTimezone } from "@/lib/time/timezone";

const BreakHistoryPanel = nextDynamic(
  () =>
    import("@/components/admin/break-history-panel").then((m) => ({
      default: m.BreakHistoryPanel,
    })),
  {
    loading: () => (
      <div className="h-96 animate-pulse rounded-2xl border border-[var(--line)] bg-white/60" />
    ),
  }
);

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
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">
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
