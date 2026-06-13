/**
 * LAYER 3 — local device PIN unlock + lockout.
 *
 * The 6-digit PIN never leaves the device and is never stored, even hashed in a
 * separate verifier. Instead, the PIN derives an AES-256-GCM key (PBKDF2) that
 * encrypts the Appwrite session secret. The ciphertext IS the verifier: a wrong
 * PIN produces a wrong key, the GCM auth tag fails, and decryption throws. This
 * is the banking-grade property — an attacker who extracts the keychain blob
 * still cannot recover the session without the PIN.
 *
 * Lockout (5 failures → escalating timed lockout → forced re-login) lives here
 * too because it gates verifyPin; state is persisted so killing the app cannot
 * reset it.
 */
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8 } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';
import {
  SecureKeys,
  getItem,
  setItem,
  deleteItem,
  getJSON,
  setJSON,
} from './secureStorage';

// ── Tuning ──────────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 150_000; // offline brute-force cost vs. on-device UX
const KEY_LEN = 32; // AES-256
const SALT_LEN = 16;
const NONCE_LEN = 12; // GCM standard
const BLOB_VERSION = 1;

export const PIN_LENGTH = 6;
export const MAX_ATTEMPTS = 5;
/** Escalating lockout durations per cycle; after the last, force re-login. */
const LOCKOUT_SCHEDULE_MS = [30_000, 5 * 60_000, 30 * 60_000];

// ── Encrypted session blob ────────────────────────────────────────────────────
interface SessionBlob {
  v: number;
  salt: string; // hex
  nonce: string; // hex
  ct: string; // hex (ciphertext + GCM tag)
}

/** Derive the AES key from a PIN + salt. Async so it doesn't jank the UI thread. */
async function deriveKey(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(pin), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LEN,
  });
}

/**
 * Set (or replace) the device PIN, encrypting the given session secret under it.
 * Returns the derived key so the caller can optionally enable biometrics with it.
 * Also clears any prior lockout state.
 */
export async function setPin(pin: string, sessionSecret: string): Promise<Uint8Array> {
  const salt = Crypto.getRandomBytes(SALT_LEN);
  const nonce = Crypto.getRandomBytes(NONCE_LEN);
  const key = await deriveKey(pin, salt);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(sessionSecret));

  const blob: SessionBlob = {
    v: BLOB_VERSION,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
  };
  await setJSON(SecureKeys.SESSION_BLOB, blob);
  await resetLockout();
  return key;
}

export type VerifyResult =
  | { ok: true; secret: string; key: Uint8Array }
  | { ok: false; reason: 'wrong_pin' | 'no_pin' };

/**
 * Verify a PIN by attempting to decrypt the session blob. On success returns the
 * session secret + derived key and resets lockout; on failure records an attempt.
 * Callers MUST check getLockoutState() first and refuse while locked.
 */
export async function verifyPin(pin: string): Promise<VerifyResult> {
  const blob = await getJSON<SessionBlob>(SecureKeys.SESSION_BLOB);
  if (!blob) return { ok: false, reason: 'no_pin' };

  const key = await deriveKey(pin, hexToBytes(blob.salt));
  try {
    const pt = gcm(key, hexToBytes(blob.nonce)).decrypt(hexToBytes(blob.ct));
    const secret = bytesToUtf8(pt);
    await resetLockout();
    return { ok: true, secret, key };
  } catch {
    // GCM tag mismatch == wrong PIN.
    await recordFailure();
    return { ok: false, reason: 'wrong_pin' };
  }
}

/** Decrypt the session blob with an already-known key (biometric unlock path). */
export async function decryptSessionWithKey(key: Uint8Array): Promise<string | null> {
  const blob = await getJSON<SessionBlob>(SecureKeys.SESSION_BLOB);
  if (!blob) return null;
  try {
    const pt = gcm(key, hexToBytes(blob.nonce)).decrypt(hexToBytes(blob.ct));
    await resetLockout();
    return bytesToUtf8(pt);
  } catch {
    return null;
  }
}

export async function hasPin(): Promise<boolean> {
  return (await getItem(SecureKeys.SESSION_BLOB)) != null;
}

/** Wipe the PIN/session entirely (forgot-PIN, lockout exhaustion, logout). */
export async function clearPin(): Promise<void> {
  await deleteItem(SecureKeys.SESSION_BLOB);
  await deleteItem(SecureKeys.BIOMETRIC_KEY);
  await resetLockout();
}

// ── PIN strength ──────────────────────────────────────────────────────────────
/** Reject trivial PINs banking-style. Returns an error message or null if ok. */
export function validatePinStrength(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN must be 6 digits.';
  if (/^(\d)\1{5}$/.test(pin)) return 'Avoid repeating the same digit.';
  const asc = '0123456789';
  const desc = '9876543210';
  if (asc.includes(pin) || desc.includes(pin)) return 'Avoid sequential digits.';
  if (['000000', '111111', '123456', '654321', '121212', '112233'].includes(pin))
    return 'That PIN is too common.';
  return null;
}

// ── Lockout ────────────────────────────────────────────────────────────────────
interface LockoutState {
  failed: number; // failures in the current cycle
  cycle: number; // how many full lockouts have elapsed
  lockedUntil: number; // epoch ms; 0 if not locked
}

const EMPTY_LOCKOUT: LockoutState = { failed: 0, cycle: 0, lockedUntil: 0 };

async function readLockout(): Promise<LockoutState> {
  return (await getJSON<LockoutState>(SecureKeys.LOCKOUT_STATE)) ?? EMPTY_LOCKOUT;
}

async function resetLockout(): Promise<void> {
  await deleteItem(SecureKeys.LOCKOUT_STATE);
}

async function recordFailure(): Promise<void> {
  const s = await readLockout();
  s.failed += 1;
  if (s.failed >= MAX_ATTEMPTS) {
    const duration = LOCKOUT_SCHEDULE_MS[Math.min(s.cycle, LOCKOUT_SCHEDULE_MS.length - 1)];
    s.lockedUntil = Date.now() + duration;
    s.cycle += 1;
    s.failed = 0;
  }
  await setJSON(SecureKeys.LOCKOUT_STATE, s);
}

export interface LockoutStatus {
  locked: boolean;
  /** ms remaining on the current lockout, 0 if not locked. */
  remainingMs: number;
  /** attempts left before the next lockout triggers. */
  attemptsRemaining: number;
  /** true once escalation is exhausted — caller must force re-login + new PIN. */
  forceRelogin: boolean;
}

/**
 * Current lockout status. Note time-based: we trust the wall clock for the
 * deadline but ALSO escalate by cycle count, so rolling the clock back cannot
 * grant fresh attempts beyond the cycle the user is already in.
 */
export async function getLockoutState(): Promise<LockoutStatus> {
  const s = await readLockout();
  const now = Date.now();
  const forceRelogin = s.cycle >= LOCKOUT_SCHEDULE_MS.length && s.lockedUntil <= now;
  const locked = s.lockedUntil > now;
  return {
    locked,
    remainingMs: locked ? s.lockedUntil - now : 0,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - s.failed),
    forceRelogin,
  };
}
