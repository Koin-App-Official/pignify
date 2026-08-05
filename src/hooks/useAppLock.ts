/**
 * Drives the app-lock lifecycle: runs the cold-start bootstrap once and re-locks
 * the app when it's backgrounded — either immediately (banking behaviour,
 * default) or after a grace period set by the user in Settings
 * (`profile.autoLockMinutes`). Mounted once at the root; screens read
 * `useAuthLock` directly.
 *
 * Listens for 'background' specifically, not 'inactive' — 'inactive' also fires
 * for transient interruptions (control center, a phone call banner, the app
 * switcher mid-swipe) that shouldn't force a re-lock.
 *
 * Note: a killed/relaunched process always re-locks regardless of this setting
 * — bootstrap() only checks whether a PIN exists, not elapsed time. The grace
 * period only applies while the process stays alive in the background.
 */
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthLock } from '@/lib/authLock';
import { useStore } from '@/lib/store';

export function useAppLock() {
  const status = useAuthLock((s) => s.status);
  const bootstrap = useAuthLock((s) => s.bootstrap);
  const lock = useAuthLock((s) => s.lock);
  const setBackgroundedAt = useAuthLock((s) => s.setBackgroundedAt);

  // Cold-start once.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const lockState = useAuthLock.getState();
      if (lockState.status !== 'unlocked') return;

      const autoLockMinutes = useStore.getState().profile.autoLockMinutes;

      if (next === 'background') {
        if (autoLockMinutes === 0) {
          lock();
        } else {
          setBackgroundedAt(Date.now());
        }
        return;
      }

      if (next === 'active' && lockState.backgroundedAt != null) {
        const elapsedMs = Date.now() - lockState.backgroundedAt;
        if (autoLockMinutes !== null && elapsedMs >= autoLockMinutes * 60_000) {
          lock();
        } else {
          setBackgroundedAt(null);
        }
      }
    });
    return () => sub.remove();
  }, [lock, setBackgroundedAt]);

  return status;
}
