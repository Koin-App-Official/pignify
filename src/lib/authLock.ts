/**
 * App-lock state machine — the orchestration layer tying together primary auth
 * (auth.ts), the device PIN (pin.ts), biometrics (biometrics.ts) and device
 * registration (device.ts).
 *
 * This is a SEPARATE zustand store from the persisted piggy-storage on purpose:
 * the in-memory `sessionSecret` and `userId` must NEVER be written to disk. Only
 * the encrypted session blob (keychain, via pin.ts) survives a restart.
 *
 * Status flow (see plan's cold-start diagram):
 *   loading → unauthenticated → (login) needs_pin_setup → (set PIN) unlocked
 *   loading → locked → (PIN/biometric) unlocked
 *   any → unauthenticated  (forgot PIN / lockout exhausted / dead session / logout)
 */
import { create } from 'zustand';
import { applySession, clearClientSession } from './appwrite';
import { validateSession, logout as serverLogout } from './auth';
import { hasPin, verifyPin, clearPin, demoteToStale, getLockoutState } from './pin';
import { unlockWithBiometric, disableBiometric } from './biometrics';
import { registerDevice } from './device';
import { useStore } from './store';

export type LockStatus =
  | 'loading'
  | 'unauthenticated'
  | 'needs_pin_setup'
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

  /** Cold-start: decide whether to show login or the lock screen. */
  bootstrap: () => Promise<void>;
  /** Called by onboarding/login after a session is established (anonymous or OTP). */
  onLoggedIn: (userId: string, secret: string) => void;
  /** Called after setPin() succeeds in the set-PIN screen. */
  onPinConfigured: () => Promise<void>;
  /** Attempt to unlock with a typed PIN. */
  tryUnlockPin: (pin: string) => Promise<UnlockResult>;
  /** Attempt biometric unlock; returns true if the app is now unlocked. */
  tryUnlockBiometric: () => Promise<boolean>;
  /** Re-lock (background timeout / manual). Keeps the encrypted blob. */
  lock: () => void;
  /** Wipe local PIN+session and return to login (forgot PIN / forced re-login). */
  resetToLogin: () => Promise<void>;
  /** Full logout: revoke the server session too, then reset to login. */
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

  onLoggedIn: (userId, secret) => {
    // verifyEmailOtp already applied the session to the client.
    set({ userId, sessionSecret: secret, status: 'needs_pin_setup' });
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

  tryUnlockBiometric: async () => {
    const secret = await unlockWithBiometric();
    if (!secret) return false;
    return activateSession(secret, set);
  },

  lock: () => {
    clearClientSession();
    set({ status: 'locked', sessionSecret: null, userId: null });
  },

  resetToLogin: async () => {
    // Demotes (not deletes) the PIN blob: routes the app to login exactly like a
    // full wipe would, but keeps the old ciphertext around just long enough for
    // the next PinCreationFlow to reject a new PIN identical to the old one.
    await demoteToStale();
    await disableBiometric();
    clearClientSession();
    set({ status: 'unauthenticated', userId: null, sessionSecret: null });
  },

  logout: async () => {
    await serverLogout();
    await get().resetToLogin();
  },
}));
