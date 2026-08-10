/**
 * Configured Appwrite client singletons for the React Native app.
 *
 * This is the ONLY place the client SDK is constructed. The app authenticates
 * with a real Appwrite session (Email OTP — see auth.ts); the session secret is
 * persisted encrypted behind the device PIN (see pin.ts) and re-applied on cold
 * start via `applySession`.
 *
 * Env (EXPO_PUBLIC_*, mirrors .env.appwrite.example):
 *   EXPO_PUBLIC_APPWRITE_ENDPOINT     e.g. https://cloud.appwrite.io/v1
 *   EXPO_PUBLIC_APPWRITE_PROJECT_ID
 *   EXPO_PUBLIC_APPWRITE_DATABASE_ID  defaults to piggnify_mobile_db
 */
import { Client, Account, TablesDB, ID } from 'react-native-appwrite';
import { createLogger } from './logger';

const log = createLogger('appwrite');

export const endpoint = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT ?? '';
export const projectId = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID ?? '';

/** The live database id. */
export const DATABASE_ID =
  process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID ?? 'piggnify_mobile_db';

const isConfigured = !!endpoint && !!projectId;

if (!isConfigured) {
  // Surfaced loudly in dev rather than failing with an opaque network error.
  log.warn(
    'Missing EXPO_PUBLIC_APPWRITE_ENDPOINT or EXPO_PUBLIC_APPWRITE_PROJECT_ID — auth will fail.'
  );
}

// Client.setEndpoint()/setProject() throw synchronously on an empty string, and this
// module is imported (directly or transitively) by nearly every route — including the
// root layout — so that throw would crash module evaluation for the whole route tree,
// not just auth. Fall back to obviously-invalid placeholders so construction always
// succeeds; real network calls still fail loudly (as intended) when unconfigured.
export const client = new Client()
  .setEndpoint(isConfigured ? endpoint : 'https://unconfigured.invalid/v1')
  .setProject(isConfigured ? projectId : 'unconfigured');

export const account = new Account(client);
export const tablesDB = new TablesDB(client);

export { ID };

/**
 * Re-apply a previously obtained session secret to the client so subsequent
 * requests are authenticated. Called after the PIN/biometric unlock decrypts the
 * stored secret. Passing an empty string clears the session.
 */
export function applySession(secret: string): void {
  client.setSession(secret);
}

/** Clear the in-client session (does not touch the server session). */
export function clearClientSession(): void {
  client.setSession('');
}
