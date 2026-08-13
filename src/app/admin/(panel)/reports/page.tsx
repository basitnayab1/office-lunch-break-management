import nextDynamic from "next/dynamic";
import { getDailyReport, getMonthlyReport } from "@/actions/reports";
import { getOfficeSettings } from "@/actions/settings";
import { todayInTimezone } from "@/lib/time/timezone";

const ReportsPanel = nextDynamic(
  () =>
    import("@/components/admin/reports-panel").then((m) => ({
      default: m.ReportsPanel,
    })),
  {
    loading: () => (
      <div className="h-96 animate-pulse rounded-2xl border border-[var(--line)] bg-white/60" />
    ),
  }
);

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
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">
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
