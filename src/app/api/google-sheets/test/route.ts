import { NextResponse } from "next/server";
import {
  isAuthAccessError,
  requireAdminSession,
} from "@/lib/auth/guards";
import { getOfficeSettings } from "@/actions/settings";
import { testGoogleSheetsConnection } from "@/lib/google-sheets/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin-only connection check for Google Sheets.
 * GET /api/google-sheets/test
 *
 * Protected by:
 * 1) middleware (admin session)
 * 2) requireAdminSession() in this handler
 */
export async function GET() {
  try {
    await requireAdminSession();

    const settings = await getOfficeSettings();
    const result = await testGoogleSheetsConnection(
      settings.google_sheet_id,
      settings.google_sheet_name
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    if (isAuthAccessError(err)) {
      return NextResponse.json(
        { ok: false, message: err.message },
        { status: err.status }
      );
    }
    console.error("google-sheets test", err);
    return NextResponse.json(
      {
        ok: false,
        message: "Unable to verify Google Sheets connection.",
      },
      { status: 500 }
    );
  }
}
