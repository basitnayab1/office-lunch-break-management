"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { adminLogin } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { LunchBreakMark } from "@/components/brand/lunch-break-mark";

export function AdminLoginForm({ officeName }: { officeName: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await adminLogin(email, password);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Signed in");
      router.push("/admin");
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
          Admin Sign In
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Sign in with your admin email and password.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            autoComplete="username"
            placeholder="admin@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            required
            className="h-12"
          />
        </div>

        <div>
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
        Employee break login?{" "}
        <Link
          href="/"
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Go to employee login
        </Link>
      </p>
    </div>
  );
}
