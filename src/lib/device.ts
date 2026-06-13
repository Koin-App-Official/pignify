/**
 * Device identity + registration.
 *
 * A stable per-device id drives two things:
 *   1. "New device → create a new PIN": a device with no local session blob has
 *      never set up a PIN here, so it must re-login. (That check lives in the app
 *      lock flow; this module just supplies the id.)
 *   2. The backend `devices` table (already live: user_id, device_id, name,
 *      platform, registered_at, last_seen, active; unique [user_id, device_id]),
 *      which also feeds the `quota_devices` entitlement.
 *
 * The device id is best-effort stable: Android SSAID / iOS identifierForVendor,
 * with a generated UUID persisted in SecureStore as the fallback / canonical id.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { Permission, Role } from 'react-native-appwrite';
import { tablesDB, DATABASE_ID } from './appwrite';
import { SecureKeys, getItem, setItem } from './secureStorage';

const DEVICES_TABLE = 'devices';

/** Stable device id; generated once and persisted in the keychain thereafter. */
export async function getDeviceId(): Promise<string> {
  const existing = await getItem(SecureKeys.DEVICE_ID);
  if (existing) return existing;

  let platformId: string | null = null;
  try {
    platformId =
      Platform.OS === 'android'
        ? Application.getAndroidId()
        : await Application.getIosIdForVendorAsync();
  } catch {
    platformId = null;
  }

  const id = platformId ?? Crypto.randomUUID();
  await setItem(SecureKeys.DEVICE_ID, id);
  return id;
}

/** Deterministic, Appwrite-valid row id for (user, device). */
async function deviceRowId(userId: string, deviceId: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${userId}:${deviceId}`
  );
  return hash.slice(0, 32); // hex, <=36 chars, doesn't start with a special char
}

function deviceName(): string {
  return Device.deviceName ?? Device.modelName ?? 'Unknown device';
}

/**
 * Upsert this device's row for the authenticated user. Called on PIN setup and
 * on each successful unlock (to refresh last_seen). Best-effort: a failure here
 * must not block the user from using the app.
 */
export async function registerDevice(userId: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const rowId = await deviceRowId(userId, deviceId);
    const now = new Date().toISOString();

    await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: DEVICES_TABLE,
      rowId,
      data: {
        user_id: userId,
        device_id: deviceId,
        name: deviceName(),
        platform: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim(),
        registered_at: now,
        last_seen: now,
        active: true,
      },
      permissions: [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ],
    });
  } catch (err) {
    console.warn('[device] registerDevice failed (non-fatal):', err);
  }
}
