/**
 * Drives the app-lock lifecycle: runs the cold-start bootstrap once and re-locks
 * the app after it has been backgrounded longer than LOCK_TIMEOUT_MS (banking
 * behaviour). Mounted once at the root; screens read `useAuthLock` directly.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthLock } from '@/lib/authLock';

/** How long the app may sit in the background before it re-locks. */
export const LOCK_TIMEOUT_MS = 60_000;

export function useAppLock() {
  const status = useAuthLock((s) => s.status);
  const bootstrap = useAuthLock((s) => s.bootstrap);
  const lock = useAuthLock((s) => s.lock);
  const backgroundedAt = useRef<number | null>(null);

  // Cold-start once.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Re-lock after a background timeout.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          since != null &&
          Date.now() - since >= LOCK_TIMEOUT_MS &&
          useAuthLock.getState().status === 'unlocked'
        ) {
          lock();
        }
      }
    });
    return () => sub.remove();
  }, [lock]);

  return status;
}
