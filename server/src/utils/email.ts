import { z } from 'zod';

/**
 * Emails must be looked up case-insensitively — nobody remembers or retypes the exact casing
 * they used at signup, and mobile keyboards/autofill vary it anyway. We normalize (trim +
 * lowercase) BEFORE validating format, and store/query only the normalized form, so
 * `Friend@Example.com` at signup and `friend@example.com` at login are the same account.
 */
export const emailSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email());

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
