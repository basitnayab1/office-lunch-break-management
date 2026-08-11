import nextDynamic from "next/dynamic";
import { getActiveBreaks, getTodayStats } from "@/actions/reports";
import { getOfficeSettings } from "@/actions/settings";
import { StatCard } from "@/components/ui/card";

const ActiveBreaksTable = nextDynamic(
  () =>
    import("@/components/admin/active-breaks-table").then((m) => ({
      default: m.ActiveBreaksTable,
    })),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl border border-[var(--line)] bg-white/60" />
    ),
  }
);

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [stats, activeBreaks, settings] = await Promise.all([
    getTodayStats(),
    getActiveBreaks(),
    getOfficeSettings(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Today&apos;s overview
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Live break activity for {settings.timezone}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total employees" value={stats.totalEmployees} tone="brand" />
        <StatCard
          label="Currently on break"
          value={stats.currentlyOnBreak}
          tone="warn"
        />
        <StatCard label="Completed breaks" value={stats.completedBreaks} />
        <StatCard
          label="Employees over time"
          value={stats.employeesOverTime}
          tone="danger"
        />
        <StatCard
          label="Total extra minutes"
          value={stats.totalExtraMinutes}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Breakfast today" value={stats.breakfastCount} />
        <StatCard label="Coffee today" value={stats.coffeeCount} />
        <StatCard label="Lunch today" value={stats.lunchCount} tone="brand" />
      </div>

      <ActiveBreaksTable
        initialBreaks={activeBreaks}
        timezone={settings.timezone}
      />
    </div>
  );
}
