/**
 * Primary account authentication — Appwrite Email OTP (passwordless).
 *
 * This is LAYER 1 of the auth design (see the plan): it establishes the real
 * account identity and a session. It is deliberately separate from the device
 * PIN (layer 3), which only locks/unlocks access to the session secret locally.
 *
 * Flow:
 *   1. requestEmailOtp(email)  -> Appwrite emails a one-time code, returns userId
 *   2. verifyEmailOtp(userId, code) -> creates a session, returns its secret
 *   3. the caller persists the secret encrypted behind the PIN (see pin.ts)
 *
 * NOTE: the emailed OTP is NOT the device PIN. UI copy must keep them distinct.
 *
 * IMPORTANT — session secret is never in the SDK's response body: Appwrite
 * deliberately omits it (sessions are meant to live in cookies — confirmed
 * upstream, https://github.com/appwrite/appwrite/issues/8673). It's only
 * recoverable via the `X-Fallback-Cookies` mechanism, which react-native-appwrite
 * only implements for web (`window.localStorage`) and silently no-ops on native.
 * So we read the real secret ourselves from the native cookie jar (the same
 * value Appwrite also sets as a Set-Cookie) right after the session call, then
 * wipe the cookie so the only place it lives is our own PIN-encrypted storage.
 */
import { AppwriteException } from 'react-native-appwrite';
import { account, ID, applySession, clearClientSession, endpoint, projectId } from './appwrite';
import { createLogger } from './logger';
import NitroCookies from 'react-native-nitro-cookies';

const log = createLogger('auth');

const VALIDATE_SESSION_TIMEOUT_MS = 10_000;

/**
 * Thrown by validateSession() when the request never got a response (timeout,
 * offline, DNS/firewall issue) — as opposed to the server actively rejecting
 * the session (401). Callers must NOT treat this the same as an invalid
 * session: wiping the local PIN over a transient network blip would strand a
 * user with a perfectly good session behind a PIN they can no longer use.
 */
export class SessionCheckNetworkError extends Error {}

/**
 * Recover the real session token from the native cookie jar when the SDK
 * response's own `secret` field is blank (the normal case — see module doc).
 * The cookie's value is the full opaque token Appwrite expects verbatim in
 * the `X-Appwrite-Session` header (confirmed from the SDK's own realtime-auth
 * code, which forwards this exact cookie value unmodified) — it must NOT be
 * base64/JSON-decoded first. Clears the cookie afterward: from this point on
 * the header-based session (`applySession`) and our PIN-encrypted copy are
 * the only places it lives.
 */
async function resolveSessionSecret(sdkSecret: string): Promise<string> {
  if (sdkSecret) return sdkSecret;
  const cookies = NitroCookies.getSync(endpoint);
  const cookie = cookies[`a_session_${projectId}`] ?? cookies[`a_session_${projectId}_legacy`];
  if (!cookie) return sdkSecret; // nothing to recover; caller handles the empty-secret case
  await NitroCookies.clearAll();
  return cookie.value;
}

export interface EmailOtpRequest {
  /** Appwrite user id to use in verifyEmailOtp (created on first request). */
  userId: string;
  /** Optional security phrase Appwrite includes in the email (anti-phishing). */
  phrase?: string;
}

/**
 * Request an Email OTP. Creates the Appwrite account on first use (ID.unique())
 * and emails a 6-digit code. Returns the userId needed to verify.
 */
export async function requestEmailOtp(email: string): Promise<EmailOtpRequest> {
  const token = await account.createEmailToken({
    userId: ID.unique(),
    email,
    phrase: false,
  });
  return { userId: token.userId, phrase: token.phrase };
}

export interface VerifiedSession {
  /** Canonical user id (Appwrite account $id) — becomes our user_id everywhere. */
  userId: string;
  /** Session secret to persist (encrypted) and re-apply via applySession(). */
  secret: string;
}

/**
 * Verify the emailed code and create a session. The returned secret is what we
 * encrypt behind the PIN; the client is also primed with it immediately so the
 * very next call (e.g. account.get / device upsert) is authenticated.
 */
export async function verifyEmailOtp(
  userId: string,
  code: string
): Promise<VerifiedSession> {
  const session = await account.createSession({ userId, secret: code });
  const secret = await resolveSessionSecret(session.secret);
  applySession(secret);
  return { userId: session.userId, secret };
}

/** Fetch the current account; throws (401) if the applied session is invalid. */
export async function getCurrentAccount() {
  return account.get();
}

/**
 * Validate that the currently applied session is still live on the server.
 * Returns the account id on success, null on 401/expiry/revocation.
 *
 * Times out after VALIDATE_SESSION_TIMEOUT_MS instead of hanging forever — the
 * SDK's account.get() has no built-in timeout, and on a real device a stalled
 * request (bad WiFi, captive portal, no route to the endpoint) would otherwise
 * leave the caller awaiting a promise that never settles.
 */
export async function validateSession(): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new SessionCheckNetworkError('validateSession timed out')),
      VALIDATE_SESSION_TIMEOUT_MS
    );
  });
  try {
    const me = await Promise.race([account.get(), timeout]);
    return me.$id;
  } catch (err) {
    log.error('validateSession failed:', err);
    // Only a real 401 (server actively says "not you") means the session is
    // dead. Anything else — timeout, DNS failure, no route — is "couldn't
    // check", not "checked and it's invalid".
    if (err instanceof AppwriteException && err.code === 401) {
      return null;
    }
    throw new SessionCheckNetworkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeoutId!);
  }
}

/** Revoke the current server session and clear the client. Best-effort. */
export async function logout(): Promise<void> {
  try {
    await account.deleteSession({ sessionId: 'current' });
  } catch {
    // session may already be gone — ignore
  } finally {
    clearClientSession();
  }
}
