"use client";

import { useState, useTransition, type InputHTMLAttributes } from "react";
import { toast } from "sonner";
import { recordAdminPasswordChanged } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { isLikelyLeakedPasswordError } from "@/lib/auth/pin";

const ADMIN_PASSWORD_MIN_LENGTH = 8;

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  visible,
  onToggleVisible,
}: {
  id: string;
  label: string;
  autoComplete: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={id === "admin-current-password" ? 1 : ADMIN_PASSWORD_MIN_LENGTH}
          className="pr-12"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute inset-y-0 right-0 min-w-11 px-3 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function safeAuthErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
  } | null;
  const raw = (typeof err?.message === "string" ? err.message : fallback).replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[redacted]"
  );
  const code = (err?.code ?? "").toLowerCase();
  const name = (err?.name ?? "").toLowerCase();
  const status = err?.status;
  const lower = raw.toLowerCase();

  if (
    name.includes("authsessionmissing") ||
    code === "session_not_found" ||
    lower.includes("auth session missing")
  ) {
    return "Your session expired. Please sign in again.";
  }
  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_credentials")
  ) {
    return "Current password is incorrect.";
  }
  if (isLikelyLeakedPasswordError(raw)) {
    return "That password appears in known data breaches. Please choose a stronger password.";
  }
  if (code === "weak_password" || lower.includes("password should be at least")) {
    return raw.length < 200 ? raw : "New password is too weak. Choose a stronger password.";
  }
  if (
    status === 429 ||
    code.includes("over_request") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code === "same_password" || lower.includes("same password")) {
    return "New password must be different from the current password.";
  }
  if (
    raw &&
    raw.length < 180 &&
    !/token|secret|apikey|authorization/i.test(raw)
  ) {
    return raw;
  }
  return fallback;
}

export function AdminChangePasswordForm() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      toast.error("Current password, new password, and confirmation are required.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (form.newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      toast.error(`New password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (form.newPassword === form.currentPassword) {
      toast.error("New password must be different from the current password.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();

      if (sessionError || !user) {
        toast.error(
          safeAuthErrorMessage(sessionError, "Your session expired. Please sign in again.")
        );
        return;
      }
      if (!user.email) {
        toast.error("This admin account has no email for password login.");
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: form.currentPassword,
      });
      if (verifyError) {
        toast.error(safeAuthErrorMessage(verifyError, "Current password is incorrect."));
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: form.newPassword,
      });
      if (error) {
        toast.error(safeAuthErrorMessage(error, "Unable to change password."));
        return;
      }

      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      toast.success("Password changed successfully.");

      const audit = await recordAdminPasswordChanged();
      if (!audit.success) {
        console.error("[AdminChangePasswordForm] audit log failed", audit.error);
      }
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
        Change Password
      </h2>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Update the password for the admin account you are signed in as. This uses
        Supabase Auth and is not stored in the employees table.
      </p>
      <form onSubmit={onSubmit} className="mt-5 max-w-xl space-y-4">
        <PasswordField
          id="admin-current-password"
          label="Current Password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(currentPassword) => setForm({ ...form, currentPassword })}
          visible={showCurrent}
          onToggleVisible={() => setShowCurrent((value) => !value)}
        />
        <PasswordField
          id="admin-new-password"
          label="New Password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(newPassword) => setForm({ ...form, newPassword })}
          visible={showNew}
          onToggleVisible={() => setShowNew((value) => !value)}
        />
        <PasswordField
          id="admin-confirm-password"
          label="Confirm New Password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(confirmPassword) => setForm({ ...form, confirmPassword })}
          visible={showConfirm}
          onToggleVisible={() => setShowConfirm((value) => !value)}
        />
        <p className="text-xs text-[var(--ink-muted)]">
          Use at least 8 characters. You will stay signed in after a successful
          change.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing..." : "Change Password"}
        </Button>
      </form>
    </Card>
  );
}
