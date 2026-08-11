import nextDynamic from "next/dynamic";
import { listEmployees } from "@/actions/employees";

const EmployeeManager = nextDynamic(
  () =>
    import("@/components/admin/employee-manager").then((m) => ({
      default: m.EmployeeManager,
    })),
  {
    loading: () => (
      <div className="h-96 animate-pulse rounded-2xl border border-[var(--line)] bg-white/60" />
    ),
  }
);

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const employees = await listEmployees();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Employee management
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Add, edit, activate/deactivate, search, and reset PINs. New active
          employees appear immediately on the employee login dropdown.
        </p>
      </div>
      <EmployeeManager employees={employees} />
    </div>
  );
}
