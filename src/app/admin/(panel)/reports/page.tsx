import { getDailyReport, getMonthlyReport } from "@/actions/reports";
import { getOfficeSettings } from "@/actions/settings";
import { ReportsPanel } from "@/components/admin/reports-panel";
import { todayInTimezone } from "@/lib/time/timezone";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const settings = await getOfficeSettings();
  const today = todayInTimezone(settings.timezone);
  const [year, month] = today.split("-").map(Number);
  const [daily, monthly] = await Promise.all([
    getDailyReport(today),
    getMonthlyReport(year, month),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Reports
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Daily and monthly break analytics with CSV export.
        </p>
      </div>
      <ReportsPanel
        initialDaily={daily}
        initialMonthly={monthly}
        initialDate={today}
        initialYear={year}
        initialMonth={month}
      />
    </div>
  );
}
