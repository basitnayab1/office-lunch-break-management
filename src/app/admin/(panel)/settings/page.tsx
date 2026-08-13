import { getOfficeSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import { AdminChangePasswordForm } from "@/components/admin/change-password-form";
import {
  getGoogleSheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getOfficeSettings();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Settings
        </h2>
        <p className="mt-2 text-[var(--ink-muted)]">
          Configure office defaults and Google Sheets sync.
        </p>
      </div>
      <SettingsForm
        settings={settings}
        sheetsConfigured={isGoogleSheetsConfigured(settings.google_sheet_id)}
        envSheetId={getGoogleSheetId(settings.google_sheet_id)}
        serviceAccountEmail={
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null
        }
      />
      <AdminChangePasswordForm />
    </div>
  );
}
