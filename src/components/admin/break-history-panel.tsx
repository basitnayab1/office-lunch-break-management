"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  exportBreakHistoryCsv,
  getBreakHistory,
} from "@/actions/reports";
import { retrySingleSheetSync } from "@/actions/breaks";
import type { BreakSession, BreakType, Employee } from "@/types/database";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatOfficeTime } from "@/lib/time/timezone";
import { formatMinutesDisplay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/card";

export function BreakHistoryPanel({
  initialRows,
  employees,
  departments,
  timezone,
  initialDate,
}: {
  initialRows: BreakSession[];
  employees: Employee[];
  departments: string[];
  timezone: string;
  initialDate: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [date, setDate] = useState(initialDate);
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [breakType, setBreakType] = useState("");
  const [status, setStatus] = useState("");
  const [exceededOnly, setExceededOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  const filters = useMemo(
    () => ({
      date: date || undefined,
      employeeId: employeeId || undefined,
      department: department || undefined,
      breakType: (breakType || undefined) as BreakType | undefined,
      status: status || undefined,
      exceededOnly,
    }),
    [date, employeeId, department, breakType, status, exceededOnly]
  );

  function applyFilters() {
    startTransition(async () => {
      const data = await getBreakHistory(filters);
      setRows(data);
    });
  }

  function exportCsv() {
    startTransition(async () => {
      const csv = await exportBreakHistoryCsv(filters);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `break-history-${date || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported.");
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">All</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Break type</Label>
            <Select value={breakType} onChange={(e) => setBreakType(e.target.value)}>
              <option value="">All</option>
              <option value="breakfast">Breakfast</option>
              <option value="coffee">Coffee</option>
              <option value="lunch">Lunch</option>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="within_limit">Within Limit</option>
              <option value="exceeded">Exceeded</option>
            </Select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              <input
                type="checkbox"
                checked={exceededOnly}
                onChange={(e) => setExceededOnly(e.target.checked)}
              />
              Exceeded only
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={applyFilters} disabled={pending}>
            Apply filters
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={pending}>
            Export CSV
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Break Type</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Allowed</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Extra</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sheets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{r.break_date}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.employee?.full_name}
                  </td>
                  <td className="px-4 py-3">{breakTypeLabel(r.break_type)}</td>
                  <td className="px-4 py-3">
                    {formatOfficeTime(r.started_at, timezone)}
                  </td>
                  <td className="px-4 py-3">
                    {r.ended_at ? formatOfficeTime(r.ended_at, timezone) : "—"}
                  </td>
                  <td className="px-4 py-3">{r.allowed_minutes}</td>
                  <td className="px-4 py-3">
                    {formatMinutesDisplay(r.actual_minutes)}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      (r.extra_minutes ?? 0) > 0 ? "text-[var(--danger)]" : ""
                    }`}
                  >
                    {(r.extra_minutes ?? 0) > 0
                      ? formatMinutesDisplay(r.extra_minutes)
                      : "0"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={r.status === "exceeded" ? "danger" : "ok"}>
                      {r.status === "exceeded" ? "Exceeded" : "Within Limit"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            r.google_sheet_sync_status === "synced"
                              ? "ok"
                              : r.google_sheet_sync_status === "failed"
                                ? "danger"
                                : "warn"
                          }
                        >
                          {r.google_sheet_sync_status}
                        </Badge>
                        {(r.google_sheet_sync_status === "failed" ||
                          r.google_sheet_sync_status === "pending") && (
                          <Button
                            size="md"
                            variant="ghost"
                            onClick={() =>
                              startTransition(async () => {
                                const result = await retrySingleSheetSync(r.id);
                                if (!result.success) {
                                  console.error(
                                    "[BreakHistory] Sheets retry failed:",
                                    result.error
                                  );
                                  toast.error(result.error);
                                } else {
                                  toast.success(result.message ?? "Synced.");
                                }
                                applyFilters();
                              })
                            }
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                      {r.google_sheet_error ? (
                        <p
                          className="max-w-xs text-xs text-[var(--danger)]"
                          title={r.google_sheet_error}
                        >
                          {r.google_sheet_error}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
