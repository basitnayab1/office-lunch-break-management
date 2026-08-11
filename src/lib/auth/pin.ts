import { randomInt } from "crypto";

/**
 * Cryptographically secure 4-digit PIN (1000–9999).
 * Server-only — never import this into client components.
 */
export function generateTemporaryPin(): string {
  return String(randomInt(1000, 10000));
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}
