"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { adminCancelBreakBooking, getUpcomingBookings } from "@/actions/bookings";
import { createClient } from "@/lib/supabase/client";
import { formatOfficeDateTime } from "@/lib/time/timezone";
import type { BreakBooking } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";

export function SchedulePanel({
  initialBookings,
  timezone,
}: {
  initialBookings: BreakBooking[];
  timezone: string;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      startTransition(async () => setBookings(await getUpcomingBookings()));
    };
    const channel = supabase
      .channel("admin-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_bookings" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function cancelBooking(id: string) {
    const reason = window.prompt("Reason for cancelling this booking?");
    if (!reason) return;
    startTransition(async () => {
      const result = await adminCancelBreakBooking(id, reason);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Booking cancelled.");
      setBookings(await getUpcomingBookings());
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-4 sm:px-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Slot Booking Queue
        </h2>
        <Badge tone="brand">{bookings.length} upcoming</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Slot</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id} className="border-t border-[var(--line)]">
                <td className="max-w-[12rem] truncate px-4 py-3 font-medium" title={booking.employee?.full_name ?? "Employee"}>
                  {booking.employee?.full_name ?? "Employee"}
                </td>
                <td className="px-4 py-3">
                  {booking.employee?.department ?? "General"}
                </td>
                <td className="px-4 py-3">
                  {formatOfficeDateTime(booking.scheduled_start, timezone)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={booking.status === "waiting" ? "warn" : "ok"}>
                    {booking.status === "waiting"
                      ? `Waiting #${booking.position + 1}`
                      : booking.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="secondary"
                    onClick={() => cancelBooking(booking.id)}
                  >
                    Cancel
                  </Button>
                </td>
              </tr>
            ))}
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-[var(--ink-muted)]">
                  No upcoming bookings.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
