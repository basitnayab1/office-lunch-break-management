"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOfficeSettings } from "@/actions/settings";
import { retryFailedSheetSyncs } from "@/actions/breaks";
import type { OfficeSettings } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "UTC",
];

export function SettingsForm({
  settings,
  sheetsConfigured,
  envSheetId,
  serviceAccountEmail = null,
  sheetsOnly = false,
}: {
  settings: OfficeSettings;
  sheetsConfigured: boolean;
  envSheetId: string | null;
  serviceAccountEmail?: string | null;
  sheetsOnly?: boolean;
}) {
  const [form, setForm] = useState({
    office_name: settings.office_name,
    timezone: settings.timezone,
    default_break_minutes: settings.default_break_minutes,
    break_warning_minutes: settings.break_warning_minutes ?? 2,
    break_test_mode: settings.break_test_mode ?? false,
    break_test_minutes: settings.break_test_minutes ?? 3,
    google_sheet_id: settings.google_sheet_id ?? "",
    google_sheet_name: settings.google_sheet_name,
  });
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const sheetUrl = envSheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(envSheetId)}/edit`
    : null;

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateOfficeSettings({
        ...form,
        google_sheet_id: form.google_sheet_id || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
    });
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/google-sheets/test");
      const body = (await res.json()) as {
        ok: boolean;
        message: string;
        spreadsheetTitle?: string;
        sheetName?: string;
      };
      if (body.ok) {
        toast.success(
          `${body.message}${
            body.spreadsheetTitle
              ? ` (${body.spreadsheetTitle} / ${body.sheetName})`
              : ""
          }`
        );
      } else {
        console.error("[Google Sheets] connection test failed:", body);
        toast.error(body.message || "Connection test failed.");
      }
    } catch (err) {
      console.error("[Google Sheets] connection test request failed:", err);
      toast.error("Unable to reach the connection test endpoint.");
    } finally {
      setTesting(false);
    }
  }

  const sheetsCard = (
    <Card className={`p-6 ${sheetsOnly ? "max-w-2xl" : ""}`}>
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
        Google Sheets integration
      </h2>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) and
        primary sheet ID (`GOOGLE_SHEET_ID`) live in server environment variables
        only — never in the browser or Git.
      </p>
      <div className="mt-4 space-y-2 rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm">
        <p>
          Credentials:{" "}
          <strong>{sheetsConfigured ? "Configured" : "Missing env vars"}</strong>
        </p>
        <p className="break-all text-[var(--ink-muted)]">
          Sheet ID: {envSheetId || "not set"}
        </p>
        {serviceAccountEmail ? (
          <p className="break-all text-[var(--ink-muted)]">
            Service account: {serviceAccountEmail}
          </p>
        ) : null}
        <p className="text-[var(--ink-muted)]">
          Share the spreadsheet with the service account as{" "}
          <strong>Editor</strong>. A 403 means sharing is missing.
        </p>
      </div>
      <form onSubmit={onSave} className="mt-5 space-y-4">
        <div>
          <Label>Override Google Sheet ID (optional)</Label>
          <Input
            value={form.google_sheet_id}
            onChange={(e) =>
              setForm({ ...form, google_sheet_id: e.target.value })
            }
            placeholder="Uses GOOGLE_SHEET_ID from env when empty"
          />
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Env `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_NAME` take precedence when set.
            Target tab should be <strong>Break Records</strong>.
          </p>
        </div>
        <div>
          <Label>Sheet / tab name</Label>
          <Input
            value={form.google_sheet_name}
            onChange={(e) =>
              setForm({ ...form, google_sheet_name: e.target.value })
            }
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            Save sheet settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || testing}
            onClick={() => void testConnection()}
          >
            {testing ? "Testing..." : "Test connection"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!sheetUrl}
            onClick={() => {
              if (!sheetUrl) {
                toast.error("Google Sheet ID is not configured.");
                return;
              }
              window.open(sheetUrl, "_blank", "noopener,noreferrer");
            }}
          >
            Open Sheet
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await retryFailedSheetSyncs();
                if (!result.success) toast.error(result.error);
                else toast.success(result.message);
              })
            }
          >
            Retry failed syncs
          </Button>
        </div>
      </form>
    </Card>
  );

  if (sheetsOnly) {
    return sheetsCard;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Office settings
        </h2>
        <form onSubmit={onSave} className="mt-5 space-y-4">
          <div>
            <Label>Office name</Label>
            <Input
              value={form.office_name}
              onChange={(e) => setForm({ ...form, office_name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Timezone</Label>
            <Select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </div>
          <div className="rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            Break durations are fixed: Breakfast 15, Coffee 15, Lunch 60.
            Employees cannot change these limits.
          </div>
          <div>
            <Label>Break Warning Time</Label>
            <Select
              value={String(form.break_warning_minutes)}
              onChange={(e) =>
                setForm({
                  ...form,
                  break_warning_minutes: Number(e.target.value),
                })
              }
            >
              <option value="1">1 minute before end</option>
              <option value="2">2 minutes before end (default)</option>
              <option value="3">3 minutes before end</option>
              <option value="5">5 minutes before end</option>
            </Select>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Plays an alarm once and shows a visual warning this many minutes
              before the allowed break ends.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.break_test_mode}
                onChange={(e) =>
                  setForm({ ...form, break_test_mode: e.target.checked })
                }
              />
              <span>
                <span className="font-semibold">Enable short test breaks</span>
                <span className="mt-1 block text-[var(--ink-muted)]">
                  Temporary testing only. New breaks use the short duration below
                  so you can verify the warning alarm without waiting 15/60
                  minutes. Turn off for production.
                </span>
              </span>
            </label>
            <div className="mt-3">
              <Label>Test break duration (minutes)</Label>
              <Select
                value={String(form.break_test_minutes)}
                disabled={!form.break_test_mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    break_test_minutes: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((m) => (
                  <option key={m} value={m}>
                    {m} minute{m === 1 ? "" : "s"}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            Save settings
          </Button>
        </form>
      </Card>

      {sheetsCard}
    </div>
  );
}
