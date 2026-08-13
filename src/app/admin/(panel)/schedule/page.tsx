import { getUpcomingBookings } from "@/actions/bookings";
import { getOfficeSettings } from "@/actions/settings";
import { SchedulePanel } from "@/components/admin/schedule-panel";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const [bookings, settings] = await Promise.all([
    getUpcomingBookings(),
    getOfficeSettings(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">
          Schedule
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Reserved break slots, waiting-list positions, and cancellation control.
        </p>
      </div>

      <SchedulePanel initialBookings={bookings} timezone={settings.timezone} />
    </div>
  );
}
