import { Platform } from 'react-native';
import * as Device from 'expo-device';

export type DevicePerformanceTier = 'high' | 'mid' | 'low';

let cachedTier: DevicePerformanceTier | null = null;

/**
 * Coarse heuristic tier used to gate particle counts, blur, and shader effects.
 * iOS devices are generally capable enough to default to 'high'; Android is
 * bucketed by RAM since low-end Android is where frame drops actually show up.
 */
export function devicePerformanceTier(): DevicePerformanceTier {
  if (cachedTier) return cachedTier;

  if (Platform.OS === 'ios') {
    cachedTier = 'high';
    return cachedTier;
  }

  const totalMemory = Device.totalMemory ?? 0;
  const gb = totalMemory / (1024 * 1024 * 1024);

  if (gb >= 6) {
    cachedTier = 'high';
  } else if (gb >= 3) {
    cachedTier = 'mid';
  } else {
    cachedTier = 'low';
  }

  return cachedTier;
}
