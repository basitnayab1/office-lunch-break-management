/**
 * One-off diagnostic: reproduce employee creation failures with full errors.
 * Usage: npx tsx scripts/diagnose-create-employee.ts
 */
import { createClient } from "@supabase/supabase-js";
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now().toString().slice(-6);
  const employee_id = `DIAG${stamp}`;
  const email = `${employee_id.toLowerCase()}@office.local`;
  const pin = "4821";
  const full_name = `Diag User ${stamp}`;

  console.log("--- Step 1: createUser ---");
  console.log({ email, pin, employee_id, full_name });

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { full_name },
    });

  if (authError) {
    console.error("AUTH ERROR:", {
      message: authError.message,
      status: authError.status,
      name: authError.name,
      code: (authError as { code?: string }).code,
    });
    console.error("RAW:", authError);
    process.exit(1);
  }

  console.log("Auth user created:", authData.user?.id);

  console.log("--- Step 2: check trigger row ---");
  const { data: stub, error: stubErr } = await supabase
    .from("employees")
    .select("*")
    .eq("id", authData.user!.id)
    .maybeSingle();
  console.log("Stub after trigger:", stub, stubErr);

  console.log("--- Step 3: upsert employee profile ---");
  const { data, error } = await supabase
    .from("employees")
    .upsert(
      {
        id: authData.user!.id,
        employee_id,
        full_name,
        email,
        department: "Diagnostics",
        allowed_break_minutes: 60,
        role: "employee",
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select(
      "id, employee_id, full_name, email, department, role, is_active"
    )
    .single();

  if (error) {
    console.error("UPSERT ERROR:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    await supabase.auth.admin.deleteUser(authData.user!.id);
    process.exit(1);
  }

  console.log("Upsert OK:", data);

  console.log("--- Step 4: login dropdown RPC ---");
  const { data: list, error: listErr } = await supabase.rpc(
    "list_active_employees_for_login"
  );
  console.log(
    "In dropdown?",
    (list as { employee_id: string; full_name: string }[] | null)?.some(
      (e) => e.employee_id === employee_id
    ),
    listErr
  );

  console.log("--- Step 5: signInWithPassword (PIN) ---");
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password: pin,
  });
  console.log(
    signErr
      ? { signInError: signErr.message }
      : { signedIn: signIn.user?.id }
  );

  // cleanup
  await supabase.auth.admin.deleteUser(authData.user!.id);
  console.log("Cleaned up diag user.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
