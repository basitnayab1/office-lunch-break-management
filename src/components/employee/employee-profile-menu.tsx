"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeMyPassword, logout } from "@/actions/auth";
import { updateMyEmployeeProfile } from "@/actions/employees";
import { Button } from "@/components/ui/button";
import type { Employee } from "@/types/database";

export function EmployeeProfileMenu({ employee }: { employee: Employee }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialEmail = employee.email?.endsWith("@office.local")
    ? ""
    : employee.email ?? "";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee.full_name ?? "Employee");
  const [email, setEmail] = useState(initialEmail);
  const [imageUrl, setImageUrl] = useState(employee.avatar_url ?? "");
  const [fileName, setFileName] = useState("");
  const [pinForm, setPinForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pending, startTransition] = useTransition();

  const safeName = name?.trim() || "Employee";
  const initials = safeName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function Avatar({ large = false }: { large?: boolean }) {
    return (
      <span
        className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand)] font-bold text-white ${
          large ? "h-16 w-16 text-lg" : "h-10 w-10 text-sm"
        }`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
            <img
            src={imageUrl}
            alt={safeName}
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          initials
        )}
      </span>
    );
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("full_name", name);
    formData.set("email", email);
    const file = fileRef.current?.files?.[0];
    if (file) formData.set("profile_image_file", file);

    startTransition(async () => {
      const result = await updateMyEmployeeProfile(formData);
      if (!result.success || !result.data) {
        toast.error(result.success ? "Unable to update profile." : result.error);
        return;
      }
      setName(result.data.full_name);
      setEmail(
        result.data.email?.endsWith("@office.local") ? "" : result.data.email ?? ""
      );
      setImageUrl(result.data.avatar_url ?? "");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success(result.message ?? "Profile updated.");
      router.refresh();
    });
  }

  function savePin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await changeMyPassword(pinForm);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPinForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success(result.message ?? "PIN changed.");
    });
  }

  return (
    <div className="relative flex items-center gap-4">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="h-16 rounded-[12px] border-[#dce4ed] px-8 text-lg font-bold text-[#00664b] shadow-none hover:bg-[#f8fbfa]"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[2]">
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Profile
      </Button>
      <Button
        type="button"
        variant="primary"
        className="h-16 rounded-[12px] bg-[#006b4c] px-8 text-lg font-bold shadow-[0_12px_24px_rgba(0,107,76,0.22)] hover:bg-[#007b58]"
        onClick={async () => {
          await logout();
          router.push("/");
          router.refresh();
        }}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[2]">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
        Sign out
      </Button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 px-4 py-6">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-[430px] overflow-y-auto rounded-[12px] border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(20,32,51,0.24)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-3">
                <Avatar large />
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Employee profile
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-xl text-[var(--ink-muted)] transition hover:bg-[#f7f9fb]"
                onClick={() => setOpen(false)}
                aria-label="Close profile"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveProfile} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  Display name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  Upload profile picture
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setFileName(event.target.files?.[0]?.name ?? "")
                  }
                  className="mt-1 block w-full text-sm text-[var(--ink-muted)] file:mr-3 file:h-9 file:rounded-[8px] file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:text-sm file:font-semibold file:text-[var(--brand-dark)]"
                />
                {fileName ? (
                  <span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">
                    Selected: {fileName}
                  </span>
                ) : null}
              </label>
              <Button type="submit" disabled={pending}>
                Save profile
              </Button>
            </form>

            <form
              onSubmit={savePin}
              className="mt-5 space-y-3 border-t border-[var(--line)] pt-4"
            >
              <div>
                <p className="font-semibold">Change PIN</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Enter your current 4-digit PIN before saving a new one.
                </p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="current-password"
                value={pinForm.currentPassword}
                onChange={(event) =>
                  setPinForm({ ...pinForm, currentPassword: event.target.value })
                }
                placeholder="Current PIN"
                className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                required
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
                value={pinForm.newPassword}
                onChange={(event) =>
                  setPinForm({ ...pinForm, newPassword: event.target.value })
                }
                placeholder="New PIN"
                className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                required
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
                value={pinForm.confirmPassword}
                onChange={(event) =>
                  setPinForm({ ...pinForm, confirmPassword: event.target.value })
                }
                placeholder="Confirm new PIN"
                className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                required
              />
              <Button type="submit" variant="secondary" disabled={pending}>
                Change PIN
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
