import { redirect } from "next/navigation";
import {
  isAuthAccessError,
  requireAdminSession,
} from "@/lib/auth/guards";
import { getOfficeSettings } from "@/actions/settings";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-side authorization gate for every admin panel page.
 * Middleware also enforces this; this layout is the second hard check
 * so admin UI/data never render without a valid admin session.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let admin;
  try {
    admin = await requireAdminSession();
  } catch (error) {
    if (isAuthAccessError(error) && error.status === 403) {
      redirect("/dashboard");
    }
    redirect("/admin/login");
  }

  const settings = await getOfficeSettings();

  return (
    <AdminShell
      officeName={settings.office_name}
      adminName={admin.full_name}
      adminProfileImageUrl={admin.avatar_url}
      timezone={settings.timezone}
    >
      {children}
    </AdminShell>
  );
}
