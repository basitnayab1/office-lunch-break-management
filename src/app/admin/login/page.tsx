import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { LoginHero } from "@/components/auth/login-hero";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getOfficeName() {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return "Lunch Break";
    }
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("office_settings")
      .select("office_name")
      .eq("id", 1)
      .maybeSingle();
    return data?.office_name ?? "Lunch Break";
  } catch {
    return "Lunch Break";
  }
}

export default async function AdminLoginPage() {
  const officeName = await getOfficeName();

  return (
    <main className="min-h-screen bg-[var(--bg-elevated)] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
      <LoginHero />

      <section className="relative flex min-h-[70vh] flex-1 items-center justify-center px-5 py-10 sm:px-8 md:min-h-[calc(100vh-14rem)] lg:min-h-screen lg:px-12">
        <AdminLoginForm officeName={officeName} />
      </section>
    </main>
  );
}
