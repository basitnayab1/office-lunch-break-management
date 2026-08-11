/**
 * Enable Supabase Auth leaked-password protection (HaveIBeenPwned).
 *
 * This is Auth service config — it cannot be set via SQL migrations.
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=<personal access token from supabase.com/dashboard/account/tokens>
 *   npx tsx scripts/enable-auth-hibp.ts
 *
 * Or enable manually:
 *   Dashboard → Authentication → Providers → Email → Prevent use of leaked passwords
 *
 * Requires Pro plan or above.
 *
 * Employee Name+PIN login is preserved: Auth stores a prefixed password derived
 * from the PIN (see pinToAuthPassword), so HIBP does not reject normal PINs.
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

function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname; // <ref>.supabase.co
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref =
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!token) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens"
    );
    console.error(
      "Or enable manually: Authentication → Providers → Email → Prevent use of leaked passwords"
    );
    process.exit(1);
  }
  if (!ref) {
    console.error(
      "Missing project ref. Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL."
    );
    process.exit(1);
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password_hibp_enabled: true }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error(`Failed to enable HIBP (${res.status}):`, body);
    console.error(
      "Note: Leaked password protection requires the Supabase Pro plan or above."
    );
    process.exit(1);
  }

  console.log("Enabled Auth leaked-password protection (password_hibp_enabled=true).");
  console.log(
    "Employee PIN UX is unchanged; Auth passwords use a prefixed form for HIBP compatibility."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
