/**
 * Pure helpers for recovering the Appwrite session secret from the native
 * cookie jar.
 *
 * Split out of `auth.ts` so it can be unit-tested: `auth.ts` imports
 * react-native-appwrite and react-native-nitro-cookies, neither of which
 * resolve under vitest. Same rationale as `goalMath.ts`.
 *
 * ## Why any of this exists
 *
 * Appwrite deliberately omits the session secret from the response body —
 * sessions are meant to live in cookies (appwrite/appwrite#8673) — and
 * react-native-appwrite only implements the `X-Fallback-Cookies` recovery path
 * for web, silently no-opping on native. So the secret is only obtainable by
 * reading the `Set-Cookie` the server just wrote, which makes this recovery the
 * single point of failure for the entire login flow.
 *
 * An unrecovered secret used to degrade silently: it produced an empty string,
 * which `client.setSession('')` accepts happily, yielding a guest client whose
 * first real request fails with `missing scopes (["account"])` — three steps
 * later, at the PIN screen. `isUsableSecret` exists so callers can fail loudly
 * at the source instead.
 */

/** Cookie name Appwrite sets for a session, plus the legacy variant. */
export function sessionCookieNames(projectId: string): [string, string] {
  return [`a_session_${projectId}`, `a_session_${projectId}_legacy`];
}

/**
 * A secret is usable only if it's a non-blank string. The empty string is the
 * specific poison value here: it's what the SDK returns when it has nothing,
 * and it is silently accepted by `client.setSession`.
 */
export function isUsableSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.trim().length > 0;
}

/**
 * Pick the session cookie's value out of a name-keyed cookie map, preferring
 * the canonical name over the legacy one. Tolerates the map being absent or
 * holding entries without a `value`.
 */
export function pickSessionCookie(
  cookies: Record<string, { value?: string } | undefined> | null | undefined,
  projectId: string
): string | null {
  if (!cookies) return null;
  for (const name of sessionCookieNames(projectId)) {
    const value = cookies[name]?.value;
    if (isUsableSecret(value)) return value;
  }
  return null;
}

/**
 * Parse a `Cookie` request-header string (`"a=1; b=2"`) into a name→value map.
 * Used as a fallback when the structured cookie lookup comes back empty but the
 * header form still has the value.
 *
 * Values are not URL-decoded: the Appwrite session token must be forwarded
 * verbatim (confirmed from the SDK's own realtime-auth code), so decoding it
 * here would corrupt it.
 */
export function parseCookieHeader(header: string | null | undefined): Record<string, { value: string }> {
  if (typeof header !== 'string' || header.length === 0) return {};

  const out: Record<string, { value: string }> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name.length > 0 && value.length > 0) out[name] = { value };
  }
  return out;
}

/**
 * Redacted description of what was actually in the jar, for diagnostics. Never
 * includes cookie values — the session token is a credential.
 */
export function describeCookieNames(
  cookies: Record<string, unknown> | null | undefined
): string {
  const names = cookies ? Object.keys(cookies) : [];
  return names.length > 0 ? names.join(', ') : '<none>';
}
