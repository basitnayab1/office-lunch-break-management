/**
 * One-off diagnostic: verify slot booking database objects exist.
 * Usage: npx tsx scripts/diagnose-bookings.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(fileName: string) {
  const envPath = resolve(process.cwd(), fileName);
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

loadEnvFile(".env");
loadEnvFile(".env.local");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from("break_bookings")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (!error) {
    console.log("OK: break_bookings exists. Slot booking DB is available.");
    return;
  }

  console.error("Slot booking DB check failed:");
  console.error({
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  console.error(
    "Run supabase/migrations/010_workforce_management.sql in Supabase SQL Editor, then run 011 and 012 if they are not applied yet."
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
