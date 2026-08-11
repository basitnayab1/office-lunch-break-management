/**
 * Promote an existing Supabase Auth user to admin.
 *
 * Prerequisites:
 * 1. Apply supabase/migrations/004_admin_auth_profiles.sql
 * 2. Create the user in Supabase Auth (Dashboard → Authentication → Users)
 *    OR let the auth trigger create their employees profile on signup
 *
 * Usage:
 *   npx tsx scripts/promote-admin.ts admin@yourcompany.com
 *   npx tsx scripts/promote-admin.ts admin@yourcompany.com "Office Admin" ADMIN01
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Never stores passwords — only sets employees.role = 'admin'.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const fullName = process.argv[3]?.trim() || null;
  const employeeId = process.argv[4]?.trim() || null;

  if (!email || !email.includes("@")) {
    console.error(
      "Usage: npx tsx scripts/promote-admin.ts <email> [full_name] [employee_id]"
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc("promote_user_to_admin", {
    p_email: email,
    p_full_name: fullName,
    p_employee_id: employeeId,
  });

  if (error) {
    // Fallback if RPC not applied yet: direct update via service role
    const { data: listed } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    const authUser = listed?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );
    if (!authUser) {
      console.error(
        `No Auth user found for ${email}. Create the user in Supabase Auth first.`
      );
      process.exit(1);
    }

    const { data: profile, error: upsertError } = await supabase
      .from("employees")
      .upsert(
        {
          id: authUser.id,
          email,
          full_name:
            fullName ||
            (authUser.user_metadata?.full_name as string | undefined) ||
            email.split("@")[0],
          employee_id:
            employeeId ||
            `ADM-${authUser.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
          department: "Administration",
          allowed_break_minutes: 60,
          role: "admin",
          is_active: true,
        },
        { onConflict: "id" }
      )
      .select(
        "id, employee_id, full_name, email, role, is_active"
      )
      .single();

    if (upsertError) {
      console.error("Failed to promote admin:", upsertError.message || error);
      process.exit(1);
    }

    console.log("Promoted to admin (direct upsert):");
    console.log(profile);
    return;
  }

  console.log("Promoted to admin:");
  console.log(data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
