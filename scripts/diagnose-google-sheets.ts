/**
 * Diagnose Google Sheets connection with full error output.
 * Usage: npx tsx scripts/diagnose-google-sheets.ts
 */
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
  const { testGoogleSheetsConnection, appendBreakToSheet, getGoogleSheetId, getGoogleSheetName, isGoogleSheetsConfigured } =
    await import("../src/lib/google-sheets/service");

  console.log("--- Config ---");
  console.log({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    sheetId: getGoogleSheetId(null),
    sheetName: getGoogleSheetName(null),
    configured: isGoogleSheetsConfigured(null),
    privateKeyLen: process.env.GOOGLE_PRIVATE_KEY?.length,
    privateKeyHasBegin: process.env.GOOGLE_PRIVATE_KEY?.includes("BEGIN PRIVATE KEY"),
    privateKeyHasLiteralNewline: process.env.GOOGLE_PRIVATE_KEY?.includes("\\n"),
    privateKeyHasRealNewline: process.env.GOOGLE_PRIVATE_KEY?.includes("\n"),
  });

  console.log("\n--- testGoogleSheetsConnection ---");
  const result = await testGoogleSheetsConnection(null, "Break Records");
  console.log(result);

  if (!result.ok) {
    // Try raw googleapis call for deeper error
    try {
      const { google } = await import("googleapis");
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
      const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
      const auth = new google.auth.JWT({
        email,
        key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: getGoogleSheetId(null)!,
      });
      console.log("Raw get OK title:", meta.data.properties?.title);
      console.log(
        "Tabs:",
        meta.data.sheets?.map((s) => s.properties?.title)
      );
    } catch (err: unknown) {
      console.error("\n--- RAW ERROR ---");
      if (err && typeof err === "object") {
        const e = err as {
          message?: string;
          code?: number | string;
          errors?: unknown;
          response?: { status?: number; data?: unknown };
        };
        console.error({
          message: e.message,
          code: e.code,
          errors: e.errors,
          responseStatus: e.response?.status,
          responseData: e.response?.data,
        });
      } else {
        console.error(err);
      }
      process.exit(1);
    }
    process.exit(1);
  }

  console.log("\n--- Append test row ---");
  const now = new Date();
  const started = new Date(now.getTime() - 20 * 60 * 1000);
  try {
    const append = await appendBreakToSheet({
      session: {
        id: "diag-session",
        employee_id: "diag-emp",
        break_date: now.toISOString().slice(0, 10),
        break_type: "coffee",
        started_at: started.toISOString(),
        ended_at: now.toISOString(),
        allowed_minutes: 15,
        actual_minutes: 20,
        actual_seconds: 1200,
        extra_minutes: 5,
        extra_seconds: 300,
        status: "exceeded",
        google_sheet_sync_status: "pending",
        google_sheet_row_id: null,
        google_sheet_synced_at: null,
        google_sheet_error: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      employee: {
        id: "diag-emp",
        employee_id: "DIAG001",
        full_name: "Sheets Diagnostic",
        email: null,
        department: "QA",
        allowed_break_minutes: 60,
        role: "employee",
        is_active: true,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      settings: {
        id: 1,
        office_name: "North Office",
        timezone: "Asia/Karachi",
        default_break_minutes: 60,
        break_warning_minutes: 2,
        break_test_mode: false,
        break_test_minutes: 3,
        google_sheet_id: null,
        google_sheet_name: "Break Records",
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    });
    console.log("Append OK:", append);
  } catch (err) {
    console.error("Append failed:", err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
