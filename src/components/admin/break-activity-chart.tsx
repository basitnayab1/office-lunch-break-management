"use client";

import { useMemo, useState, useTransition } from "react";
import { getDashboardAnalytics } from "@/actions/reports";
import type { DashboardAnalytics } from "@/types/database";

const ranges: Array<{ value: DashboardAnalytics["range"]; label: string }> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
];

export function BreakActivityChart({
  initialAnalytics,
}: {
  initialAnalytics: DashboardAnalytics;
}) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const width = 720;
  const height = 180;
  const points = useMemo(() => {
    const max = Math.max(
      1,
      ...analytics.weekActivity.map((item) => item.completedBreaks)
    );
    return analytics.weekActivity.map((item, index) => {
      const x =
        20 +
        index *
          ((width - 40) / Math.max(1, analytics.weekActivity.length - 1));
      const y = 145 - (item.completedBreaks / max) * 105;
      return { ...item, x, y };
    });
  }, [analytics.weekActivity]);
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const fill = `20,150 ${line} ${width - 20},150`;

  function loadRange(range: DashboardAnalytics["range"]) {
    setOpen(false);
    startTransition(async () => {
      setAnalytics(await getDashboardAnalytics(range));
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Break Activity ({analytics.title})</h2>
        <div className="relative">
          <button
            type="button"
            className="rounded-[8px] border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[#f7f9fb]"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {pending ? "Loading..." : analytics.title} ˅
          </button>
          {open ? (
            <div className="absolute right-0 top-11 z-10 w-44 rounded-[8px] border border-[var(--line)] bg-white p-1 shadow-[0_18px_40px_rgba(20,32,51,0.14)]">
              {ranges.map((range) => (
                <button
                  key={range.value}
                  type="button"
                  className={`flex h-10 w-full items-center rounded-[7px] px-3 text-left text-sm font-semibold transition hover:bg-[#f7f9fb] ${
                    analytics.range === range.value
                      ? "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
                      : "text-[var(--ink)]"
                  }`}
                  onClick={() => loadRange(range.value)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm font-medium">
        <span className="h-3 w-3 rounded-full bg-[var(--brand)]" />
        Completed Breaks
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-[190px] w-full overflow-visible"
        role="img"
        aria-label={`Completed breaks for ${analytics.title}`}
      >
        <defs>
          <linearGradient id="break-activity-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map((tick) => (
          <g key={tick}>
            <line
              x1="20"
              x2={width - 20}
              y1={150 - tick * 21}
              y2={150 - tick * 21}
              stroke="#eef1f5"
            />
            <text x="0" y={154 - tick * 21} fontSize="11" fill="var(--ink-muted)">
              {tick}
            </text>
          </g>
        ))}
        <polygon points={fill} fill="url(#break-activity-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="5" fill="var(--brand)" />
            <text
              x={point.x}
              y={point.y - 12}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="var(--ink)"
            >
              {point.completedBreaks}
            </text>
            <text
              x={point.x}
              y="174"
              textAnchor="middle"
              fontSize="12"
              fill="var(--ink)"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
