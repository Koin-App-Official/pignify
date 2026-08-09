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

export type LockStatus =
  | 'loading'
  | 'unauthenticated'
  | 'needs_pin_setup'
  | 'needs_pin_confirm'
  | 'locked'
  | 'unlocked';

export type UnlockResult =
  | { ok: true }
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

  /** Cold-start: decide whether to show login or the lock screen. */
  bootstrap: () => Promise<void>;
  /**
   * Called by onboarding/login after a session is established (anonymous or
   * OTP). Routes to needs_pin_setup (no PIN on this device yet) or
   * needs_pin_confirm (a PIN already exists — e.g. after a normal logout).
   */
  onLoggedIn: (userId: string, secret: string) => Promise<void>;
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
  set({ status: 'unlocked', userId: accountId, sessionSecret: secret });
  registerDevice(accountId); // fire-and-forget last_seen refresh
  return 'ok';
}

export const useAuthLock = create<AuthLockState>((set, get) => ({
  status: 'loading',
  userId: null,
  sessionSecret: null,
  pendingSecret: null,
  backgroundedAt: null,

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
    if (await hasPin()) {
      // A PIN already lives on this device (normal logout, not forgot-PIN) —
      // just re-confirm it rather than forcing a brand-new one.
      set({ userId, pendingSecret: secret, status: 'needs_pin_confirm' });
    } else {
      set({ userId, sessionSecret: secret, status: 'needs_pin_setup' });
    }
  },

  onPinConfigured: async () => {
    const { userId } = get();
    set({ status: 'unlocked' });
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
    return outcome === 'ok' ? { ok: true } : { ok: false, reason: outcome };
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
    set({ status: 'locked', sessionSecret: null, userId: null, backgroundedAt: null });
  },

  setBackgroundedAt: (ts) => set({ backgroundedAt: ts }),

  resetToLogin: async () => {
    // Demotes (not deletes) the PIN blob: routes the app to login exactly like a
    // full wipe would, but keeps the old ciphertext around just long enough for
    // the next PinCreationFlow to reject a new PIN identical to the one just discarded.
    await demoteToStale();
    await disableBiometric();
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null, pendingSecret: null });
  },

  logout: async () => {
    await serverLogout();
    clearClientSession();
    // Deliberately does NOT touch the local PIN blob/biometric key — the next
    // login only needs needs_pin_confirm, not a brand-new PIN (see file header).
    set({ status: 'unauthenticated', userId: null, sessionSecret: null, backgroundedAt: null });
  },
}));
