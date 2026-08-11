/**
 * Inspect sheet contents + sync a real Supabase break row.
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
  const {
    getGoogleSheetId,
    getGoogleSheetName,
    appendBreakToSheet,
  } = await import("../src/lib/google-sheets/service");
  const { google } = await import("googleapis");
  const { normalizeGooglePrivateKey } = await import(
    "../src/lib/google-sheets/service"
  );

  const spreadsheetId = getGoogleSheetId(null)!;
  const sheetName = getGoogleSheetName(null);
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const key = normalizeGooglePrivateKey(process.env.GOOGLE_PRIVATE_KEY!);
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("--- Sheet meta ---", { spreadsheetId, sheetName });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  console.log(
    "Tabs:",
    meta.data.sheets?.map((s) => ({
      title: s.properties?.title,
      sheetId: s.properties?.sheetId,
      rowCount: s.properties?.gridProperties?.rowCount,
    }))
  );

  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  const values = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoted}!A1:K20`,
  });
  console.log("--- Current A1:K20 ---");
  console.log(JSON.stringify(values.data.values ?? [], null, 2));

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: settings } = await sb
    .from("office_settings")
    .select("*")
    .eq("id", 1)
    .single();
  console.log("--- office_settings sheets ---", {
    google_sheet_id: settings?.google_sheet_id,
    google_sheet_name: settings?.google_sheet_name,
  });

  const { data: session, error } = await sb
    .from("break_sessions")
    .select("*, employee:employees(*)")
    .neq("status", "active")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("--- Latest completed break embed ---", {
    error,
    id: session?.id,
    status: session?.status,
    sync: session?.google_sheet_sync_status,
    rowId: session?.google_sheet_row_id,
    employeeType: Array.isArray(session?.employee)
      ? "array"
      : typeof session?.employee,
    employee: session?.employee
      ? {
          id: (session.employee as { id?: string }).id,
          employee_id: (session.employee as { employee_id?: string }).employee_id,
          full_name: (session.employee as { full_name?: string }).full_name,
        }
      : null,
  });

  if (!session?.employee || Array.isArray(session.employee)) {
    console.error("Employee embed failed — sync would abort here.");
    process.exit(1);
  }

  // Force a fresh append by clearing row id for this test call only
  const testSession = { ...session, google_sheet_row_id: null };
  const append = await appendBreakToSheet({
    session: testSession as typeof session,
    employee: session.employee as never,
    settings: settings!,
  });
  console.log("--- appendBreakToSheet result ---", append);

  const after = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoted}!A1:K20`,
  });
  console.log("--- After append A1:K20 ---");
  console.log(JSON.stringify(after.data.values ?? [], null, 2));

  // Also exercise syncBreakToGoogleSheets via dynamic import of actions
  // (may pull next/cache — skip if fails)
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
