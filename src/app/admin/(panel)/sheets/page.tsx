import { getOfficeSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import {
  getGoogleSheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/service";

export const dynamic = "force-dynamic";

export default async function GoogleSheetsPage() {
  const settings = await getOfficeSettings();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Google Sheets
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Configure spreadsheet sync, test the connection, and retry failed
          records. Credentials stay in server environment variables only.
        </p>
      </div>
      <SettingsForm
        settings={settings}
        sheetsConfigured={isGoogleSheetsConfigured(settings.google_sheet_id)}
        envSheetId={getGoogleSheetId(settings.google_sheet_id)}
        serviceAccountEmail={
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null
        }
        sheetsOnly
      />
    </div>
  );
}
