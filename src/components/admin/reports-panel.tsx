"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  exportDailyReportCsv,
  exportMonthlyReportCsv,
  getDailyReport,
  getMonthlyReport,
} from "@/actions/reports";
import type { DailyReport, MonthlyReportRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Card, StatCard } from "@/components/ui/card";

export function ReportsPanel({
  initialDaily,
  initialMonthly,
  initialDate,
  initialYear,
  initialMonth,
}: {
  initialDaily: DailyReport;
  initialMonthly: MonthlyReportRow[];
  initialDate: string;
  initialYear: number;
  initialMonth: number;
}) {
  const [date, setDate] = useState(initialDate);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [daily, setDaily] = useState(initialDaily);
  const [monthly, setMonthly] = useState(initialMonthly);
  const [pending, startTransition] = useTransition();

  function loadDaily() {
    startTransition(async () => {
      setDaily(await getDailyReport(date));
    });
  }

  function loadMonthly() {
    startTransition(async () => {
      setMonthly(await getMonthlyReport(year, month));
    });
  }

  function download(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Daily report date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button onClick={loadDaily} disabled={pending}>
            Load daily
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const csv = await exportDailyReportCsv(date);
                download(`daily-report-${date}.csv`, csv);
                toast.success("Daily report exported.");
              })
            }
          >
            Export daily CSV
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total breaks" value={daily.totalBreaks} />
          <StatCard
            label="Average duration"
            value={`${daily.averageBreakMinutes} min`}
          />
          <StatCard
            label="Total overtime"
            value={`${daily.totalOvertimeMinutes} min`}
            tone="danger"
          />
          <StatCard
            label="Employees with overtime"
            value={daily.employeesWithOvertime.length}
            tone="warn"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Breakfast"
            value={daily.byBreakType.breakfast.count}
            hint={`${daily.byBreakType.breakfast.totalMinutes} min · ${daily.byBreakType.breakfast.overtimeMinutes} OT`}
          />
          <StatCard
            label="Coffee"
            value={daily.byBreakType.coffee.count}
            hint={`${daily.byBreakType.coffee.totalMinutes} min · ${daily.byBreakType.coffee.overtimeMinutes} OT`}
          />
          <StatCard
            label="Lunch"
            value={daily.byBreakType.lunch.count}
            hint={`${daily.byBreakType.lunch.totalMinutes} min · ${daily.byBreakType.lunch.overtimeMinutes} OT`}
            tone="brand"
          />
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] px-6 py-4">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Employees with overtime
            </h3>
          </div>
          {daily.employeesWithOvertime.length === 0 ? (
            <p className="px-6 py-6 text-[var(--ink-muted)]">None for this day.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Extra minutes</th>
                </tr>
              </thead>
              <tbody>
                {daily.employeesWithOvertime.map((e) => (
                  <tr key={e.employee_id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 font-medium">{e.full_name}</td>
                    <td className="px-4 py-3">{e.department}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--danger)]">
                      {e.extra_minutes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Year</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Month</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <Button onClick={loadMonthly} disabled={pending}>
            Load monthly
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const csv = await exportMonthlyReportCsv(year, month);
                download(`monthly-report-${year}-${month}.csv`, csv);
                toast.success("Monthly report exported.");
              })
            }
          >
            Export monthly CSV
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Breaks</th>
                  <th className="px-4 py-3">Breakfast</th>
                  <th className="px-4 py-3">Coffee</th>
                  <th className="px-4 py-3">Lunch</th>
                  <th className="px-4 py-3">Total minutes</th>
                  <th className="px-4 py-3">Overtime</th>
                  <th className="px-4 py-3">Exceeded</th>
                  <th className="px-4 py-3">Average</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => (
                  <tr key={r.employee_id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3">{r.department}</td>
                    <td className="px-4 py-3">{r.breakCount}</td>
                    <td className="px-4 py-3">
                      {r.breakfastCount} ({r.breakfastMinutes}m)
                    </td>
                    <td className="px-4 py-3">
                      {r.coffeeCount} ({r.coffeeMinutes}m)
                    </td>
                    <td className="px-4 py-3">
                      {r.lunchCount} ({r.lunchMinutes}m)
                    </td>
                    <td className="px-4 py-3">{r.totalBreakMinutes}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--danger)]">
                      {r.totalOvertimeMinutes}
                    </td>
                    <td className="px-4 py-3">{r.exceededCount}</td>
                    <td className="px-4 py-3">{r.averageBreakMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
