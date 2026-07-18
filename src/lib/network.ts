/**
 * Lightweight internet-reachability check via a real request to our own backend
 * (not just "any host"), so a false positive can't come from some unrelated
 * server being up while our actual endpoint is unreachable. Used before
 * PIN-destructive actions (forgot PIN) where failing mid-flow — after the local
 * PIN is already wiped but before a new one can be set — would strand the user.
 */
import { endpoint } from './appwrite';

const TIMEOUT_MS = 5000;

export async function hasInternetConnection(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Any HTTP response — even a 401 (this endpoint requires an API scope we
    // don't have client-side) — proves the request round-tripped over the
    // network. Only a thrown error (DNS failure, no route, our timeout above)
    // means actually offline; res.ok would wrongly report "offline" here since
    // Appwrite's /health always 401s for unauthenticated/guest requests.
    await fetch(`${endpoint}/health`, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
