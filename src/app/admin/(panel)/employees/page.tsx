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

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const initialSearch = params?.q?.trim() ?? "";
  const employees = await listEmployees();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">
          Employee management
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Add, edit, activate/deactivate, search, and reset PINs. Employees
          sign in with their Employee ID and PIN.
        </p>
      </div>
      <EmployeeManager employees={employees} initialSearch={initialSearch} />
    </div>
  );
}
