/**
 * Repair GOOGLE_PRIVATE_KEY formatting in .env.local (no secret printed).
 * Usage: npx tsx scripts/repair-google-private-key.ts
 */
import { createPrivateKey } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { normalizeGooglePrivateKey } from "../src/lib/google-sheets/service";

function parseEnvFile(text: string): { lines: string[] } {
  return { lines: text.split(/\r?\n/) };
}

function getEnvValue(lines: string[], key: string): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith(`${key}=`)) continue;
    let value = trimmed.slice(key.length + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function setEnvValue(lines: string[], key: string, value: string): string[] {
  const escaped = value.replace(/\n/g, "\\n");
  const nextLine = `${key}="${escaped}"`;
  let found = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      found = true;
      return nextLine;
    }
    return line;
  });
  if (!found) next.push(nextLine);
  return next;
}

async function main() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    throw new Error(".env.local not found");
  }

  const original = readFileSync(envPath, "utf8");
  const { lines } = parseEnvFile(original);
  const raw = getEnvValue(lines, "GOOGLE_PRIVATE_KEY");
  if (!raw) {
    throw new Error("GOOGLE_PRIVATE_KEY missing in .env.local");
  }

  const normalized = normalizeGooglePrivateKey(raw);

  try {
    createPrivateKey({ key: normalized, format: "pem" });
  } catch (err) {
    console.error("FAIL: private key still unreadable after normalization.");
    console.error(err instanceof Error ? err.message : err);
    console.error(
      "\nFix: open your Google service-account JSON and copy the private_key value exactly,"
    );
    console.error(
      "or set GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json"
    );
    process.exit(1);
  }

  const updated = setEnvValue(lines, "GOOGLE_PRIVATE_KEY", normalized).join(
    "\n"
  );
  writeFileSync(envPath, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
  console.log(
    "OK: GOOGLE_PRIVATE_KEY normalized and rewritten in .env.local (PEM now parses)."
  );
  console.log(
    "Restart `npm run dev`, then Admin → Settings → Test connection, or Retry failed syncs."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
