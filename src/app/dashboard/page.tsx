import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/actions/auth";
import { getActiveBreak, getMyBreakHistory } from "@/actions/breaks";
import {
  getMyUpcomingBookings,
  isBreakBookingAvailable,
} from "@/actions/bookings";
import { getOfficeSettings } from "@/actions/settings";
import { getMyNotifications } from "@/actions/notifications";
import { BreakControl } from "@/components/employee/break-control";
import { BreakHistoryList } from "@/components/employee/break-history";
import { SlotBooking } from "@/components/employee/slot-booking";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { BiteStationBrand } from "@/components/brand/bite-station-logo";
import { EmployeeProfileMenu } from "@/components/employee/employee-profile-menu";
import { formatInTimeZone } from "date-fns-tz";
import { normalizeTimezone } from "@/lib/time/timezone";

export const dynamic = "force-dynamic";

function OfficeMark() {
  return (
    <span className="inline-flex items-center justify-center">
      <BiteStationBrand logoSize={76} priority />
    </span>
  );
}

export default async function EmployeeDashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (employee.role === "admin") redirect("/admin");

  const [
    activeBreak,
    history,
    settings,
    bookings,
    bookingAvailable,
    notifications,
  ] = await Promise.all([
    getActiveBreak(),
    getMyBreakHistory(),
    getOfficeSettings(),
    getMyUpcomingBookings(),
    isBreakBookingAvailable(),
    getMyNotifications(),
  ]);

  const safeTimezone = normalizeTimezone(settings.timezone);
  const bookingStartValue = formatInTimeZone(
    new Date(Date.now() + 30 * 60_000),
    safeTimezone,
    "yyyy-MM-dd'T'HH:mm"
  );
  const bookingMinValue = formatInTimeZone(
    new Date(Date.now() + 15 * 60_000),
    safeTimezone,
    "yyyy-MM-dd'T'HH:mm"
  );

  const displayEmail =
    employee.email && !employee.email.endsWith("@office.local")
      ? employee.email
      : employee.employee_id;
  const employeeSubtitle = `${
    employee.designation || employee.department
  } • ${displayEmail}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8fbfa] text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-36 bg-white" />
        <div className="absolute inset-x-0 top-[7.25rem] h-px bg-[#dfe6ef]" />
        <div className="absolute inset-x-0 top-[7.3rem] h-20 bg-[radial-gradient(circle_at_50%_0%,rgba(31,140,99,0.16),transparent_58%)] blur-md" />
        <div className="absolute -left-48 top-[19rem] h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(15,122,90,0.09)_0%,rgba(15,122,90,0.07)_33%,transparent_34%)]" />
        <div className="absolute -left-24 top-[27rem] h-[25rem] w-[25rem] rounded-full bg-[radial-gradient(circle,rgba(15,122,90,0.11)_0%,rgba(15,122,90,0.09)_44%,transparent_45%)]" />
        <div className="absolute -right-40 top-[38rem] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(15,122,90,0.08)_0%,rgba(15,122,90,0.06)_44%,transparent_45%)]" />
        <div className="absolute right-5 top-[28rem] grid grid-cols-5 gap-3 opacity-30">
          {Array.from({ length: 30 }).map((_, index) => (
            <span key={index} className="h-1 w-1 rounded-full bg-[var(--brand)]/35" />
          ))}
        </div>
        <div className="absolute left-5 top-[34rem] grid grid-cols-5 gap-3 opacity-25">
          {Array.from({ length: 25 }).map((_, index) => (
            <span key={index} className="h-1 w-1 rounded-full bg-[var(--brand)]/45" />
          ))}
        </div>
      </div>

      <header className="relative z-30 bg-white">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4 px-5 py-6 md:px-16 lg:px-20">
          <div className="flex items-center gap-10">
            <OfficeMark />
            <div className="hidden h-12 w-px bg-[#dde4ec] md:block" />
            <div className="hidden md:block">
              <p className="text-sm font-extrabold uppercase tracking-[0.34em] text-[var(--brand)]">
                {settings.office_name}
              </p>
            </div>
          </div>
          <EmployeeProfileMenu employee={employee} />
        </div>
      </header>

      <section className="relative mx-auto max-w-[1040px] px-5 pb-10 pt-14 md:px-6 md:pb-14 md:pt-16">
        <div className="space-y-4">
          <p className="text-xl font-bold text-[#5c687d]">
              Good to see you,
          </p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-normal text-[#10233c] md:text-5xl">
            {employee.full_name.split(" ").slice(0, -1).join(" ") || employee.full_name}{" "}
            <span className="text-[#117149]">
              {employee.full_name.split(" ").length > 1
                ? employee.full_name.split(" ").slice(-1)
                : ""}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-lg font-medium text-[#5f6b80]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e3f3eb] text-[#008655]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
                <path d="M3 12h18" />
                <path d="M9 12v2" />
                <path d="M15 12v2" />
                  </svg>
              </span>
            <span>{employeeSubtitle}</span>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <BreakControl
            employee={employee}
            initialBreak={activeBreak}
            settings={settings}
          />

          <div className="flex items-center justify-center gap-2 text-base font-semibold text-[#68758b]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
              <path d="M12 3 5 6v5c0 4.4 2.7 8.2 7 10 4.3-1.8 7-5.6 7-10V6l-7-3Z" />
              <path d="m9 12 2 2 4-5" />
            </svg>
            <span>Your breaks are private and secure</span>
          </div>

          {bookingAvailable ? (
            <SlotBooking
              initialBookings={bookings}
              settings={settings}
              initialStartValue={bookingStartValue}
              initialMinValue={bookingMinValue}
            />
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <BreakHistoryList breaks={history} timezone={settings.timezone} />
            <div className="rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_12px_40px_rgba(20,32,51,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                Office status
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[var(--brand-soft)] px-4 py-4">
                  <p className="text-sm text-[var(--ink-muted)]">Timezone</p>
                  <p className="mt-1 font-semibold">{safeTimezone}</p>
                </div>
                <div className="rounded-2xl bg-[var(--ok-soft)] px-4 py-4">
                  <p className="text-sm text-[var(--ink-muted)]">Break duration</p>
                  <p className="mt-1 font-semibold">{settings.default_break_minutes} min</p>
                </div>
                <div className="rounded-2xl bg-[var(--warn-soft)] px-4 py-4">
                  <p className="text-sm text-[var(--ink-muted)]">Warning</p>
                  <p className="mt-1 font-semibold">{settings.break_warning_minutes} min before end</p>
                </div>
                <div className="rounded-2xl bg-[var(--danger-soft)] px-4 py-4">
                  <p className="text-sm text-[var(--ink-muted)]">Capacity</p>
                  <p className="mt-1 font-semibold">
                    {settings.max_simultaneous_breaks} simultaneous
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <NotificationCenter
        employee={employee}
        initialNotifications={notifications}
        timezone={settings.timezone}
      />
    </main>
  );
}
