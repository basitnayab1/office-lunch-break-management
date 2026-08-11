"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loginWithPin, listEmployeesForLogin } from "@/actions/auth";
import type { EmployeeLoginOption } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { LunchBreakMark } from "@/components/brand/lunch-break-mark";

export function LoginForm({ officeName }: { officeName: string }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeLoginOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listEmployeesForLogin().then((res) => {
      if (res.success && res.data) {
        setEmployees(res.data);
      } else {
        toast.error(res.success ? "No employees found." : res.error);
      }
      setLoadingList(false);
    });
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await loginWithPin(employeeId, pin);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Signed in");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="animate-rise mx-auto w-full max-w-[420px]">
      <div className="mb-8">
        <div className="flex items-center gap-3 text-[var(--brand)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)]">
            <LunchBreakMark size={30} />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em]">
              Lunch Break
            </p>
            <p className="text-xs text-[var(--ink-muted)]">{officeName}</p>
          </div>
        </div>

        <h1 className="mt-8 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)]">
          Welcome Back
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Select your name and enter your PIN to manage your breaks.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <Label htmlFor="employee">Employee Name</Label>
          <Select
            id="employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={loadingList || pending}
            required
            className="h-12"
          >
            <option value="">
              {loadingList ? "Loading..." : "Select employee"}
            </option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} — {emp.department}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="pin">PIN</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={pending}
            required
            className="h-12"
          />
        </div>

        <Button type="submit" size="lg" className="h-12 w-full" disabled={pending}>
          {pending ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[var(--ink-muted)]">
        Admin access?{" "}
        <Link
          href="/admin/login"
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Sign in to Admin Panel
        </Link>
      </p>
    </div>
  );
}
