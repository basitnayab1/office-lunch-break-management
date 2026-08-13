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
import { formatOfficeTime, normalizeTimezone } from "@/lib/time/timezone";
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

const breakOptionStyles = {
  breakfast: {
    accent: "#00985b",
    soft: "#e2f5ea",
    ring: "border-[#cfe4dc] hover:border-[#00985b]/45",
    selected: "border-[#00985b] bg-[#f7fffb] shadow-[0_14px_34px_rgba(0,152,91,0.15)]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
        <path d="M5 9h11v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2a2 2 0 0 1 2-2Zm11 2h1.5a1.5 1.5 0 0 1 0 3H16v-3Zm-8-6c.4.7.4 1.3 0 2-.2.4-.2.8.1 1.3h-1.7c-.4-.8-.4-1.5 0-2.2.2-.4.2-.8 0-1.1H8Zm4 0c.4.7.4 1.3 0 2-.2.4-.2.8.1 1.3h-1.7c-.4-.8-.4-1.5 0-2.2.2-.4.2-.8 0-1.1H12ZM4 20h13v1.5H4V20Z" />
      </svg>
    ),
  },
  coffee: {
    accent: "#2187ee",
    soft: "#e4f1ff",
    ring: "border-[#c8def4] hover:border-[#2187ee]/45",
    selected: "border-[#2187ee] bg-[#f7fbff] shadow-[0_14px_34px_rgba(33,135,238,0.15)]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
        <path d="M5 9h11v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2a2 2 0 0 1 2-2Zm11 2h1.5a1.5 1.5 0 0 1 0 3H16v-3ZM8 4.6c.4.7.4 1.3 0 2-.2.4-.2.8.1 1.3H6.4c-.4-.8-.4-1.5 0-2.2.2-.4.2-.8 0-1.1H8Zm4 0c.4.7.4 1.3 0 2-.2.4-.2.8.1 1.3h-1.7c-.4-.8-.4-1.5 0-2.2.2-.4.2-.8 0-1.1H12ZM4 20h13v1.5H4V20Z" />
      </svg>
    ),
  },
  lunch: {
    accent: "#7b47d6",
    soft: "#eee5fb",
    ring: "border-[#ddcff0] hover:border-[#7b47d6]/45",
    selected: "border-[#7b47d6] bg-[#fcf9ff] shadow-[0_14px_34px_rgba(123,71,214,0.15)]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-current stroke-[2.5]">
        <path d="M6 4v7" />
        <path d="M9 4v7" />
        <path d="M4 4v5a4 4 0 0 0 4 4v8" />
        <path d="M16 4v17" />
        <path d="M20 4v10c-2.5 0-4-1.6-4-4V4" />
      </svg>
    ),
  },
} as const;

function ClockBadge() {
  return (
    <div className="relative hidden h-24 w-24 shrink-0 place-items-center rounded-full bg-[#e8f4ef] text-[#006e51] md:grid">
      <span className="absolute -left-2 top-2 text-lg font-bold">+</span>
      <span className="absolute -right-2 top-1 text-lg font-bold">+</span>
      <span className="absolute -bottom-1 left-0 text-lg font-bold">+</span>
      <span className="absolute -bottom-2 right-0 text-lg font-bold">+</span>
      <span className="grid h-12 w-12 place-items-center rounded-full border-4 border-current bg-white/30">
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-[2.2]">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
    </div>
  );
}

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
  const [mounted, setMounted] = useState(false);

  const warningNotifiedForId = useRef<string | null>(null);
  const exceededNotifiedForId = useRef<string | null>(null);

  const warningMinutes = settings.break_warning_minutes ?? 2;
  const safeTimezone = normalizeTimezone(settings.timezone);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          } else {
            setActiveBreak((current) => (current?.id === row.id ? null : current));
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
  }, [employee.id, router]);

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
          `Break reminder · ${warningMinutes} MINUTE${warningMinutes === 1 ? "" : "S"} REMAINING`,
          `Your ${breakTypeLabel(activeBreak.break_type)} break ends soon. Please wrap up.`
        );
      }
    } else if (phase === "exceeded") {
      startExceededAlarmLoop();
      if (exceededNotifiedForId.current !== activeBreak.id) {
        exceededNotifiedForId.current = activeBreak.id;
        warningNotifiedForId.current = activeBreak.id;
        showBrowserNotification(
          "Break time exceeded",
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

  if (!mounted) {
    return (
      <Card className="animate-rise rounded-[18px] p-8 shadow-[0_18px_50px_rgba(20,32,51,0.10)] md:p-10">
        <div className="h-8 w-24 rounded-md bg-black/5" />
        <div className="mt-4 h-10 w-56 rounded-md bg-black/5" />
        <div className="mt-2 h-5 w-96 max-w-full rounded-md bg-black/5" />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="h-28 rounded-2xl bg-black/5" />
          <div className="h-28 rounded-2xl bg-black/5" />
          <div className="h-28 rounded-2xl bg-black/5" />
        </div>
        <div className="mt-10 h-20 w-full rounded-[22px] bg-black/5" />
      </Card>
    );
  }

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
      <Card className="animate-rise rounded-[18px] border-[#dce3ec] bg-white/95 p-5 shadow-[0_20px_54px_rgba(22,41,70,0.11)] sm:p-8 md:p-10">
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <Badge tone="brand">
              <span className="mr-2 h-2.5 w-2.5 rounded-full bg-[#24b476]" />
              Ready
            </Badge>
            <h2 className="mt-4 text-2xl font-extrabold tracking-normal text-[#10233c] sm:text-3xl md:text-4xl">
              Break Status
            </h2>
            <p className="mt-4 text-base font-medium text-[#5c687d] sm:text-lg">
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
          <ClockBadge />
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {BREAK_TYPE_OPTIONS.map((option) => {
            const selected = selectedType === option.type;
            const displayMinutes = settings.break_test_mode
              ? settings.break_test_minutes
              : option.minutes;
            const styles = breakOptionStyles[option.type];
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setSelectedType(option.type)}
                disabled={pending}
                className={cn(
                  "group relative min-h-[8.5rem] rounded-[16px] border bg-white px-5 py-5 text-left transition sm:min-h-[10rem] sm:px-6 sm:py-6",
                  selected ? styles.selected : styles.ring
                )}
                style={{ color: styles.accent }}
              >
                <span className="flex items-start gap-4">
                  <span
                    className="grid h-16 w-16 shrink-0 place-items-center rounded-full sm:h-20 sm:w-20"
                    style={{ backgroundColor: styles.soft }}
                  >
                    {styles.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold uppercase sm:text-base">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-2xl font-extrabold text-[#10233c] sm:mt-2 sm:text-3xl">
                      {displayMinutes} min
                    </span>
                    <span className="mt-1 block text-sm font-medium text-[#657189] sm:mt-2 sm:text-base">
                      {settings.break_test_mode
                        ? `Test duration, normally ${option.description}`
                        : `${option.label} — ${option.description}`}
                    </span>
                  </span>
                </span>
                <span
                  className="mt-4 block h-1 w-20 rounded-full"
                  style={{ backgroundColor: styles.accent }}
                />
              </button>
            );
          })}
        </div>

        <Button
          size="xl"
          className="mt-8 h-16 w-full rounded-[14px] bg-[#006b4c] text-xl font-extrabold shadow-[inset_0_-4px_0_rgba(0,0,0,0.12),0_18px_34px_rgba(0,107,76,0.24)] hover:bg-[#007b58] sm:mt-10 sm:h-20 sm:text-2xl"
          onClick={onStart}
          disabled={pending || !selectedType}
        >
          {pending ? (
            "Starting..."
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-[2]">
                <path d="m8 5 11 7-11 7V5Z" />
              </svg>
              START BREAK
            </>
          )}
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
        "animate-rise overflow-hidden rounded-[18px] border-[#dce3ec] bg-white/95 p-5 shadow-[0_20px_54px_rgba(22,41,70,0.11)] sm:p-8 md:p-10",
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

      <h2 className="mt-5 text-2xl font-extrabold tracking-normal text-[#10233c] sm:text-3xl md:text-4xl">
        {breakTypeLabel(activeBreak.break_type)} Break
      </h2>

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
            {formatOfficeTime(activeBreak.started_at, safeTimezone)}
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
              "mt-1 break-words font-[family-name:var(--font-mono)] text-3xl font-semibold tracking-tight sm:text-4xl",
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
        className="mt-8 h-16 w-full rounded-[14px] text-xl font-extrabold sm:mt-10 sm:h-20 sm:text-2xl"
        onClick={onEnd}
        disabled={pending}
      >
        {pending ? "Ending..." : "END BREAK"}
      </Button>
    </Card>
  );
}
