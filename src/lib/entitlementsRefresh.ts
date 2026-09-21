/**
 * One shared entitlements refresh, used by every caller that needs server plan
 * state applied to the store.
 *
 * Lifted out of `(tabs)/_layout.tsx` in #173. It used to be a private function
 * there with the hourly throttle baked in, which was fine while the app owned
 * the purchase flow — the plan could only change from inside the app, so the
 * app already knew. Now that subscribing, upgrading and cancelling all happen
 * on the web, a user can return from the browser on a different plan than they
 * left on, and waiting up to an hour to notice would look like the payment
 * didn't work. Hence `force`.
 */
import { fetchEntitlementsSync } from './entitlementsSync';
import { evaluateDowngradeRetention } from './retention';
import { activeIncomes } from './income';
import { useStore } from './store';

/** How long a background/foreground refresh trusts the last successful sync. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

interface SyncOptions {
  /** Skip the hourly throttle — use after the user has been off managing billing. */
  force?: boolean;
  signal?: AbortSignal;
}

/**
 * Reads `CLAUDE_entitlements_get` and patches the store with whatever the server
 * says. Never throws: `fetchEntitlementsSync` swallows its own failures and the
 * hourly cron / next foreground is always the backstop.
 *
 * Returns true when fresh server state was applied — callers that show a
 * "checking…" state (the locked plan gate) use this to tell "we asked and the
 * answer was no" apart from "we couldn't ask".
 */
export async function syncEntitlements(opts: SyncOptions = {}): Promise<boolean> {
  const { force = false, signal } = opts;
  const { profile, lastProfileSync } = useStore.getState();
  if (!profile.userID) return false;
  if (
    !force &&
    lastProfileSync &&
    Date.now() - new Date(lastProfileSync).getTime() < SYNC_INTERVAL_MS
  ) {
    return false;
  }

  const data = await fetchEntitlementsSync(profile.userID, signal);
  if (!data) return false;

  const { updateProfile, setServerAiMessageUsage, setAddonMessageBalance, setLastProfileSync } =
    useStore.getState();

  // The server is authoritative for all of these; `trialEndsAt` may legitimately
  // be null (no trial), so it's applied whenever the field was present rather
  // than only when truthy.
  const profilePatch: Parameters<typeof updateProfile>[0] = {};
  if (data.plan) profilePatch.plan = data.plan;
  if (data.status) profilePatch.planStatus = data.status;
  if (data.trialEndsAt !== undefined) profilePatch.trialEndsAt = data.trialEndsAt;
  if (data.currentPeriodEnd !== undefined) profilePatch.currentPeriodEnd = data.currentPeriodEnd;
  if (Object.keys(profilePatch).length > 0) updateProfile(profilePatch);

  if (typeof data.quotaAiMessages === 'number' || typeof data.aiMessagesUsed === 'number') {
    setServerAiMessageUsage(
      typeof data.quotaAiMessages === 'number' ? data.quotaAiMessages : null,
      typeof data.aiMessagesUsed === 'number' ? data.aiMessagesUsed : null
    );
  }

  // Purchases happen on the web now, so this read is the only way a balance
  // bought there ever reaches the device.
  if (typeof data.addonBalance === 'number') setAddonMessageBalance(data.addonBalance);

  setLastProfileSync(new Date().toISOString());

  // A downgrade made on the web can leave the user holding more active goals
  // than the new plan allows. Nothing is archived automatically (C4/C7) — this
  // only records that a choice is owed; the UI prompts for it and
  // `applyRetentionSelection` resolves it.
  const { profile: synced, goals, setRetentionRequired } = useStore.getState();
  const requirement = evaluateDowngradeRetention(synced.plan, {
    goals: goals.filter((g) => !g.archived).length,
    incomes: activeIncomes(synced.incomes).length,
    devices: 0,
  });
  setRetentionRequired(requirement.selectionRequired ? synced.plan : null);

  return true;
}
