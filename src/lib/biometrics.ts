/**
 * LAYER 4 — biometric unlock.
 *
 * Biometrics never replace the PIN; they unlock the SAME PIN-derived key. When
 * the user opts in (right after setting/verifying a PIN) we stash the raw derived
 * key in SecureStore behind a biometric gate (requireAuthentication). A later
 * Face/Touch ID success returns the key, which decrypts the session blob exactly
 * as a correct PIN would. PIN entry is always available as a fallback.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { SecureKeys } from './secureStorage';
import { decryptSessionWithKey } from './pin';

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

/** Whether the device has biometric hardware AND the user has enrolled. */
export async function isBiometricAvailable(): Promise<boolean> {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && enrolled;
}

/** Best-effort label for UI copy ("Use Face ID" / "Use fingerprint"). */
export async function getBiometricKind(): Promise<BiometricKind> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'none';
}

/** Whether biometric unlock has been enabled (a key is stored) for this device. */
export async function isBiometricEnabled(): Promise<boolean> {
  // Read without prompting: the mere presence check would prompt with
  // requireAuthentication, so we track via a non-authenticated marker instead.
  const marker = await SecureStore.getItemAsync(SecureKeys.BIOMETRIC_KEY + '.enabled');
  return marker === '1';
}

/**
 * Enable biometric unlock by storing the PIN-derived key behind a biometric gate.
 * Requires a successful biometric prompt up front (proves the user can unlock).
 */
export async function enableBiometric(key: Uint8Array): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirm to enable biometric unlock',
    disableDeviceFallback: false,
  });
  if (!result.success) return false;

  await SecureStore.setItemAsync(SecureKeys.BIOMETRIC_KEY, bytesToHex(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: 'Unlock Piggy',
  });
  await SecureStore.setItemAsync(SecureKeys.BIOMETRIC_KEY + '.enabled', '1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return true;
}

/** Remove the stored biometric key (disable biometric unlock). */
export async function disableBiometric(): Promise<void> {
  await SecureStore.deleteItemAsync(SecureKeys.BIOMETRIC_KEY);
  await SecureStore.deleteItemAsync(SecureKeys.BIOMETRIC_KEY + '.enabled');
}

/**
 * Attempt a biometric unlock. Triggers the Face/Touch ID prompt (via the
 * requireAuthentication keychain read), retrieves the key, and decrypts the
 * session secret. Returns null on cancel/failure so the caller can fall back to
 * PIN entry.
 */
export async function unlockWithBiometric(): Promise<string | null> {
  if (!(await isBiometricEnabled())) return null;
  try {
    const keyHex = await SecureStore.getItemAsync(SecureKeys.BIOMETRIC_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock Piggy',
    });
    if (!keyHex) return null;
    return decryptSessionWithKey(hexToBytes(keyHex));
  } catch {
    // user cancelled or biometric failed
    return null;
  }
}
