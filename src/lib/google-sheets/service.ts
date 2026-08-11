import { google } from "googleapis";
import { createPrivateKey } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { BreakSession, Employee, OfficeSettings } from "@/types/database";
import { breakTypeLabel } from "@/lib/breaks/types";
import { formatOfficeTime, getOfficeDate } from "@/lib/time/timezone";

/**
 * Columns written to the Google Sheet (must stay in this order).
 */
const SHEET_HEADERS = [
  "Date",
  "Employee",
  "Employee ID",
  "Department",
  "Break Type",
  "Start Time",
  "End Time",
  "Allowed Minutes",
  "Actual Duration",
  "Extra Minutes",
  "Status",
] as const;

// Column indexes (0-based): Extra Minutes = J (9), Status = K (10)
const EXTRA_MINUTES_COL = 9;
const STATUS_COL = 10;
const SHEET_RANGE = "A:K";
const HEADER_RANGE_SUFFIX = "A1:K1";

const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function getGoogleSheetId(
  settingsSheetId?: string | null
): string | null {
  return (
    process.env.GOOGLE_SHEET_ID?.trim() ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    settingsSheetId?.trim() ||
    null
  );
}

/**
 * Tab name resolution.
 * Env wins so Admin DB overrides cannot silently redirect writes away from
 * the configured "Break Records" tab.
 */
export function getGoogleSheetName(settingsSheetName?: string | null): string {
  return (
    process.env.GOOGLE_SHEET_NAME?.trim() ||
    process.env.GOOGLE_SHEETS_SHEET_NAME?.trim() ||
    settingsSheetName?.trim() ||
    "Break Records"
  );
}

/** Quote sheet titles that contain spaces/special chars for A1 notation. */
export function sheetA1(sheetName: string, a1Range: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${a1Range}`;
}

/**
 * Normalize a PEM private key from .env quirks:
 * - wrapping quotes
 * - literal \n / \\n escapes
 * - single-line PEM bodies
 */
export function normalizeGooglePrivateKey(raw: string): string {
  let key = raw.trim();

  // Strip wrapping quotes (sometimes doubled)
  for (let i = 0; i < 2; i++) {
    if (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1).trim();
    }
  }

  // Unescape newlines (handle double-escaped \\n from JSON copy/paste)
  for (let i = 0; i < 3; i++) {
    if (key.includes("\\\\n")) key = key.replace(/\\\\n/g, "\n");
    if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
    if (key.includes("\\r")) key = key.replace(/\\r/g, "");
  }

  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // Rebuild PEM if it collapsed onto one/few lines
  const pemMatch = key.match(
    /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END ([A-Z0-9 ]+)-----/
  );
  if (pemMatch) {
    const beginType = pemMatch[1].trim();
    const endType = pemMatch[3].trim();
    const body = pemMatch[2].replace(/\s+/g, "");
    if (body.length > 0) {
      const chunks = body.match(/.{1,64}/g) ?? [body];
      key = `-----BEGIN ${beginType}-----\n${chunks.join("\n")}\n-----END ${endType}-----`;
    }
  }

  if (!key.endsWith("\n")) key += "\n";
  return key;
}

function assertParsablePrivateKey(pem: string): void {
  try {
    createPrivateKey({ key: pem, format: "pem" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid GOOGLE_PRIVATE_KEY (OpenSSL cannot parse PEM: ${detail}). ` +
        `Re-copy private_key from the service-account JSON, keep it quoted in .env.local with \\n escapes, ` +
        `or set GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS instead.`
    );
  }
}

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

function loadServiceAccountFromJsonEnv(): ServiceAccountJson | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON."
    );
  }
}

function loadServiceAccountFromFile(): ServiceAccountJson | null {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credPath) return null;
  const absolute = resolve(process.cwd(), credPath);
  if (!existsSync(absolute)) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS file not found: ${credPath}`
    );
  }
  try {
    return JSON.parse(readFileSync(absolute, "utf8")) as ServiceAccountJson;
  } catch {
    throw new Error(
      `Unable to parse GOOGLE_APPLICATION_CREDENTIALS file: ${credPath}`
    );
  }
}

function getAuth() {
  const fromFile = loadServiceAccountFromFile();
  const fromJson = fromFile ?? loadServiceAccountFromJsonEnv();

  if (fromJson?.client_email && fromJson.private_key) {
    const key = normalizeGooglePrivateKey(fromJson.private_key);
    assertParsablePrivateKey(key);
    return new google.auth.JWT({
      email: fromJson.client_email,
      key,
      scopes: [SPREADSHEETS_SCOPE],
    });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Google Sheets credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, or GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  const privateKey = normalizeGooglePrivateKey(rawKey);
  assertParsablePrivateKey(privateKey);

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [SPREADSHEETS_SCOPE],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** True when service-account credentials and sheet ID are present (server-only env). */
export function isGoogleSheetsConfigured(
  settingsSheetId?: string | null
): boolean {
  const hasJson =
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const hasPair =
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()) &&
    Boolean(process.env.GOOGLE_PRIVATE_KEY?.trim());

  return Boolean((hasJson || hasPair) && getGoogleSheetId(settingsSheetId));
}

function statusLabel(status: string): string {
  if (status === "exceeded") return "EXCEEDED";
  if (status === "within_limit") return "WITHIN LIMIT";
  return status.toUpperCase();
}

function buildRow(
  session: BreakSession,
  employee: Employee,
  timezone: string
): (string | number)[] {
  return [
    getOfficeDate(session.started_at, timezone),
    employee.full_name,
    employee.employee_id,
    employee.department,
    breakTypeLabel(session.break_type),
    formatOfficeTime(session.started_at, timezone),
    session.ended_at ? formatOfficeTime(session.ended_at, timezone) : "",
    session.allowed_minutes,
    session.actual_minutes ?? "",
    session.extra_minutes ?? 0,
    statusLabel(session.status),
  ];
}

function formatGoogleApiError(err: unknown): string {
  if (!err || typeof err !== "object") {
    return String(err ?? "Unknown Google Sheets error");
  }

  const e = err as {
    message?: string;
    code?: number | string;
    errors?: Array<{ message?: string; reason?: string }>;
    response?: { status?: number; data?: { error?: { message?: string } } };
  };

  const parts: string[] = [];
  if (e.message) parts.push(e.message);
  if (e.code != null) parts.push(`code=${e.code}`);
  if (e.response?.status) parts.push(`http=${e.response.status}`);
  if (e.response?.data?.error?.message) {
    parts.push(e.response.data.error.message);
  }
  if (e.errors?.length) {
    parts.push(
      e.errors
        .map((x) => [x.reason, x.message].filter(Boolean).join(": "))
        .join("; ")
    );
  }

  const joined = parts.filter(Boolean).join(" | ");
  if (/permission|403|forbidden/i.test(joined)) {
    const email =
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
      "the service account email";
    return `${joined} — Share the spreadsheet with ${email} as Editor.`;
  }
  if (/not found|404/i.test(joined)) {
    return `${joined} — Check GOOGLE_SHEET_ID.`;
  }
  return joined || "Unknown Google Sheets error";
}

async function ensureSheetSetup(
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  let sheetId = sheet?.properties?.sheetId;

  if (sheetId == null) {
    const created = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    sheetId = created.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  }

  const headerRange = sheetA1(sheetName, HEADER_RANGE_SUFFIX);
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const headers = existing.data.values?.[0] ?? [];
  const headersMatch = SHEET_HEADERS.every((h, i) => headers[i] === h);
  if (!headersMatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(SHEET_HEADERS)] },
    });
  }

  await ensureConditionalFormatting(spreadsheetId, sheetId!);
  return sheetId!;
}

async function ensureConditionalFormatting(
  spreadsheetId: string,
  sheetId: number
) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
  const rules = sheet?.conditionalFormats ?? [];

  const alreadyConfigured = rules.some((rule) => {
    const ranges = rule.ranges ?? [];
    return ranges.some(
      (r) =>
        r.sheetId === sheetId &&
        r.startColumnIndex === EXTRA_MINUTES_COL &&
        r.endColumnIndex === EXTRA_MINUTES_COL + 1
    );
  });

  if (alreadyConfigured) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: 1,
                  startColumnIndex: EXTRA_MINUTES_COL,
                  endColumnIndex: EXTRA_MINUTES_COL + 1,
                },
              ],
              booleanRule: {
                condition: {
                  type: "NUMBER_GREATER",
                  values: [{ userEnteredValue: "0" }],
                },
                format: {
                  backgroundColor: { red: 1, green: 0.8, blue: 0.8 },
                  textFormat: {
                    foregroundColor: { red: 0.7, green: 0, blue: 0 },
                    bold: true,
                  },
                },
              },
            },
            index: 0,
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: 1,
                  startColumnIndex: STATUS_COL,
                  endColumnIndex: STATUS_COL + 1,
                },
              ],
              booleanRule: {
                condition: {
                  type: "TEXT_EQ",
                  values: [{ userEnteredValue: "EXCEEDED" }],
                },
                format: {
                  backgroundColor: { red: 1, green: 0.8, blue: 0.8 },
                  textFormat: {
                    foregroundColor: { red: 0.7, green: 0, blue: 0 },
                    bold: true,
                  },
                },
              },
            },
            index: 1,
          },
        },
      ],
    },
  });
}

export async function appendBreakToSheet(params: {
  session: BreakSession;
  employee: Employee;
  settings: OfficeSettings;
  /** When true, always append a new row (used for failed/pending retries). */
  forceAppend?: boolean;
}): Promise<{ rowNumber: number; spreadsheetId: string; sheetName: string; updatedRange: string }> {
  const spreadsheetId = getGoogleSheetId(params.settings.google_sheet_id);

  if (!spreadsheetId) {
    throw new Error("Google Sheet ID is not configured (set GOOGLE_SHEET_ID)");
  }

  if (!isGoogleSheetsConfigured(params.settings.google_sheet_id)) {
    throw new Error("Google Sheets credentials are not configured");
  }

  const sheetName = getGoogleSheetName(params.settings.google_sheet_name);

  try {
    await ensureSheetSetup(spreadsheetId, sheetName);

    const sheets = getSheetsClient();
    const row = buildRow(
      params.session,
      params.employee,
      params.settings.timezone
    );

    const existingRowId = params.session.google_sheet_row_id;
    const shouldUpdate =
      !params.forceAppend &&
      typeof existingRowId === "number" &&
      existingRowId > 1;

    if (shouldUpdate) {
      const range = sheetA1(sheetName, `A${existingRowId}:K${existingRowId}`);
      const updated = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });

      const updatedRange = updated.data.updatedRange ?? range;
      console.info("[Google Sheets] updated existing row", {
        spreadsheetId,
        sheetName,
        rowNumber: existingRowId,
        updatedRange,
      });

      return {
        rowNumber: existingRowId,
        spreadsheetId,
        sheetName,
        updatedRange,
      };
    }

    const appendRange = sheetA1(sheetName, SHEET_RANGE);
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: appendRange,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    const updatedRange = result.data.updates?.updatedRange ?? "";
    const updatedRows = result.data.updates?.updatedRows ?? 0;
    const match = updatedRange.match(/![A-Z]+(\d+)/);
    const rowNumber = match ? Number(match[1]) : 0;

    console.info("[Google Sheets] append response", {
      spreadsheetId,
      sheetName,
      appendRange,
      updatedRange,
      updatedRows,
      rowNumber,
    });

    if (!updatedRange || updatedRows < 1 || rowNumber < 2) {
      throw new Error(
        `Google Sheets append did not confirm a data row (updatedRange=${updatedRange || "none"}, updatedRows=${updatedRows}, rowNumber=${rowNumber}).`
      );
    }

    return { rowNumber, spreadsheetId, sheetName, updatedRange };
  } catch (err) {
    const message = formatGoogleApiError(err);
    console.error("[Google Sheets] appendBreakToSheet failed:", message, err);
    throw new Error(message);
  }
}

export type GoogleSheetsConnectionTest = {
  ok: boolean;
  message: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  serviceAccountEmail?: string;
  headersReady?: boolean;
  formattingReady?: boolean;
};

/**
 * Verifies service-account auth, spreadsheet access, headers, and formatting.
 * Does not write a fake break row.
 */
export async function testGoogleSheetsConnection(
  settingsSheetId?: string | null,
  settingsSheetName?: string | null
): Promise<GoogleSheetsConnectionTest> {
  const spreadsheetId = getGoogleSheetId(settingsSheetId);
  const sheetName = getGoogleSheetName(settingsSheetName);
  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    loadServiceAccountFromJsonEnv()?.client_email ||
    undefined;

  if (!isGoogleSheetsConfigured(settingsSheetId)) {
    return {
      ok: false,
      message:
        "Missing Google Sheets credentials or GOOGLE_SHEET_ID in environment.",
      serviceAccountEmail: email,
      spreadsheetId: spreadsheetId ?? undefined,
      sheetName,
    };
  }

  if (!spreadsheetId) {
    return {
      ok: false,
      message: "Missing GOOGLE_SHEET_ID in environment.",
      serviceAccountEmail: email,
      sheetName,
    };
  }

  try {
    // Validate credentials before calling the API
    getAuth();

    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties",
    });

    await ensureSheetSetup(spreadsheetId, sheetName);

    const headerCheck = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(sheetName, HEADER_RANGE_SUFFIX),
    });
    const headers = headerCheck.data.values?.[0] ?? [];
    const headersReady = SHEET_HEADERS.every((h, i) => headers[i] === h);

    return {
      ok: true,
      message: "Google Sheets connection verified. Ready to append break records.",
      spreadsheetId,
      spreadsheetTitle: meta.data.properties?.title ?? undefined,
      sheetName,
      serviceAccountEmail: email,
      headersReady,
      formattingReady: true,
    };
  } catch (err) {
    const message = formatGoogleApiError(err);
    console.error("[Google Sheets] connection test failed:", message, err);
    return {
      ok: false,
      message,
      spreadsheetId,
      sheetName,
      serviceAccountEmail: email,
    };
  }
}
