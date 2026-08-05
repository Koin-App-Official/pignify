import * as Device from 'expo-device';

export type DevicePerformanceTier = 'high' | 'mid' | 'low';

let cachedTier: DevicePerformanceTier | null = null;

/**
 * Coarse heuristic tier used to gate particle counts, blur, and shader effects.
 * Bucketed by device RAM on both platforms — older-but-still-current iPhones
 * (e.g. iPhone SE 2020, 3GB) are not automatically "high" just for being iOS.
 */
export function devicePerformanceTier(): DevicePerformanceTier {
  if (cachedTier) return cachedTier;

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
