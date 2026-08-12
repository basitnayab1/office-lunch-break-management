"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loginWithPin } from "@/actions/auth";
import type { EmployeeLoginOption } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { BiteStationLogo } from "@/components/brand/bite-station-logo";

export function LoginForm({
  officeName,
  initialEmployees = [],
}: {
  officeName: string;
  initialEmployees?: EmployeeLoginOption[];
}) {
  const router = useRouter();
  const [employees] = useState<EmployeeLoginOption[]>(initialEmployees);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();
  const listReady = employees.length > 0;

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
    });
  }

  return (
    <div className="animate-rise mx-auto w-full max-w-[420px]">
      <div className="mb-8">
        <div className="flex flex-col items-start gap-3">
          <BiteStationLogo size={104} priority className="shrink-0 drop-shadow-sm" />
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            {officeName}
          </p>
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
            disabled={pending || !listReady}
            required
            className="h-12"
          >
            <option value="">
              {listReady ? "Select employee" : "No employees available"}
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
