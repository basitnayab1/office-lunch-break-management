import Link from "next/link";
import { getUpcomingBookings } from "@/actions/bookings";
import { getDepartmentCoverage } from "@/actions/coverage";
import {
  getActiveBreaks,
  getDashboardAnalytics,
  getTodayStats,
} from "@/actions/reports";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatDuration } from "@/lib/utils";
import { calculateBreakMetrics } from "@/lib/breaks/calculations";
import { BreakActivityChart } from "@/components/admin/break-activity-chart";
import type {
  BreakSession,
  BreakType,
  DashboardAnalytics,
  DepartmentCoverage,
} from "@/types/database";

export const dynamic = "force-dynamic";

const typeMeta: Record<
  BreakType,
  { label: string; icon: string; color: string; soft: string }
> = {
  breakfast: {
    label: "Breakfast today",
    icon: "♨",
    color: "var(--brand)",
    soft: "bg-[var(--brand-soft)] text-[var(--brand)]",
  },
  coffee: {
    label: "Coffee today",
    icon: "☕",
    color: "var(--accent)",
    soft: "bg-[#e7f0ff] text-[var(--accent)]",
  },
  lunch: {
    label: "Lunch today",
    icon: "▰",
    color: "#45c7a5",
    soft: "bg-[var(--brand-soft)] text-[var(--brand)]",
  },
};

function KpiCard({
  label,
  value,
  icon,
  tone,
  hint = "Live from database",
}: {
  label: string;
  value: string | number;
  icon: string;
  tone: "green" | "yellow" | "blue" | "red";
  hint?: string;
}) {
  const colors = {
    green: "bg-[var(--brand-soft)] text-[var(--brand)]",
    yellow: "bg-[var(--warn-soft)] text-[var(--warn)]",
    blue: "bg-[#e7f0ff] text-[var(--accent)]",
    red: "bg-[var(--danger-soft)] text-[var(--danger)]",
  };

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-start gap-5">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl ${colors[tone]}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink-muted)]">{label}</p>
          <p className="mt-1 text-4xl font-bold leading-none tracking-normal text-[var(--ink)]">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-5 text-sm text-[var(--ink-muted)]">— {hint}</p>
    </div>
  );
}

function TypeProgressCard({
  type,
  count,
  expected,
}: {
  type: BreakType;
  count: number;
  expected: number;
}) {
  const meta = typeMeta[type];
  const percent = expected === 0 ? 0 : Math.round((count / expected) * 100);
  const capped = Math.min(100, percent);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-center gap-5">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl ${meta.soft}`}
        >
          {meta.icon}
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--ink-muted)]">{meta.label}</p>
          <p className="mt-1 text-3xl font-bold leading-none">
            {count}
            <span className="ml-2 text-xl font-semibold text-[var(--ink-muted)]">
              / {expected}
            </span>
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {percent}% of expected
          </p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf0f4]">
        <div
          className="h-full rounded-full"
          style={{ width: `${capped}%`, background: meta.color }}
        />
      </div>
    </div>
  );
}

function DistributionCard({
  analytics,
}: {
  analytics: DashboardAnalytics;
}) {
  const total = Math.max(0, analytics.weeklyTotalBreaks);
  const breakfast = analytics.breakTypeDistribution.breakfast;
  const coffee = analytics.breakTypeDistribution.coffee;
  const lunch = analytics.breakTypeDistribution.lunch;
  const breakfastPct = total ? Math.round((breakfast / total) * 100) : 0;
  const coffeePct = total ? Math.round((coffee / total) * 100) : 0;
  const lunchPct = total ? 100 - breakfastPct - coffeePct : 0;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <h2 className="text-lg font-bold">Break Type Distribution (This Week)</h2>
      <div className="mt-7 grid items-center gap-8 md:grid-cols-[220px_1fr]">
        <div
          className="mx-auto grid h-44 w-44 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--brand) 0 ${breakfastPct}%, var(--accent) ${breakfastPct}% ${breakfastPct + coffeePct}%, #45c7a5 ${breakfastPct + coffeePct}% 100%)`,
          }}
        >
          <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center">
            <div>
              <p className="text-3xl font-bold">{total}</p>
              <p className="text-sm text-[var(--ink-muted)]">Total Breaks</p>
            </div>
          </div>
        </div>
        <div className="space-y-5">
          {([
            ["breakfast", breakfastPct, breakfast],
            ["coffee", coffeePct, coffee],
            ["lunch", lunchPct, lunch],
          ] as [BreakType, number, number][]).map(([type, percent, count]) => (
            <div key={type} className="grid grid-cols-[1fr_auto] items-center gap-5">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: typeMeta[type].color }}
                />
                <span className="font-medium">{typeMeta[type].label.replace(" today", "")}</span>
              </div>
              <span className="text-sm font-semibold text-[var(--ink-muted)]">
                {percent}% ({count})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UpcomingSlots({
  bookings,
}: {
  bookings: Awaited<ReturnType<typeof getUpcomingBookings>>;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <h2 className="text-lg font-bold">Upcoming Slots</h2>
      <div className="mt-5 space-y-5">
        {bookings.slice(0, 4).length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No scheduled break slots yet.</p>
        ) : (
          bookings.slice(0, 4).map((booking) => {
            const start = new Date(booking.scheduled_start);
            const end = new Date(booking.scheduled_end);
            const today = new Date().toDateString() === start.toDateString();
            return (
              <div key={booking.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                  {typeMeta.lunch.icon}
                </span>
                <div>
                  <p className="font-semibold">
                    {booking.employee?.full_name ?? "Break Slot"}
                  </p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {start.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {end.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    today ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"
                  }`}
                >
                  {today ? "Today" : "Upcoming"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ActiveBreaksSummary({
  breaks,
}: {
  breaks: BreakSession[];
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Active Breaks</h2>
        <span className="rounded-[8px] bg-[var(--brand-soft)] px-3 py-1 text-sm font-semibold text-[var(--brand-dark)]">
          {breaks.length} active
        </span>
      </div>
      <div className="mt-5 space-y-4">
        {breaks.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">
            No employees are currently on break.
          </p>
        ) : (
          breaks.slice(0, 4).map((breakSession) => {
            const metrics = calculateBreakMetrics(
              breakSession.started_at,
              breakSession.allowed_minutes,
              new Date().toISOString()
            );
            return (
              <div
                key={breakSession.id}
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="font-semibold">
                    {breakSession.employee?.full_name ?? "Employee"}
                  </p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {breakTypeLabel(breakSession.break_type)}
                  </p>
                </div>
                <p
                  className={`font-[family-name:var(--font-mono)] text-sm font-semibold ${
                    metrics.isOvertime ? "text-[var(--danger)]" : "text-[var(--brand)]"
                  }`}
                >
                  {metrics.isOvertime
                    ? `+${formatDuration(metrics.extraSeconds)}`
                    : `${formatDuration(metrics.remainingSeconds)} left`}
                </p>
              </div>
            );
          })
        )}
      </div>
      <Link
        href="/admin/history"
        className="mt-5 inline-flex text-sm font-semibold text-[var(--brand)]"
      >
        View break records
      </Link>
    </div>
  );
}

function CoverageSummary({
  coverage,
}: {
  coverage: DepartmentCoverage[];
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Team Coverage</h2>
        <span className="rounded-[8px] bg-[var(--ok-soft)] px-3 py-1 text-sm font-semibold text-[var(--ok)]">
          Current
        </span>
      </div>
      <div className="mt-5 space-y-4">
        {coverage.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">
            No coverage data available.
          </p>
        ) : (
          coverage.slice(0, 4).map((row) => {
            const percent =
              row.totalEmployees === 0
                ? 0
                : Math.round((row.availableEmployees / row.totalEmployees) * 100);
            return (
              <div key={row.department}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{row.department}</p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {row.availableEmployees}/{row.totalEmployees} available
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0f4]">
                  <div
                    className={`h-full rounded-full ${
                      row.status === "low"
                        ? "bg-[var(--danger)]"
                        : row.status === "tight"
                          ? "bg-[var(--warn)]"
                          : "bg-[var(--brand)]"
                    }`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
      <Link
        href="/admin/schedule"
        className="mt-5 inline-flex text-sm font-semibold text-[var(--brand)]"
      >
        Open schedule
      </Link>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [stats, activeBreaks, coverage, bookings, analytics] =
    await Promise.all([
      getTodayStats(),
      getActiveBreaks(),
      getDepartmentCoverage(),
      getUpcomingBookings(),
      getDashboardAnalytics(),
    ]);
  const expectedPerType = Math.max(1, stats.totalEmployees);

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-3 md:hidden">
        <Link
          href="/admin/reports"
          className="rounded-[8px] border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold shadow-[var(--shadow)]"
        >
          Export Report
        </Link>
        <Link
          href="/admin/schedule"
          className="rounded-[8px] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow)]"
        >
          Create Break Slot
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Employees" value={stats.totalEmployees} icon="☷" tone="green" />
        <KpiCard label="Currently on Break" value={stats.currentlyOnBreak} icon="☕" tone="yellow" />
        <KpiCard label="Completed Breaks" value={stats.completedBreaks} icon="✓" tone="blue" hint="Today's records" />
        <KpiCard label="Employees Overtime" value={stats.employeesOverTime} icon="◷" tone="red" />
        <KpiCard label="Extra Minutes" value={stats.totalExtraMinutes} icon="⏱" tone="red" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <TypeProgressCard
          type="breakfast"
          count={analytics.todayByBreakType.breakfast}
          expected={expectedPerType}
        />
        <TypeProgressCard
          type="coffee"
          count={analytics.todayByBreakType.coffee}
          expected={expectedPerType}
        />
        <TypeProgressCard
          type="lunch"
          count={analytics.todayByBreakType.lunch}
          expected={expectedPerType}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <BreakActivityChart initialAnalytics={analytics} />
        <DistributionCard analytics={analytics} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.3fr_1.15fr]">
        <ActiveBreaksSummary breaks={activeBreaks} />
        <CoverageSummary coverage={coverage} />
        <UpcomingSlots bookings={bookings} />
      </section>
    </div>
  );
}
