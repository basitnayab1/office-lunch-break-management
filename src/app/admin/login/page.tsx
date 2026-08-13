import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { LoginHeroDeferred } from "@/components/auth/login-hero-deferred";
import { getCachedOfficeName } from "@/lib/login/office-name";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const officeName = await getCachedOfficeName();

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--bg-elevated)] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <LoginHeroDeferred />

      <section className="relative flex min-h-[70vh] flex-1 items-center justify-center px-5 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8 md:min-h-[calc(100vh-14rem)] lg:min-h-screen lg:px-12">
        <AdminLoginForm officeName={officeName} />
      </section>
    </main>
  );
}
