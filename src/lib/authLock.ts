/**
 * App-lock state machine — the orchestration layer tying together primary auth
 * (auth.ts), the device PIN (pin.ts), biometrics (biometrics.ts) and device
 * registration (device.ts).
 *
 * This is a SEPARATE zustand store from the persisted piggy-storage on purpose:
 * the in-memory `sessionSecret`/`pendingSecret`/`userId` must NEVER be written
 * to disk. Only the encrypted session blob (keychain, via pin.ts) survives a
 * restart.
 *
 * Status flow (see plan's cold-start diagram):
 *   loading → unauthenticated → (login, no PIN yet) needs_pin_setup → (set PIN) unlocked
 *   loading → unauthenticated → (login, PIN already on device) needs_pin_confirm → (enter PIN) unlocked
 *   loading → locked → (PIN/biometric) unlocked
 *   any → unauthenticated  (forgot PIN / lockout exhausted / dead session)
 *
 * `needs_plan` is spliced in ahead of the PIN steps when the plan gate has
 * something to say (planGate.ts): the one-time trial intro after onboarding, or
 * a lapsed trial. The lapsed check also runs on every transition to unlocked, so
 * a trial that ends mid-week is caught on the next unlock rather than only at
 * login.
 *
 * Logging out (as opposed to forgot-PIN) deliberately does NOT wipe the local
 * PIN blob — the device already proved it knows the PIN, so the next login
 * only needs to re-confirm it (needs_pin_confirm), not invent a new one. The
 * re-confirmed PIN re-wraps the NEW post-login session secret under a fresh
 * salt (setPin), since the old blob's secret is dead the moment the server
 * session is revoked.
 */
import { create } from 'zustand';
import { applySession, clearClientSession } from './appwrite';
import { validateSession, logout as serverLogout, SessionCheckNetworkError } from './auth';
import { hasPin, verifyPin, setPin, clearPin, demoteToStale, getLockoutState } from './pin';
import { unlockWithBiometric, disableBiometric, isBiometricEnabled, enableBiometric } from './biometrics';
import { registerDevice } from './device';
import { useStore } from './store';
import { planGateReason, planGateReasonOnUnlock } from './planGate';
import { fetchServerGoals } from './goalsSync';
import { isUsableSecret } from './sessionSecret';
import { createLogger } from './logger';

const log = createLogger('authLock');

export type LockStatus =
  | 'loading'
  | 'unauthenticated'
  | 'needs_plan'
  | 'needs_pin_setup'
  | 'needs_pin_confirm'
  | 'locked'
  | 'unlocked';

export type UnlockResult =
  | { ok: true; key?: Uint8Array }
  | {
      ok: false;
      reason:
        | 'wrong_pin'
        | 'locked'
        | 'force_relogin'
        | 'invalid_session'
        | 'no_pin'
        | 'network_error';
      remainingMs?: number;
      attemptsRemaining?: number;
    };

type ActivateOutcome = 'ok' | 'invalid_session' | 'network_error';

interface AuthLockState {
  status: LockStatus;
  userId: string | null;
  /** Memory-only. Re-applied to the Appwrite client on every unlock. */
  sessionSecret: string | null;
  /**
   * Memory-only. Holds the freshly-verified OTP session secret while
   * `needs_pin_confirm` is showing — it's committed (re-wrapped under the
   * confirmed PIN) once the user re-enters their existing PIN.
   */
  pendingSecret: string | null;
  /**
   * Memory-only. Set when the app leaves the foreground while unlocked and the
   * user's auto-lock setting isn't 'immediate'; useAppLock consults it on
   * return to foreground to decide whether the grace period has elapsed.
   */
  backgroundedAt: number | null;
  /**
   * Memory-only. Where to go once the plan gate is dismissed.
   *
   * The gate is entered from two very different places: ahead of the PIN step
   * after a login, and *after* a successful unlock when a trial has lapsed
   * mid-week. Without recording which, dismissing the lapsed-trial gate would
   * bounce a user who just entered their PIN back to the PIN screen.
   */
  planGateReturnTo: LockStatus | null;
  /**
   * Memory-only. Set by the "I already have an account" entry point (welcome
   * carousel / onboarding name step) so `LoginGate` is reachable before
   * onboarding has ever completed — normally it only renders once a local
   * profile already exists. Cleared on a successful login or when the user
   * backs out of the login screen.
   */
  loginRequested: boolean;

  /** Cold-start: decide whether to show login or the lock screen. */
  bootstrap: () => Promise<void>;
  /**
   * Called by onboarding/login after a session is established (anonymous or
   * OTP). Routes to needs_pin_setup (no PIN on this device yet) or
   * needs_pin_confirm (a PIN already exists — e.g. after a normal logout).
   */
  onLoggedIn: (userId: string, secret: string) => Promise<void>;
  /**
   * Dismisses the plan gate and continues to the PIN step the login was headed
   * for. Only reachable from `needs_plan`.
   */
  onPlanAcknowledged: () => Promise<void>;
  /** Called after setPin() succeeds in the set-PIN screen. */
  onPinConfigured: () => Promise<void>;
  /** Attempt to unlock with a typed PIN. */
  tryUnlockPin: (pin: string) => Promise<UnlockResult>;
  /**
   * Re-confirm the existing PIN after a fresh login (needs_pin_confirm): on
   * success, re-wraps `pendingSecret` under the same PIN and unlocks.
   */
  confirmExistingPin: (pin: string) => Promise<UnlockResult>;
  /** Attempt biometric unlock; returns true if the app is now unlocked. */
  tryUnlockBiometric: () => Promise<boolean>;
  /** Re-lock (background timeout / manual). Keeps the encrypted blob. */
  lock: () => void;
  /** Record/clear the backgrounding timestamp used by the auto-lock grace period. */
  setBackgroundedAt: (ts: number | null) => void;
  /** Wipe local PIN+session and return to login (forgot PIN / forced re-login). */
  resetToLogin: () => Promise<void>;
  /**
   * Log out: revoke the server session and return to login, but keep the
   * local PIN blob intact so the next login only needs needs_pin_confirm.
   */
  logout: () => Promise<void>;
  /** Force `LoginGate` to render even though onboarding hasn't completed. */
  requestLogin: () => void;
  /** Undo `requestLogin()` — back out of the forced login screen to onboarding. */
  cancelLoginRequest: () => void;
}

/** Snapshot of the profile fields the plan gate decides on. */
function readPlanGateInput() {
  const { planStatus, trialIntroSeen, onboardingCompleted } = useStore.getState().profile;
  return { planStatus, trialIntroSeen: !!trialIntroSeen, onboardingCompleted };
}

/**
 * Best-effort, fire-and-forget: restore goal metadata from the server the
 * moment a real login happens, but ONLY when local goals are already empty
 * (a genuine reinstall/new device — see goalsSync.ts for why a non-empty
 * local state is never touched). Never awaited by `onLoggedIn` — the PIN step
 * shouldn't wait on a network call for something that only matters once the
 * user reaches the dashboard.
 */
function hydrateGoalsIfEmpty(userId: string): void {
  if (useStore.getState().goals.length > 0) return;
  fetchServerGoals(userId).then((goals) => {
    if (goals && goals.length > 0 && useStore.getState().goals.length === 0) {
      useStore.getState().setGoals(goals);
    }
  });
}

/**
 * Every route to `unlocked` goes through here, so a trial that lapses between
 * sessions is caught on the next unlock rather than only at login. Diverting to
 * the gate records `unlocked` as the return target — the PIN has already been
 * dealt with by the time this runs.
 */
function unlockPatch(): Pick<AuthLockState, 'status' | 'planGateReturnTo'> {
  return planGateReasonOnUnlock(readPlanGateInput())
    ? { status: 'needs_plan', planGateReturnTo: 'unlocked' }
    : { status: 'unlocked', planGateReturnTo: null };
}

/**
 * Promote a just-decrypted secret to an unlocked session, validating it live.
 *
 * Distinguishes "server said no" from "couldn't reach the server": only the
 * former wipes the local PIN. A timeout/offline validateSession() call must
 * NOT be treated as an invalid session — the encrypted blob is still perfectly
 * good, the network is just temporarily unavailable, and the caller should let
 * the user retry rather than force them through a full re-login.
 */
async function activateSession(
  secret: string,
  set: (s: Partial<AuthLockState>) => void
): Promise<ActivateOutcome> {
  // A blank secret can only come from a blob written by a build that let one
  // through (see SessionSecretUnavailableError). It's unusable, but the PIN
  // itself is still valid — deliberately do NOT clearPin() here, so the user
  // re-logs in and confirmExistingPin re-wraps the fresh secret around the PIN
  // they already know, rather than being forced to set a new one.
  if (!isUsableSecret(secret)) {
    log.error('stored session secret is empty — forcing re-login, keeping the PIN');
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null });
    return 'invalid_session';
  }

  applySession(secret);
  let accountId: string | null;
  try {
    accountId = await validateSession();
  } catch (err) {
    clearClientSession();
    if (err instanceof SessionCheckNetworkError) return 'network_error';
    throw err;
  }
  if (!accountId) {
    // session revoked/expired on the server — local PIN is useless, force re-login
    await clearPin();
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null });
    return 'invalid_session';
  }
  set({ ...unlockPatch(), userId: accountId, sessionSecret: secret });
  registerDevice(accountId); // fire-and-forget last_seen refresh
  return 'ok';
}

export const useAuthLock = create<AuthLockState>((set, get) => ({
  status: 'loading',
  userId: null,
  sessionSecret: null,
  pendingSecret: null,
  backgroundedAt: null,
  planGateReturnTo: null,
  loginRequested: false,

  bootstrap: async () => {
    set({ status: 'loading' });
    const lock = await getLockoutState();
    if (lock.forceRelogin) {
      await get().resetToLogin();
      return;
    }
    const pinExists = await hasPin();
    if (pinExists && !useStore.getState().profile.onboardingCompleted) {
      // Keychain items outlive both "Reset Data" and a full app delete on iOS, so a
      // PIN blob can exist with no matching local profile (fresh install/reset that
      // never got to clear it). That PIN belongs to an account this install no
      // longer knows about — wipe it and start clean instead of locking on it.
      await clearPin();
      clearClientSession();
      set({ status: 'unauthenticated', userId: null, sessionSecret: null });
      return;
    }
    // No PIN blob means no stored session on this device → must (re-)login.
    set({ status: pinExists ? 'locked' : 'unauthenticated' });
  },

  onLoggedIn: async (userId, secret) => {
    // verifyEmailOtp already applied the session to the client.
    // A PIN already on this device (normal logout, not forgot-PIN) only needs
    // re-confirming rather than a brand-new one. Which slot the secret goes in
    // follows from that: `pendingSecret` is held until the existing PIN is
    // re-entered, `sessionSecret` is live immediately.
    const hasExistingPin = await hasPin();
    // The gate goes ahead of the PIN step, so the user learns about the trial
    // before being asked to secure the account.
    const gated = planGateReason(readPlanGateInput()) !== null;

    const pinStep: LockStatus = hasExistingPin ? 'needs_pin_confirm' : 'needs_pin_setup';
    const status = gated ? 'needs_plan' : pinStep;
    const planGateReturnTo = gated ? pinStep : null;

    if (hasExistingPin) {
      set({ userId, pendingSecret: secret, status, planGateReturnTo, loginRequested: false });
    } else {
      set({ userId, sessionSecret: secret, status, planGateReturnTo, loginRequested: false });
    }
    hydrateGoalsIfEmpty(userId);
  },

  onPlanAcknowledged: async () => {
    // Fall back to the PIN step only if nothing was recorded — that can only
    // happen if the gate were somehow entered without going through either
    // entry point, and sending an un-PIN'd user to setup is the safe guess.
    const target =
      get().planGateReturnTo ?? ((await hasPin()) ? 'needs_pin_confirm' : 'needs_pin_setup');
    set({ status: target, planGateReturnTo: null });
  },

  onPinConfigured: async () => {
    const { userId } = get();
    set(unlockPatch());
    if (userId) registerDevice(userId);
  },

  tryUnlockPin: async (pin) => {
    const lock = await getLockoutState();
    if (lock.forceRelogin) {
      await get().resetToLogin();
      return { ok: false, reason: 'force_relogin' };
    }
    if (lock.locked) {
      return { ok: false, reason: 'locked', remainingMs: lock.remainingMs };
    }

    const res = await verifyPin(pin);
    if (!res.ok) {
      if (res.reason === 'no_pin') return { ok: false, reason: 'no_pin' };
      const after = await getLockoutState();
      if (after.forceRelogin) {
        await get().resetToLogin();
        return { ok: false, reason: 'force_relogin' };
      }
      return {
        ok: false,
        reason: after.locked ? 'locked' : 'wrong_pin',
        remainingMs: after.remainingMs,
        attemptsRemaining: after.attemptsRemaining,
      };
    }

    const outcome = await activateSession(res.secret, set);
    return outcome === 'ok' ? { ok: true, key: res.key } : { ok: false, reason: outcome };
  },

  confirmExistingPin: async (pin) => {
    const lock = await getLockoutState();
    if (lock.forceRelogin) {
      set({ pendingSecret: null });
      await get().resetToLogin();
      return { ok: false, reason: 'force_relogin' };
    }
    if (lock.locked) {
      return { ok: false, reason: 'locked', remainingMs: lock.remainingMs };
    }

    // verifyPin only proves the PIN is correct here — the blob's own secret is
    // already dead (server session was revoked on logout); it's discarded, and
    // `pendingSecret` (the NEW post-login secret) is what gets wrapped instead.
    const res = await verifyPin(pin);
    if (!res.ok) {
      const after = await getLockoutState();
      if (after.forceRelogin) {
        set({ pendingSecret: null });
        await get().resetToLogin();
        return { ok: false, reason: 'force_relogin' };
      }
      return {
        ok: false,
        reason: after.locked ? 'locked' : 'wrong_pin',
        remainingMs: after.remainingMs,
        attemptsRemaining: after.attemptsRemaining,
      };
    }

    const { pendingSecret } = get();
    if (!pendingSecret) return { ok: false, reason: 'invalid_session' };

    const key = await setPin(pin, pendingSecret);
    // setPin rotates the salt, so any previously-stored biometric key (wrapping
    // the OLD derived key) is now stale — silently re-derive it, same as
    // PinCreationFlow does on a PIN change.
    if (await isBiometricEnabled()) {
      await enableBiometric(key).catch(() => false);
    }

    const outcome = await activateSession(pendingSecret, set);
    if (outcome === 'network_error') {
      // Keep pendingSecret intact — the PIN blob is already re-wrapped around
      // it above, so a retry just needs to re-run activateSession, not redo
      // the whole confirm-PIN step.
      return { ok: false, reason: 'network_error' };
    }
    set({ pendingSecret: null });
    return outcome === 'ok' ? { ok: true } : { ok: false, reason: 'invalid_session' };
  },

  tryUnlockBiometric: async () => {
    const secret = await unlockWithBiometric();
    if (!secret) return false;
    const outcome = await activateSession(secret, set);
    return outcome === 'ok';
  },

  lock: () => {
    clearClientSession();
    set({ status: 'locked', sessionSecret: null, userId: null, backgroundedAt: null, planGateReturnTo: null });
  },

  setBackgroundedAt: (ts) => set({ backgroundedAt: ts }),

  resetToLogin: async () => {
    // Demotes (not deletes) the PIN blob: routes the app to login exactly like a
    // full wipe would, but keeps the old ciphertext around just long enough for
    // the next PinCreationFlow to reject a new PIN identical to the one just discarded.
    await demoteToStale();
    await disableBiometric();
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null, pendingSecret: null, planGateReturnTo: null });
  },

  logout: async () => {
    await serverLogout();
    clearClientSession();
    // Deliberately does NOT touch the local PIN blob/biometric key — the next
    // login only needs needs_pin_confirm, not a brand-new PIN (see file header).
    set({ status: 'unauthenticated', userId: null, sessionSecret: null, backgroundedAt: null, planGateReturnTo: null });
  },

  requestLogin: () => set({ loginRequested: true }),
  cancelLoginRequest: () => set({ loginRequested: false }),
}));
