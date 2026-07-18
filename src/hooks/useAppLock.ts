/**
 * Drives the app-lock lifecycle: runs the cold-start bootstrap once and re-locks
 * the app immediately every time it's backgrounded (banking behaviour — not on a
 * delay, since even a brief exit should require the PIN/biometric again).
 * Mounted once at the root; screens read `useAuthLock` directly.
 *
 * Listens for 'background' specifically, not 'inactive' — 'inactive' also fires
 * for transient interruptions (control center, a phone call banner, the app
 * switcher mid-swipe) that shouldn't force a re-lock.
 */
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthLock } from '@/lib/authLock';

export function useAppLock() {
  const status = useAuthLock((s) => s.status);
  const bootstrap = useAuthLock((s) => s.bootstrap);
  const lock = useAuthLock((s) => s.lock);

  // Cold-start once.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Re-lock the instant the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' && useAuthLock.getState().status === 'unlocked') {
        lock();
      }
    });
    return () => sub.remove();
  }, [lock]);

  return status;
}
