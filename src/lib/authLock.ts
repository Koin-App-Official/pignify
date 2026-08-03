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
import { validateSession, logout as serverLogout } from './auth';
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
      reason: 'wrong_pin' | 'locked' | 'force_relogin' | 'invalid_session' | 'no_pin';
      remainingMs?: number;
      attemptsRemaining?: number;
    };

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

/** Promote a just-decrypted secret to an unlocked session, validating it live. */
async function activateSession(
  secret: string,
  set: (s: Partial<AuthLockState>) => void
): Promise<boolean> {
  applySession(secret);
  const accountId = await validateSession();
  if (!accountId) {
    // session revoked/expired on the server — local PIN is useless, force re-login
    await clearPin();
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null });
    return false;
  }
  set({ status: 'unlocked', userId: accountId, sessionSecret: secret });
  registerDevice(accountId); // fire-and-forget last_seen refresh
  return true;
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

    const ok = await activateSession(res.secret, set);
    return ok ? { ok: true } : { ok: false, reason: 'invalid_session' };
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

    const ok = await activateSession(pendingSecret, set);
    set({ pendingSecret: null });
    return ok ? { ok: true } : { ok: false, reason: 'invalid_session' };
  },

  tryUnlockBiometric: async () => {
    const secret = await unlockWithBiometric();
    if (!secret) return false;
    return activateSession(secret, set);
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
