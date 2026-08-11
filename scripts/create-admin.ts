/**
 * Create a Supabase Auth admin (email + password) and set employees.role = 'admin'.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts admin@yourcompany.com "YourStrongPassword!"
 *   npx tsx scripts/create-admin.ts admin@yourcompany.com "YourStrongPassword!" "Office Admin" ADMIN01
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Password is stored only in Supabase Auth (hashed). Never written to employees.
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
  const password = process.argv[3];
  const fullName = process.argv[4]?.trim() || "Office Admin";
  const employeeId = process.argv[5]?.trim() || "ADMIN01";

  if (!email || !email.includes("@") || !password) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts <email> <password> [full_name] [employee_id]'
    );
    console.error(
      'Example: npx tsx scripts/create-admin.ts you@company.com "MySecurePass123!" "Office Admin" ADMIN01'
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  let userId = listed?.users?.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      console.error("Failed to create Auth user:", error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Created Auth user: ${email}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      console.error("Failed to update Auth user password:", error.message);
      process.exit(1);
    }
    console.log(`Auth user already existed; password updated: ${email}`);
  }

  // Trigger may have inserted a stub employee row; upsert ensures admin role.
  const { data: profile, error: upsertError } = await supabase
    .from("employees")
    .upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        employee_id: employeeId,
        department: "Administration",
        allowed_break_minutes: 60,
        role: "admin",
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select("id, employee_id, full_name, email, role, is_active")
    .single();

  if (upsertError) {
    console.error("Failed to set admin profile:", upsertError.message);
    console.error(
      "Tip: make sure migration 001 (employees table) is applied."
    );
    process.exit(1);
  }

  console.log("\nAdmin ready:");
  console.log(profile);
  console.log(`\nSign in at /admin/login with:\n  email:    ${email}\n  password: (the password you passed on the command line)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
