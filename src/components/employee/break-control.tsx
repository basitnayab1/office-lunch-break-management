"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  endBreak,
  getServerNow,
  startBreak,
} from "@/actions/breaks";
import { calculateBreakMetrics } from "@/lib/breaks/calculations";
import { getBreakAlarmPhase } from "@/lib/breaks/alarm-phase";
import {
  startExceededAlarmLoop,
  startWarningAlarmLoop,
  stopBreakAlarms,
  unlockBreakAlarmAudio,
} from "@/lib/breaks/alarms";
import { BREAK_TYPE_OPTIONS, breakTypeLabel } from "@/lib/breaks/types";
import { formatDuration } from "@/lib/utils";
import { formatOfficeTime } from "@/lib/time/timezone";
import type {
  BreakSession,
  BreakType,
  Employee,
  OfficeSettings,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function requestNotificationPermissionOnce() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag: "break-alarm",
    });
  } catch {
    // Ignore notification construction errors (unsupported options, etc.)
  }
}

export function BreakControl({
  employee,
  initialBreak,
  settings,
}: {
  employee: Employee;
  initialBreak: BreakSession | null;
  settings: OfficeSettings;
}) {
  const router = useRouter();
  const [activeBreak, setActiveBreak] = useState<BreakSession | null>(initialBreak);
  const [selectedType, setSelectedType] = useState<BreakType | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [pending, startTransition] = useTransition();

  const warningNotifiedForId = useRef<string | null>(null);
  const exceededNotifiedForId = useRef<string | null>(null);

  const warningMinutes = settings.break_warning_minutes ?? 2;

  useEffect(() => {
    getServerNow().then((iso) => {
      setClockOffsetMs(new Date(iso).getTime() - Date.now());
    });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now() + clockOffsetMs);
    }, 250);
    return () => window.clearInterval(id);
  }, [clockOffsetMs]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`break-${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "break_sessions",
          filter: `employee_id=eq.${employee.id}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as BreakSession;
          if (payload.eventType === "DELETE") {
            setActiveBreak(null);
            return;
          }
          if (row.status === "active") {
            setActiveBreak(row);
          } else if (activeBreak?.id === row.id) {
            setActiveBreak(null);
            router.refresh();
          }
        }
      )
      .subscribe();

    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [employee.id, activeBreak?.id, router]);

  useEffect(() => {
    setActiveBreak(initialBreak);
  }, [initialBreak]);

  const metrics = useMemo(() => {
    if (!activeBreak) return null;
    return calculateBreakMetrics(
      activeBreak.started_at,
      activeBreak.allowed_minutes,
      new Date(nowMs).toISOString()
    );
  }, [activeBreak, nowMs]);

  const phase = useMemo(() => {
    if (!metrics) return "normal" as const;
    return getBreakAlarmPhase(metrics, warningMinutes);
  }, [metrics, warningMinutes]);

  // Single alarm loop driven by phase only (not every timer tick / re-render).
  useEffect(() => {
    if (!activeBreak?.id) {
      stopBreakAlarms();
      return;
    }

    if (phase === "warning") {
      startWarningAlarmLoop();
      if (warningNotifiedForId.current !== activeBreak.id) {
        warningNotifiedForId.current = activeBreak.id;
        showBrowserNotification(
          `${warningMinutes} MINUTE${warningMinutes === 1 ? "" : "S"} REMAINING`,
          `Your ${breakTypeLabel(activeBreak.break_type)} break ends soon. Please wrap up.`
        );
      }
    } else if (phase === "exceeded") {
      startExceededAlarmLoop();
      if (exceededNotifiedForId.current !== activeBreak.id) {
        exceededNotifiedForId.current = activeBreak.id;
        warningNotifiedForId.current = activeBreak.id;
        showBrowserNotification(
          "BREAK TIME EXCEEDED",
          "Your allowed break time has ended. Overtime is now being tracked."
        );
      }
    } else {
      stopBreakAlarms();
    }
  }, [
    activeBreak?.id,
    activeBreak?.break_type,
    phase,
    warningMinutes,
  ]);

  useEffect(() => {
    if (!activeBreak) {
      warningNotifiedForId.current = null;
      exceededNotifiedForId.current = null;
      stopBreakAlarms();
    }
  }, [activeBreak]);

  // Hard cleanup on unmount only (do not clear intervals on every re-render).
  useEffect(() => {
    return () => {
      stopBreakAlarms();
    };
  }, []);

  function onStart() {
    if (!selectedType) {
      toast.error("Please select a break type first.");
      return;
    }
    startTransition(async () => {
      await unlockBreakAlarmAudio();
      requestNotificationPermissionOnce();

      const result = await startBreak(selectedType);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      stopBreakAlarms();
      warningNotifiedForId.current = null;
      exceededNotifiedForId.current = null;
      setActiveBreak(result.data ?? null);
      setSelectedType(null);
      toast.success(result.message ?? "Break started.");
      router.refresh();
    });
  }

  function onEnd() {
    // Stop looping alarm immediately — do not wait for the server response.
    stopBreakAlarms();
    startTransition(async () => {
      const result = await endBreak();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setActiveBreak(null);
      warningNotifiedForId.current = null;
      exceededNotifiedForId.current = null;
      stopBreakAlarms();
      toast.success(result.message ?? "Break ended successfully.");
      router.refresh();
    });
  }

  if (!activeBreak || !metrics) {
    return (
      <Card className="animate-rise p-8 md:p-10">
        <div>
          <Badge tone="brand">Ready</Badge>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold">
            Break Status
          </h2>
          <p className="mt-2 text-[var(--ink-muted)]">
            Select a break type, then start your break. Duration is assigned
            automatically.
          </p>
          {settings.break_test_mode ? (
            <p className="mt-3 rounded-xl bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
              Test mode is on: breaks last {settings.break_test_minutes} minutes
              (admin testing only).
            </p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {BREAK_TYPE_OPTIONS.map((option) => {
            const selected = selectedType === option.type;
            const displayMinutes = settings.break_test_mode
              ? settings.break_test_minutes
              : option.minutes;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setSelectedType(option.type)}
                disabled={pending}
                className={cn(
                  "rounded-2xl border px-4 py-5 text-left transition",
                  selected
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[0_10px_24px_rgba(15,106,90,0.18)]"
                    : "border-[var(--line)] bg-white hover:border-[var(--brand)]/50"
                )}
              >
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
                  {option.label}
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">
                  {displayMinutes} min
                </p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {settings.break_test_mode
                    ? `Test duration — normally ${option.description}`
                    : `${option.label} — ${option.description}`}
                </p>
              </button>
            );
          })}
        </div>

        <Button
          size="xl"
          className="mt-10 w-full"
          onClick={onStart}
          disabled={pending || !selectedType}
        >
          {pending ? "Starting..." : "START BREAK"}
        </Button>
      </Card>
    );
  }

  const overtime = phase === "exceeded";
  const warning = phase === "warning";
  const warningLabel = `${warningMinutes} MINUTE${
    warningMinutes === 1 ? "" : "S"
  } REMAINING`;
  const displaySeconds = overtime
    ? Math.abs(metrics.remainingSeconds)
    : Math.max(0, metrics.remainingSeconds);

  return (
    <Card
      className={cn(
        "animate-rise overflow-hidden p-8 md:p-10",
        overtime && "border-[var(--danger)] break-alarm-exceeded",
        warning && "border-[var(--warn)] break-alarm-warning"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={overtime ? "danger" : warning ? "warn" : "brand"}>
          {overtime
            ? "BREAK TIME EXCEEDED"
            : warning
              ? warningLabel
              : "BREAK IN PROGRESS"}
        </Badge>
        <span className="animate-pulse-soft text-sm font-medium text-[var(--ink-muted)]">
          Live · synced to server time
        </span>
      </div>

      {warning ? (
        <div className="mt-6 rounded-2xl bg-[var(--warn-soft)] px-5 py-4 text-[var(--warn)]">
          <p className="text-sm font-semibold uppercase tracking-[0.14em]">
            Warning
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold">
            {warningLabel}
          </p>
          <p className="mt-1 text-sm opacity-90">
            Please finish up and return. Overtime will start when time expires.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm text-[var(--ink-muted)]">Break type</p>
          <p className="mt-1 text-xl font-semibold">
            {breakTypeLabel(activeBreak.break_type)}
          </p>
        </div>
        <div>
          <p className="text-sm text-[var(--ink-muted)]">Started</p>
          <p className="mt-1 text-xl font-semibold">
            {formatOfficeTime(activeBreak.started_at, settings.timezone)}
          </p>
        </div>
        <div>
          <p className="text-sm text-[var(--ink-muted)]">Allowed</p>
          <p className="mt-1 text-xl font-semibold">
            {activeBreak.allowed_minutes} Minutes
          </p>
        </div>
        <div>
          <p className="text-sm text-[var(--ink-muted)]">
            {overtime ? "Overtime" : "Remaining"}
          </p>
          <p
            className={cn(
              "mt-1 font-[family-name:var(--font-mono)] text-4xl font-semibold tracking-tight",
              overtime
                ? "timer-overtime text-[var(--danger)]"
                : warning
                  ? "text-[var(--warn)]"
                  : "text-[var(--brand-dark)]"
            )}
          >
            {overtime ? "+" : ""}
            {formatDuration(displaySeconds)}
            {overtime ? " OVER" : ""}
          </p>
        </div>
      </div>

      {overtime ? (
        <div className="mt-8 rounded-2xl bg-[var(--danger-soft)] px-5 py-4 text-[var(--danger)]">
          <p className="text-sm font-semibold uppercase tracking-[0.14em]">
            BREAK TIME EXCEEDED
          </p>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-3xl font-semibold">
            +{formatDuration(metrics.extraSeconds)}
          </p>
          <p className="mt-1 text-sm opacity-90">
            Overtime continues until you click END BREAK.
          </p>
        </div>
      ) : null}

      <Button
        size="xl"
        variant="danger"
        className="mt-10 w-full"
        onClick={onEnd}
        disabled={pending}
      >
        {pending ? "Ending..." : "END BREAK"}
      </Button>
    </Card>
  );
}
