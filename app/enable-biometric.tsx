/**
 * Enable biometric unlock — pushed from Settings when the user opts back in
 * after having declined it during PIN setup. Re-confirms the current PIN
 * (same lockout as LockGate/change-pin, via tryUnlockPin) to obtain the
 * PIN-derived key, then stores it behind the biometric gate.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthLock } from '@/lib/authLock';
import { PIN_LENGTH } from '@/lib/pin';
import { enableBiometric } from '@/lib/biometrics';
import { PinPad, PinDots } from '@/components/auth/PinPad';

function formatRemaining(ms: number, t: TFunction<'auth'>): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return t('duration.seconds', { s });
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return t('duration.minutes', { m, s: rem.toString().padStart(2, '0') });
}

export default function EnableBiometric() {
  const { t } = useTranslation(['settings', 'auth']);
  const router = useRouter();
  const tryUnlockPin = useAuthLock((s) => s.tryUnlockPin);

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
    if (res.ok) {
      // tryUnlockPin already re-applied the session; enrolling is best-effort —
      // a declined/failed native prompt here just leaves biometrics off.
      const enrolled = res.key ? await enableBiometric(res.key).catch(() => false) : false;
      setBusy(false);
      if (!enrolled) {
        setPin('');
        setShakeKey((k) => k + 1);
        setError(t('enableBiometricFlow.enrollFailed'));
        return;
      }
      router.back();
      return;
    }
    setBusy(false);
    setPin('');
    setShakeKey((k) => k + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (res.reason === 'locked') {
      setLockedMs(res.remainingMs ?? 0);
      setError(t('auth:errors.tooManyAttempts'));
    } else if (res.reason === 'wrong_pin') {
      const left = res.attemptsRemaining ?? 0;
      setError(left > 0 ? t('auth:errors.incorrectPinWithAttempts', { count: left }) : t('auth:errors.incorrectPin'));
    } else if (res.reason === 'invalid_session') {
      setError(t('auth:errors.sessionExpired'));
      router.back();
    } else if (res.reason === 'network_error') {
      setError(t('auth:errors.networkError'));
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

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-8">
        <Pressable onPress={() => router.back()} className="absolute top-4 right-4 p-2" hitSlop={12}>
          <X size={22} color="#6b7280" />
        </Pressable>
        <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
          <Text className="text-5xl mb-4">🔐</Text>
          <Text className="text-2xl font-black text-on-surface mb-1">{t('auth:changePin.confirmTitle')}</Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
            {t('enableBiometricFlow.confirmPinSubtitle')}
          </Text>

          <PinDots length={PIN_LENGTH} filled={pin.length} shakeKey={shakeKey} />

          <View className="h-6 mt-4">
            {locked ? (
              <Text className="text-sm font-semibold text-destructive">
                {t('auth:lockedFor', { duration: formatRemaining(lockedMs, t) })}
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
