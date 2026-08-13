"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loginWithPin } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { BiteStationLogo } from "@/components/brand/bite-station-logo";

export function LoginForm({ officeName }: { officeName: string }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pending, startTransition] = useTransition();

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
    <div className="animate-rise mx-auto w-full min-w-0 max-w-[420px]">
      <div className="mb-8">
        <div className="flex flex-col items-start gap-3">
          <BiteStationLogo size={80} priority className="max-w-full shrink-0 drop-shadow-sm sm:hidden" />
          <BiteStationLogo size={104} priority className="hidden shrink-0 drop-shadow-sm sm:block" />
          <p className="max-w-full break-words text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            {officeName}
          </p>
        </div>

        <h1 className="mt-8 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Welcome Back
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Enter your Employee ID and PIN to manage your breaks.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <Label htmlFor="employee-id">Employee ID</Label>
          <Input
            id="employee-id"
            name="employee-id"
            autoComplete="username"
            placeholder="Enter your Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={pending}
            required
            className="h-12"
          />
        </div>

        <div>
          <Label htmlFor="pin">PIN</Label>
          <div className="relative">
            <Input
              id="pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="Enter your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={pending}
              required
              className="h-12 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPin((value) => !value)}
              className="absolute inset-y-0 right-0 min-w-11 px-3 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
              aria-label={showPin ? "Hide PIN" : "Show PIN"}
            >
              {showPin ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="h-12 w-full" disabled={pending}>
          {pending ? "Signing in..." : "Login"}
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
