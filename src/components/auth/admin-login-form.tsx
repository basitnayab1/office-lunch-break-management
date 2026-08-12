"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { adminLogin } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { BiteStationLogo } from "@/components/brand/bite-station-logo";

export function AdminLoginForm({ officeName }: { officeName: string }) {
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
      window.location.replace("/admin");
    });
  }

  return (
    <div className="animate-rise mx-auto w-full max-w-[420px]">
      <div className="mb-8">
        <div className="flex flex-col items-start gap-3">
          <BiteStationLogo size={86} priority className="shrink-0 drop-shadow-sm" />
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Admin Panel · {officeName}
          </p>
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
