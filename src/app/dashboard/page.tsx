import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/actions/auth";
import { getActiveBreak, getMyBreakHistory } from "@/actions/breaks";
import { getMyUpcomingBookings } from "@/actions/bookings";
import { getOfficeSettings } from "@/actions/settings";
import { getMyNotifications } from "@/actions/notifications";
import { BreakControl } from "@/components/employee/break-control";
import { BreakHistoryList } from "@/components/employee/break-history";
import { SlotBooking } from "@/components/employee/slot-booking";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { BiteStationBrand } from "@/components/brand/bite-station-logo";
import { EmployeeProfileMenu } from "@/components/employee/employee-profile-menu";

export const dynamic = "force-dynamic";

export default async function EmployeeDashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (employee.role === "admin") redirect("/admin");

  const [activeBreak, history, settings, bookings, notifications] = await Promise.all([
    getActiveBreak(),
    getMyBreakHistory(),
    getOfficeSettings(),
    getMyUpcomingBookings(),
    getMyNotifications(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <BiteStationBrand logoSize={48} />
          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
            {settings.office_name}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
            Welcome, {employee.full_name}
          </h1>
          <p className="mt-2 text-[var(--ink-muted)]">
            {employee.department} · {employee.employee_id}
          </p>
        </div>
        <EmployeeProfileMenu employee={employee} />
      </header>

      <div className="space-y-6">
        <BreakControl
          employee={employee}
          initialBreak={activeBreak}
          settings={settings}
        />
        <SlotBooking initialBookings={bookings} settings={settings} />
        <BreakHistoryList breaks={history} timezone={settings.timezone} />
      </div>
      <NotificationCenter
        employee={employee}
        initialNotifications={notifications}
        timezone={settings.timezone}
      />
    </main>
  );
}
