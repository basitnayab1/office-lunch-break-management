import { redirect } from "next/navigation";
import { getCurrentEmployee, logout } from "@/actions/auth";
import { getActiveBreak, getMyBreakHistory } from "@/actions/breaks";
import { getOfficeSettings } from "@/actions/settings";
import { BreakControl } from "@/components/employee/break-control";
import { BreakHistoryList } from "@/components/employee/break-history";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function EmployeeDashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (employee.role === "admin") redirect("/admin");

  const [activeBreak, history, settings] = await Promise.all([
    getActiveBreak(),
    getMyBreakHistory(),
    getOfficeSettings(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
            {settings.office_name}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
            Welcome, {employee.full_name}
          </h1>
          <p className="mt-2 text-[var(--ink-muted)]">
            {employee.department} · {employee.employee_id}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await logout();
            redirect("/");
          }}
        >
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </header>

      <div className="space-y-6">
        <BreakControl
          employee={employee}
          initialBreak={activeBreak}
          settings={settings}
        />
        <BreakHistoryList breaks={history} timezone={settings.timezone} />
      </div>
    </main>
  );
}
