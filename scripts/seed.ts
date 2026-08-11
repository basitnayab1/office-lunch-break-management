/**
 * Seed demo employees + admin via Supabase Auth Admin API.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Demo employee PIN: 1234 (Auth stores prefixed form via pinToAuthPassword)
 * Demo admin password: SEED_ADMIN_PASSWORD env, or AdminPass123!
 *
 * Admin authenticates with email + password (Supabase Auth).
 * Employees authenticate with Name + PIN (UX unchanged; Auth password is prefixed).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pinToAuthPassword } from "../src/lib/auth/pin";

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

const DEMO_EMPLOYEE_PIN = "1234";
const DEMO_ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD?.trim() || "AdminPass123!";

const SEED_USERS = [
  {
    employee_id: "ADMIN01",
    full_name: "Office Admin",
    email: "admin@office.local",
    department: "Administration",
    allowed_break_minutes: 60,
    role: "admin" as const,
    authPassword: DEMO_ADMIN_PASSWORD,
  },
  {
    employee_id: "EMP001",
    full_name: "Ali",
    email: "ali@office.local",
    department: "Development",
    allowed_break_minutes: 60,
    role: "employee" as const,
    authPassword: pinToAuthPassword(DEMO_EMPLOYEE_PIN),
  },
  {
    employee_id: "EMP002",
    full_name: "Ahmed",
    email: "ahmed@office.local",
    department: "Development",
    allowed_break_minutes: 60,
    role: "employee" as const,
    authPassword: pinToAuthPassword(DEMO_EMPLOYEE_PIN),
  },
  {
    employee_id: "EMP003",
    full_name: "Usman",
    email: "usman@office.local",
    department: "Design",
    allowed_break_minutes: 45,
    role: "employee" as const,
    authPassword: pinToAuthPassword(DEMO_EMPLOYEE_PIN),
  },
  {
    employee_id: "EMP004",
    full_name: "Bilal",
    email: "bilal@office.local",
    department: "Operations",
    allowed_break_minutes: 60,
    role: "employee" as const,
    authPassword: pinToAuthPassword(DEMO_EMPLOYEE_PIN),
  },
  {
    employee_id: "EMP005",
    full_name: "Hassan",
    email: "hassan@office.local",
    department: "HR",
    allowed_break_minutes: 30,
    role: "employee" as const,
    authPassword: pinToAuthPassword(DEMO_EMPLOYEE_PIN),
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from("office_settings").upsert({
    id: 1,
    office_name: "North Office",
    timezone: "Asia/Karachi",
    default_break_minutes: 60,
    google_sheet_name: "Break Records",
  });

  for (const user of SEED_USERS) {
    const { data: listed } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    const existing = listed?.users?.find((u) => u.email === user.email);

    let userId = existing?.id;
    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.authPassword,
        email_confirm: true,
        user_metadata: { full_name: user.full_name },
      });
      if (error || !data.user) {
        console.error(`Failed to create auth user ${user.email}`, error);
        continue;
      }
      userId = data.user.id;
      console.log(`Created auth user: ${user.full_name}`);
    } else {
      await supabase.auth.admin.updateUserById(userId, {
        password: user.authPassword,
      });
      console.log(`Auth user exists, credentials reset: ${user.full_name}`);
    }

    // Upsert profile/role on employees (trigger may have inserted a stub row)
    const { error: upsertError } = await supabase.from("employees").upsert({
      id: userId,
      employee_id: user.employee_id,
      full_name: user.full_name,
      email: user.email,
      department: user.department,
      allowed_break_minutes: user.allowed_break_minutes,
      role: user.role,
      is_active: true,
    });

    if (upsertError) {
      console.error(`Failed employee upsert ${user.full_name}`, upsertError);
    } else {
      console.log(`Upserted employee: ${user.full_name} (${user.role})`);
    }
  }

  console.log("\nSeed complete.");
  console.log(`Employee demo PIN: ${DEMO_EMPLOYEE_PIN}`);
  console.log(`Admin login: admin@office.local / ${DEMO_ADMIN_PASSWORD}`);
  console.log("Admin signs in at /admin/login with email + password.");
  console.log("Employees sign in at / with Name + PIN.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
