/**
 * Change PIN — pushed as a modal from Profile, only reachable while already
 * unlocked (AuthGate covers every other status). Re-confirms the current PIN
 * first (reusing the same lockout as LockGate, via tryUnlockPin), then hands
 * off to PinCreationFlow (shared with SetPinGate) for the new PIN.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthLock } from '@/lib/authLock';
import { PIN_LENGTH } from '@/lib/pin';
import { PinPad, PinDots } from '@/components/auth/PinPad';
import { PinCreationFlow } from '@/components/auth/PinCreationFlow';

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

export default function ChangePin() {
  const router = useRouter();
  const tryUnlockPin = useAuthLock((s) => s.tryUnlockPin);
  const sessionSecret = useAuthLock((s) => s.sessionSecret);

  const [confirmed, setConfirmed] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedMs, setLockedMs] = useState(0);

  useEffect(() => {
    if (lockedMs <= 0) return;
    const id = setInterval(() => {
      setLockedMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedMs]);

  const locked = lockedMs > 0;

  const submit = async (value: string) => {
    setBusy(true);
    const res = await tryUnlockPin(value);
    setBusy(false);
    if (res.ok) {
      setConfirmed(true);
      return;
    }
    setPin('');
    setShakeKey((k) => k + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (res.reason === 'locked') {
      setLockedMs(res.remainingMs ?? 0);
      setError('Too many attempts. Try again later.');
    } else if (res.reason === 'wrong_pin') {
      const left = res.attemptsRemaining ?? 0;
      setError(left > 0 ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect PIN.');
    } else if (res.reason === 'invalid_session') {
      setError('Session expired. Please sign in again.');
      router.back();
    }
    // 'force_relogin' is handled by the store (status → unauthenticated), which
    // will unmount this whole modal since AuthGate swaps to LoginGate underneath.
  };

  const onDigit = (d: string) => {
    if (busy || locked || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setError('');
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  if (confirmed && sessionSecret) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <PinCreationFlow
          sessionSecret={sessionSecret}
          title="Create your new PIN"
          offerBiometricEnrollment={false}
          reuseCheckSource="current"
          onCancel={() => router.back()}
          onDone={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-8">
        <Pressable onPress={() => router.back()} className="absolute top-4 right-4 p-2" hitSlop={12}>
          <X size={22} color="#6b7280" />
        </Pressable>
        <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
          <Text className="text-5xl mb-4">🔐</Text>
          <Text className="text-2xl font-black text-on-surface mb-1">Confirm your PIN</Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
            Enter your current PIN to continue
          </Text>

          <PinDots length={PIN_LENGTH} filled={pin.length} shakeKey={shakeKey} />

          <View className="h-6 mt-4">
            {locked ? (
              <Text className="text-sm font-semibold text-destructive">
                Locked — {formatRemaining(lockedMs)}
              </Text>
            ) : error ? (
              <Text className="text-sm font-semibold text-destructive">{error}</Text>
            ) : null}
          </View>

          {busy ? (
            <View className="mt-6 items-center gap-3 py-16">
              <ActivityIndicator color="#1D4ED8" />
            </View>
          ) : (
            <View className="mt-6">
              <PinPad
                onDigit={onDigit}
                onBackspace={() => setPin((p) => p.slice(0, -1))}
                disabled={busy || locked}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
