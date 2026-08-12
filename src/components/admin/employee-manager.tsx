"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createEmployee,
  resetEmployeePin,
  setEmployeeActive,
  updateEmployee,
} from "@/actions/employees";
import type { Employee } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/card";

const emptyForm = {
  full_name: "",
  employee_id: "",
  department: "General",
  pin: "",
  role: "employee" as "employee" | "admin",
  is_active: true,
};

type PinReveal = {
  title: string;
  full_name: string;
  employee_id: string;
  temporaryPin: string;
  note: string;
};

export function EmployeeManager({
  employees,
  initialSearch = "",
}: {
  employees: Employee[];
  initialSearch?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(employees);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [pinReveal, setPinReveal] = useState<PinReveal | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  useEffect(() => {
    setRows(employees);
  }, [employees]);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  const departments = useMemo(
    () =>
      Array.from(new Set(rows.map((e) => e.department).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((emp) => {
      if (departmentFilter && emp.department !== departmentFilter) return false;
      if (statusFilter === "active" && !emp.is_active) return false;
      if (statusFilter === "inactive" && emp.is_active) return false;
      if (!q) return true;
      return (
        emp.full_name.toLowerCase().includes(q) ||
        emp.employee_id.toLowerCase().includes(q) ||
        (emp.email ?? "").toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
      );
    });
  }, [rows, search, departmentFilter, statusFilter]);

  async function copyPin(pin: string) {
    try {
      await navigator.clipboard.writeText(pin);
      toast.success("PIN copied");
    } catch {
      toast.error("Unable to copy PIN. Please copy it manually.");
    }
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createEmployee({
        full_name: form.full_name,
        employee_id: form.employee_id,
        department: form.department,
        pin: form.pin.trim() || undefined,
        role: form.role,
        is_active: form.is_active,
      });
      if (!result.success || !result.data) {
        const message = result.success
          ? "Unable to create employee."
          : result.error;
        console.error("[EmployeeManager] create failed:", message, result);
        toast.error(message);
        return;
      }

      const { employee, temporaryPin, pinWasGenerated } = result.data;
      setForm(emptyForm);
      setRows((prev) =>
        [...prev.filter((r) => r.id !== employee.id), employee].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      toast.success(result.message ?? "Employee created successfully");
      setPinReveal({
        title: "Employee created successfully",
        full_name: employee.full_name,
        employee_id: employee.employee_id,
        temporaryPin,
        note: pinWasGenerated
          ? "A secure 4-digit temporary PIN was generated automatically. Share it with the employee now — it will not be shown again."
          : "Share this PIN with the employee now — it will not be shown again.",
      });
      router.refresh();
    });
  }

  function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    startTransition(async () => {
      const result = await updateEmployee(editing.id, {
        full_name: editing.full_name,
        employee_id: editing.employee_id,
        email: editing.email,
        department: editing.department,
        role: editing.role,
        is_active: editing.is_active,
      });
      if (!result.success) {
        console.error("[EmployeeManager] update failed:", result.error);
        toast.error(result.error);
        return;
      }
      if (result.data) {
        setRows((prev) =>
          prev
            .map((r) => (r.id === result.data!.id ? result.data! : r))
            .sort((a, b) => a.full_name.localeCompare(b.full_name))
        );
      }
      toast.success(result.message);
      setEditing(null);
      router.refresh();
    });
  }

  function onResetPin(emp: Employee) {
    const confirmed = window.confirm(
      `Generate a new temporary PIN for ${emp.full_name}? The previous PIN will stop working immediately.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await resetEmployeePin(emp.id);
      if (!result.success || !result.data) {
        const message = result.success
          ? "Unable to reset PIN."
          : result.error;
        console.error("[EmployeeManager] reset PIN failed:", message);
        toast.error(message);
        return;
      }
      setPinReveal({
        title: "PIN Reset Successfully",
        full_name: result.data.employee.full_name,
        employee_id: result.data.employee.employee_id,
        temporaryPin: result.data.temporaryPin,
        note: "A new temporary PIN was generated. Share it with the employee now — it will not be shown again.",
      });
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-sm text-[var(--ink-muted)]">
          Break limits are fixed: Breakfast 15, Coffee 15, Lunch 60. Leave PIN
          blank when creating an employee to auto-generate a secure 4-digit
          temporary PIN. PINs are hashed in Supabase Auth and never shown in the
          employee list.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Add employee
          </h2>
          <form onSubmit={onCreate} className="mt-5 space-y-4">
            <div>
              <Label>Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Employee ID</Label>
              <Input
                value={form.employee_id}
                onChange={(e) =>
                  setForm({ ...form, employee_id: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>PIN (optional)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                  })
                }
                placeholder="Leave blank to auto-generate"
              />
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                If empty, a secure 4-digit temporary PIN is generated.
              </p>
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as "employee" | "admin",
                  })
                }
              >
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.is_active ? "active" : "inactive"}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving..." : "Add employee"}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Search</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, ID, department..."
                />
              </div>
              <div>
                <Label>Department</Label>
                <Select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as "all" | "active" | "inactive"
                    )
                  }
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--line)] px-6 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Employees ({filtered.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f3ea] text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => (
                    <tr key={emp.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                      <td className="px-4 py-3">{emp.employee_id}</td>
                      <td className="px-4 py-3">{emp.department}</td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={emp.role === "admin" ? "brand" : "neutral"}
                        >
                          {emp.role === "admin" ? "Admin" : "Employee"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={emp.is_active ? "ok" : "warn"}>
                          {emp.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="md"
                            variant="secondary"
                            onClick={() => setEditing(emp)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="md"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => onResetPin(emp)}
                          >
                            Reset PIN
                          </Button>
                          <Button
                            size="md"
                            variant="ghost"
                            onClick={() =>
                              startTransition(async () => {
                                const result = await setEmployeeActive(
                                  emp.id,
                                  !emp.is_active
                                );
                                if (!result.success) {
                                  console.error(
                                    "[EmployeeManager] status update failed:",
                                    result.error
                                  );
                                  toast.error(result.error);
                                  return;
                                }
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.id === emp.id
                                      ? { ...r, is_active: !emp.is_active }
                                      : r
                                  )
                                );
                                toast.success(result.message);
                                router.refresh();
                              })
                            }
                          >
                            {emp.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-[var(--ink-muted)]"
                      >
                        No employees match your filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Edit employee
            </h3>
            <form onSubmit={onUpdate} className="mt-4 space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  value={editing.full_name}
                  onChange={(e) =>
                    setEditing({ ...editing, full_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Employee ID</Label>
                <Input
                  value={editing.employee_id}
                  onChange={(e) =>
                    setEditing({ ...editing, employee_id: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Department</Label>
                <Input
                  value={editing.department}
                  onChange={(e) =>
                    setEditing({ ...editing, department: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      role: e.target.value as "employee" | "admin",
                    })
                  }
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editing.is_active ? "active" : "inactive"}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      is_active: e.target.value === "active",
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {pinReveal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="animate-rise w-full max-w-md p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
              Success
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">
              {pinReveal.title}
            </h3>

            <div className="mt-6 space-y-3 rounded-2xl bg-[var(--brand-soft)] p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--ink-muted)]">Employee</span>
                <span className="font-semibold">{pinReveal.full_name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--ink-muted)]">Employee ID</span>
                <span className="font-semibold">{pinReveal.employee_id}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] pt-3">
                <span className="text-[var(--ink-muted)]">Temporary PIN</span>
                <span className="font-[family-name:var(--font-mono)] text-2xl font-semibold tracking-[0.2em] text-[var(--brand-dark)]">
                  {pinReveal.temporaryPin}
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm text-[var(--ink-muted)]">{pinReveal.note}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void copyPin(pinReveal.temporaryPin)}
              >
                Copy PIN
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPinReveal(null)}
              >
                Done
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
