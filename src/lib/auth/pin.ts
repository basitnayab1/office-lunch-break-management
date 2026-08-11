import { randomInt } from "crypto";

/**
 * Cryptographically secure 4-digit PIN (1000–9999).
 * Server-only — never import this into client components.
 *
 * Avoid a small set of extremely common PINs so Auth HIBP / weak-password
 * checks are less likely to reject newly generated credentials.
 */
const BLOCKED_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
  "1212",
  "2121",
  "1000",
  "1122",
  "1313",
  "2000",
  "1010",
]);

export function generateTemporaryPin(): string {
  for (let i = 0; i < 25; i++) {
    const pin = String(randomInt(1000, 10000));
    if (!BLOCKED_PINS.has(pin)) return pin;
  }
  return String(randomInt(1000, 10000));
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

/**
 * Maps the employee-facing 4-digit PIN to the Auth password string.
 *
 * Why: Supabase Auth leaked-password protection (HIBP) rejects many raw
 * 4-digit PINs. Prefixing keeps the Name+PIN UX unchanged while storing a
 * longer Auth secret that is not a common breached password string.
 *
 * Existing accounts created before this change may still use the raw PIN as
 * the Auth password — login tries the prefixed form first, then raw PIN.
 */
const PIN_AUTH_PREFIX = "obm-pin-v1:";

export function pinToAuthPassword(pin: string): string {
  return `${PIN_AUTH_PREFIX}${pin.trim()}`;
}

export function isLikelyLeakedPasswordError(message: string | undefined): boolean {
  if (!message) return false;
  return /leaked|pwned|hibp|weak.?password|password.*breach/i.test(message);
}
