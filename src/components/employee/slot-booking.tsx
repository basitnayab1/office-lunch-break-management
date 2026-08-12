"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelBreakBooking, reserveBreakSlot } from "@/actions/bookings";
import { formatOfficeDateTime } from "@/lib/time/timezone";
import type { BreakBooking, OfficeSettings } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useRouter } from "next/navigation";

function defaultStartValue() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date.toISOString().slice(0, 16);
}

export function SlotBooking({
  initialBookings,
  settings,
}: {
  initialBookings: BreakBooking[];
  settings: OfficeSettings;
}) {
  const router = useRouter();
  const [start, setStart] = useState(defaultStartValue);
  const [minutes, setMinutes] = useState(settings.default_break_minutes);
  const [pending, startTransition] = useTransition();

  function onReserve() {
    startTransition(async () => {
      const result = await reserveBreakSlot(start, minutes);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Slot reserved.");
      router.refresh();
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      const result = await cancelBreakBooking(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Booking cancelled.");
      router.refresh();
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

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div>
          <Label htmlFor="slot-start">Slot start</Label>
          <Input
            id="slot-start"
            type="datetime-local"
            value={start}
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
        <Button onClick={onReserve} disabled={pending}>
          Reserve
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {initialBookings.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No upcoming slots.</p>
        ) : (
          initialBookings.map((booking) => (
            <div
              key={booking.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {formatOfficeDateTime(booking.scheduled_start, settings.timezone)}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  Until {formatOfficeDateTime(booking.scheduled_end, settings.timezone)}
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
