import { getOfficeSettings } from "@/actions/settings";
import { getGoogleSheetId } from "@/lib/google-sheets/service";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function GoogleSheetsPage() {
  const settings = await getOfficeSettings();
  const sheetId = getGoogleSheetId(settings.google_sheet_id);

  if (sheetId) {
    redirect(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Google Sheets
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Google Sheet ID is not configured yet.
        </p>
      </div>
      <Card className="max-w-2xl p-6">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Sheet not found
        </h3>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Add `GOOGLE_SHEET_ID` in environment variables or save an override in
          Settings, then this page will open the real spreadsheet directly.
        </p>
      </Card>
    </div>
  );
}
