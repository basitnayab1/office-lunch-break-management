"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDepartmentCoverage } from "@/actions/coverage";
import { Badge, Card } from "@/components/ui/card";
import type { DepartmentCoverage } from "@/types/database";

export function CoveragePanel({
  initialCoverage,
  compact = false,
}: {
  initialCoverage: DepartmentCoverage[];
  compact?: boolean;
}) {
  const [coverage, setCoverage] = useState(initialCoverage);
  const [, startTransition] = useTransition();
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    setCoverage(initialCoverage);
  }, [initialCoverage]);

  useEffect(() => {
    if (compact) return;

    const supabase = createClient();
    const refresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
      startTransition(async () => {
        setCoverage(await getDepartmentCoverage());
      });
      }, 1200);
    };

    const channel = supabase
      .channel("admin-coverage")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "coverage_rules" }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [compact]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h2 className="text-lg font-bold">
          Team Coverage
        </h2>
        <Badge tone={coverage.some((row) => row.status === "low") ? "danger" : "ok"}>
          Live
        </Badge>
      </div>

      <div className="overflow-x-auto">
          <table className={`min-w-full text-left ${compact ? "text-xs" : "text-sm"}`}>
          <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Available</th>
              <th className="px-4 py-3 font-medium">On break</th>
              <th className="px-4 py-3 font-medium">Coverage</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => {
              const percent =
                row.totalEmployees === 0
                  ? 0
                  : Math.round((row.availableEmployees / row.totalEmployees) * 100);
              const tone =
                row.status === "low"
                  ? "danger"
                  : row.status === "tight"
                    ? "warn"
                    : "ok";
              return (
                <tr key={row.department} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-medium">{row.department}</td>
                  <td className="px-4 py-3">{row.availableEmployees}</td>
                  <td className="px-4 py-3">{row.activeBreaks}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-[#edf0f4]">
                        <div
                          className={`h-full rounded-full ${
                            tone === "danger"
                              ? "bg-[#ffb8bd]"
                              : tone === "warn"
                                ? "bg-[#f2b400]"
                                : "bg-[var(--brand)]"
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                      <span>{percent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={tone}>
                      {row.status === "low"
                        ? "Critical"
                        : row.status === "tight"
                          ? "Limited"
                          : "Healthy"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
