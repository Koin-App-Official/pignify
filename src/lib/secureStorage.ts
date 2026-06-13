/**
 * Typed wrapper over expo-secure-store (iOS Keychain / Android Keystore).
 *
 * Everything security-sensitive that must survive app restarts lives here:
 *   - SESSION_BLOB  : the Appwrite session secret, encrypted with the PIN-derived
 *                     key (see pin.ts). Confidential at rest twice over (OS keychain
 *                     + PIN encryption).
 *   - BIOMETRIC_KEY : the raw PIN-derived key, stored behind a biometric gate so
 *                     Face/Touch ID can decrypt the session without the PIN.
 *   - LOCKOUT_STATE : failed-attempt counter + lockout deadline (survives app kill).
 *   - DEVICE_ID     : stable per-install device id fallback.
 *
 * NOTE: the session secret in memory and the derived key are NEVER written to the
 * zustand persist store (AsyncStorage) — only here, only encrypted.
 */
import * as SecureStore from 'expo-secure-store';

export const SecureKeys = {
  SESSION_BLOB: 'piggy.session_blob',
  BIOMETRIC_KEY: 'piggy.biometric_key',
  LOCKOUT_STATE: 'piggy.lockout_state',
  DEVICE_ID: 'piggy.device_id',
} as const;

export type SecureKey = (typeof SecureKeys)[keyof typeof SecureKeys];

/** Default accessibility: this-device-only, available after first unlock. */
const DEFAULT_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getItem(
  key: SecureKey,
  options: SecureStore.SecureStoreOptions = DEFAULT_OPTS
): Promise<string | null> {
  return SecureStore.getItemAsync(key, options);
}

export async function setItem(
  key: SecureKey,
  value: string,
  options: SecureStore.SecureStoreOptions = DEFAULT_OPTS
): Promise<void> {
  return SecureStore.setItemAsync(key, value, options);
}

export async function deleteItem(key: SecureKey): Promise<void> {
  // deleteItemAsync ignores accessibility but must match requireAuthentication-free path.
  return SecureStore.deleteItemAsync(key);
}

/** Convenience JSON helpers. */
export async function getJSON<T>(key: SecureKey): Promise<T | null> {
  const raw = await getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: SecureKey, value: T): Promise<void> {
  return setItem(key, JSON.stringify(value));
}
