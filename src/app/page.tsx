import { LoginForm } from "@/components/auth/login-form";
import { LoginHeroDeferred } from "@/components/auth/login-hero-deferred";
import { createClient } from "@/lib/supabase/server";
import { getCachedOfficeName } from "@/lib/login/office-name";
import type { EmployeeLoginOption } from "@/types/database";

export const dynamic = "force-dynamic";

async function getLoginEmployees(): Promise<EmployeeLoginOption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_active_employees_for_login");
    if (error || !data) return [];
    return data as EmployeeLoginOption[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [officeName, employees] = await Promise.all([
    getCachedOfficeName(),
    getLoginEmployees(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--bg-elevated)] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
      <LoginHeroDeferred />

      <section className="relative flex min-h-[70vh] flex-1 items-center justify-center px-5 py-10 sm:px-8 md:min-h-[calc(100vh-14rem)] lg:min-h-screen lg:px-12">
        <LoginForm officeName={officeName} initialEmployees={employees} />
      </section>
    </main>
  );
}
