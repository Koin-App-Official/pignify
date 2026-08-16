/**
 * Delete account — pushed as a modal from Settings, only reachable while
 * already unlocked. Re-confirms the current PIN first (same pattern as
 * change-pin.tsx, reusing tryUnlockPin/lockout), then shows an explicit
 * destructive-warning Alert before calling the server-side deletion.
 *
 * Local state is only wiped after the server confirms deletion — an
 * unconfirmed/failed request must never leave the account server-side but
 * the device locally wiped (or vice versa).
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthLock } from '@/lib/authLock';
import { useStore } from '@/lib/store';
import { PIN_LENGTH } from '@/lib/pin';
import { requestAccountDeletion } from '@/lib/billing';
import { PinPad, PinDots } from '@/components/auth/PinPad';
import { Button } from '@/components/ui/button';

function formatRemaining(ms: number, t: TFunction<'auth'>): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return t('duration.seconds', { s });
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return t('duration.minutes', { m, s: rem.toString().padStart(2, '0') });
}

export default function DeleteAccount() {
  const { t } = useTranslation(['settings', 'auth']);
  const router = useRouter();
  const tryUnlockPin = useAuthLock((s) => s.tryUnlockPin);
  const userId = useAuthLock((s) => s.userId);
  const resetLock = useAuthLock((s) => s.resetToLogin);
  const resetForDemo = useStore((s) => s.resetForDemo);

  const [confirmed, setConfirmed] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedMs, setLockedMs] = useState(0);
  const [deleting, setDeleting] = useState(false);

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
  };

  const onDigit = (d: string) => {
    if (busy || locked || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setError('');
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  const confirmDelete = () => {
    Alert.alert(
      t('deleteAccount'),
      t('deleteAccountFlow.confirmAlertBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('deleteAccountFlow.delete'), style: 'destructive', onPress: performDelete },
      ]
    );
  };

  const performDelete = async () => {
    if (!userId) return;
    setDeleting(true);
    const ok = await requestAccountDeletion(userId);
    if (!ok) {
      setDeleting(false);
      Alert.alert(t('deleteAccountFlow.errorTitle'), t('deleteAccountFlow.errorBody'));
      return;
    }
    resetForDemo();
    await resetLock();
    router.replace('/onboarding');
  };

  if (confirmed) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-8">
          <Pressable onPress={() => router.back()} className="absolute top-4 right-4 p-2" hitSlop={12} disabled={deleting}>
            <X size={22} color="#6b7280" />
          </Pressable>
          <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
            <Text className="text-5xl mb-4">⚠️</Text>
            <Text className="text-2xl font-black text-on-surface mb-2 text-center">{t('deleteAccountFlow.warningTitle')}</Text>
            <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
              {t('deleteAccountFlow.warningBody')}
            </Text>
            {deleting ? (
              <View className="items-center gap-3 py-8">
                <ActivityIndicator color="#DC2626" />
                <Text className="text-sm font-medium text-on-surface-variant">{t('deleteAccountFlow.deleting')}</Text>
              </View>
            ) : (
              <Button variant="destructive" size="lg" onPress={confirmDelete} className="w-full">
                <Text className="text-base font-bold text-destructive-foreground">{t('deleteAccount')}</Text>
              </Button>
            )}
          </Animated.View>
        </View>
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
          <Text className="text-2xl font-black text-on-surface mb-1">{t('auth:changePin.confirmTitle')}</Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
            {t('deleteAccountFlow.confirmPinSubtitle')}
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
