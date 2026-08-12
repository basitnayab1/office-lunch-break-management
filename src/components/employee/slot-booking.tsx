"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { cancelBreakBooking, reserveBreakSlot } from "@/actions/bookings";
import {
  formatOfficeDateTime,
  normalizeTimezone,
} from "@/lib/time/timezone";
import type { BreakBooking, OfficeSettings } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useRouter } from "next/navigation";

export function SlotBooking({
  initialBookings,
  settings,
  initialStartValue,
  initialMinValue,
}: {
  initialBookings: BreakBooking[];
  settings: OfficeSettings;
  initialStartValue: string;
  initialMinValue: string;
}) {
  const router = useRouter();
  const safeTimezone = normalizeTimezone(settings.timezone);
  const [start, setStart] = useState(initialStartValue);
  const [minutes, setMinutes] = useState(settings.default_break_minutes);
  const [bookings, setBookings] = useState(initialBookings);
  const [lastAction, setLastAction] = useState("");
  const [pending, startTransition] = useTransition();
  const minStart = initialMinValue;

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  function onReserve(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!start) {
      toast.error("Please choose a slot start time.");
      return;
    }
    if (!minutes || minutes < 5) {
      toast.error("Please enter at least 5 minutes.");
      return;
    }
    setLastAction("Reserving slot...");
    toast.loading("Reserving slot...", { id: "reserve-slot" });
    startTransition(async () => {
      try {
        const result = await reserveBreakSlot(start, minutes);
        if (!result.success) {
          setLastAction("");
          toast.dismiss("reserve-slot");
          if (result.error === "__BOOKINGS_DISABLED__") {
            toast.error("Slot booking is not available yet.");
            router.refresh();
            return;
          }
          toast.error(result.error);
          return;
        }
        if (result.data) {
          setBookings((current) => {
            const next = current.filter((item) => item.id !== result.data?.id);
            return [result.data!, ...next].sort(
              (a, b) =>
                new Date(a.scheduled_start).getTime() -
                new Date(b.scheduled_start).getTime()
            );
          });
        }
        setLastAction(result.message ?? "Slot reserved.");
        toast.success(result.message ?? "Slot reserved.", { id: "reserve-slot" });
        router.refresh();
      } catch (error) {
        setLastAction("");
        toast.error("An unexpected error occurred while reserving the slot.", {
          id: "reserve-slot",
        });
        console.error(error);
      }
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      try {
        const result = await cancelBreakBooking(id);
        if (!result.success) {
          if (result.error === "__BOOKINGS_DISABLED__") {
            router.refresh();
            return;
          }
          toast.error(result.error);
          return;
        }
        setBookings((current) => current.filter((booking) => booking.id !== id));
        toast.success(result.message ?? "Booking cancelled.");
        router.refresh();
      } catch (error) {
        toast.error("An unexpected error occurred while cancelling.");
        console.error(error);
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Reserve a Break Slot
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Full slots place you on the waiting list automatically.
          </p>
        </div>
        <Badge tone="brand">Booking</Badge>
      </div>

      <form
        onSubmit={onReserve}
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"
      >
        <div>
          <Label htmlFor="slot-start">Slot start</Label>
          <Input
            id="slot-start"
            type="datetime-local"
            value={start}
            min={minStart}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="slot-minutes">Minutes</Label>
          <Input
            id="slot-minutes"
            type="number"
            min={5}
            max={180}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Reserving..." : "Reserve"}
        </Button>
      </form>
      {lastAction ? (
        <p className="mt-2 text-sm font-medium text-[var(--brand)]">
          {lastAction}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {bookings.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No upcoming slots.</p>
        ) : (
          bookings.map((booking) => (
            <div
              key={booking.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {formatOfficeDateTime(booking.scheduled_start, safeTimezone)}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  Until {formatOfficeDateTime(booking.scheduled_end, safeTimezone)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={booking.status === "waiting" ? "warn" : "ok"}>
                  {booking.status === "waiting"
                    ? `Waiting #${booking.position + 1}`
                    : "Scheduled"}
                </Badge>
                <Button
                  variant="secondary"
                  onClick={() => onCancel(booking.id)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
