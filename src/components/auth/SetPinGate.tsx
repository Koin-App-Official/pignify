/**
 * Set-PIN screen — shown after a fresh login (needs_pin_setup). Delegates the
 * enter+confirm+biometric-enrollment flow to PinCreationFlow (shared with
 * change-pin.tsx), then unlocks via onPinConfigured.
 *
 * This screen also serves the second half of a forgot-PIN reset (LoginGate →
 * onLoggedIn → here), where the old PIN was demoted-not-deleted specifically so
 * a matching new PIN can be rejected — reuseCheckSource="stale" is a no-op for a
 * genuine first-time setup (no stale blob exists yet) and only bites in that
 * forgot-PIN case.
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthLock } from '@/lib/authLock';
import { PinCreationFlow } from './PinCreationFlow';

export function SetPinGate() {
  const sessionSecret = useAuthLock((s) => s.sessionSecret);
  const onPinConfigured = useAuthLock((s) => s.onPinConfigured);

  // Always set together in onLoggedIn; null here would mean a state-machine bug.
  if (!sessionSecret) return null;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <PinCreationFlow sessionSecret={sessionSecret} reuseCheckSource="stale" onDone={onPinConfigured} />
    </SafeAreaView>
  );
}
