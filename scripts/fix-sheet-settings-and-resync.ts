/**
 * Align office_settings sheet name/ID with env "Break Records" target,
 * then re-sync recent completed breaks via append.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

async function main() {
  const sheetId =
    process.env.GOOGLE_SHEET_ID?.trim() ||
    "1HFD6sBnBfQMsbuE5a9F87p_pqbcB5my-xvL-zSFId7o";
  const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() || "Break Records";

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: settings, error: settingsError } = await sb
    .from("office_settings")
    .update({
      google_sheet_id: sheetId,
      google_sheet_name: sheetName,
    })
    .eq("id", 1)
    .select("google_sheet_id, google_sheet_name")
    .single();

  if (settingsError) {
    console.error("Failed to update office_settings:", settingsError);
    process.exit(1);
  }
  console.log("Updated office_settings:", settings);

  const { appendBreakToSheet, getGoogleSheetName, sheetA1 } = await import(
    "../src/lib/google-sheets/service"
  );
  const { google } = await import("googleapis");
  const { normalizeGooglePrivateKey } = await import(
    "../src/lib/google-sheets/service"
  );

  console.log("Resolved tab name:", getGoogleSheetName(settings.google_sheet_name));

  const { data: rows, error } = await sb
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .neq("status", "active")
    .order("ended_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  for (const session of rows ?? []) {
    const employee = session.employee as {
      id: string;
      employee_id: string;
      full_name: string;
      department: string;
      designation?: string;
      shift?: string;
      email: string | null;
      allowed_break_minutes: number;
      role: "employee" | "admin";
      is_active: boolean;
      avatar_url?: string | null;
      joining_date?: string | null;
      break_access_blocked_until?: string | null;
      break_access_block_reason?: string | null;
      created_at: string;
      updated_at: string;
    } | null;

    if (!employee || Array.isArray(session.employee)) {
      console.error("Skip (no employee embed):", session.id);
      continue;
    }

    try {
      const result = await appendBreakToSheet({
        session: { ...session, google_sheet_row_id: null },
        employee: {
          ...employee,
          designation: employee.designation ?? "",
          shift: employee.shift ?? "General",
          avatar_url: employee.avatar_url ?? null,
          joining_date: employee.joining_date ?? null,
          break_access_blocked_until: employee.break_access_blocked_until ?? null,
          break_access_block_reason: employee.break_access_block_reason ?? null,
        },
        settings: {
          id: 1,
          office_name: "Office",
          timezone: "Asia/Karachi",
          default_break_minutes: 60,
          break_warning_minutes: 2,
          break_test_mode: false,
          break_test_minutes: 3,
          grace_period_minutes: 5,
          daily_max_breaks: 3,
          min_work_minutes_before_break: 0,
          max_simultaneous_breaks: 10,
          office_start_time: "09:00:00",
          office_end_time: "18:00:00",
          allow_weekend_breaks: false,
          auto_end_breaks: false,
          google_sheet_id: sheetId,
          google_sheet_name: sheetName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        forceAppend: true,
      });

      await sb
        .from("break_sessions")
        .update({
          google_sheet_sync_status: "synced",
          google_sheet_row_id: result.rowNumber,
          google_sheet_synced_at: new Date().toISOString(),
          google_sheet_error: null,
        })
        .eq("id", session.id);

      console.log("Synced", session.id, "->", result);
    } catch (err) {
      console.error("Sync failed", session.id, err);
    }
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim(),
    key: normalizeGooglePrivateKey(process.env.GOOGLE_PRIVATE_KEY!),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: sheetA1(sheetName, "A1:K30"),
  });
  console.log("--- Break Records tab after resync ---");
  console.log(JSON.stringify(values.data.values ?? [], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
