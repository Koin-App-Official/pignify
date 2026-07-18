/**
 * Lock screen — shown when a session exists on this device but is locked. Unlocks
 * via biometric (auto-attempted once on mount) or 6-digit PIN. Enforces the
 * escalating lockout and routes to re-login on "Forgot PIN" or lockout exhaustion.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthLock } from '@/lib/authLock';
import { PIN_LENGTH } from '@/lib/pin';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricKind,
  type BiometricKind,
} from '@/lib/biometrics';
import { hasInternetConnection } from '@/lib/network';
import { PinPad, PinDots } from './PinPad';

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

export function LockGate() {
  const tryUnlockPin = useAuthLock((s) => s.tryUnlockPin);
  const tryUnlockBiometric = useAuthLock((s) => s.tryUnlockBiometric);
  const resetToLogin = useAuthLock((s) => s.resetToLogin);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedMs, setLockedMs] = useState(0);
  const [bioKind, setBioKind] = useState<BiometricKind>('none');
  const [bioEnabled, setBioEnabled] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const triedBio = useRef(false);

  // Discover biometric state + auto-attempt once.
  useEffect(() => {
    (async () => {
      const [available, enabled, kind] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
        getBiometricKind(),
      ]);
      const usable = available && enabled;
      setBioEnabled(usable);
      setBioKind(kind);
      if (usable && !triedBio.current) {
        triedBio.current = true;
        await tryUnlockBiometric(); // success flips status away from this screen
      }
    })();
  }, [tryUnlockBiometric]);

  // Tick down an active lockout.
  useEffect(() => {
    if (lockedMs <= 0) return;
    const id = setInterval(() => {
      setLockedMs((ms) => {
        const next = ms - 1000;
        if (next <= 0) {
          setError('');
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockedMs]);

  const locked = lockedMs > 0;

  const submit = async (value: string) => {
    setBusy(true);
    const res = await tryUnlockPin(value);
    setBusy(false);
    if (res.ok) return; // status flips, screen unmounts
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
    }
    // 'force_relogin' is handled by the store (status → unauthenticated)
  };

  const onDigit = (d: string) => {
    if (busy || locked || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setError('');
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  const handleForgotPin = () => {
    Alert.alert(
      'Forgot your PIN?',
      "You'll need to verify your email again to set a new PIN. Your saved goals and data are safe — nothing will be lost.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            setForgotBusy(true);
            // resetToLogin() wipes the local PIN immediately — check connectivity
            // first so a fresh email OTP can actually be requested right after,
            // rather than stranding the user PIN-less with no way to re-verify.
            const online = await hasInternetConnection();
            if (!online) {
              setForgotBusy(false);
              Alert.alert('No Internet Connection', 'Please check your connection and try again.');
              return;
            }
            await resetToLogin();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
          <Text className="text-5xl mb-4">🐷</Text>
          <Text className="text-2xl font-black text-on-surface mb-1">Enter your PIN</Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
            Unlock Piggy to continue
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
              <Text className="text-sm font-medium text-on-surface-variant">Unlocking…</Text>
            </View>
          ) : (
            <View className="mt-6">
              <PinPad
                onDigit={onDigit}
                onBackspace={() => setPin((p) => p.slice(0, -1))}
                onBiometric={bioEnabled ? tryUnlockBiometric : undefined}
                biometricKind={bioKind}
                disabled={busy || locked}
              />
            </View>
          )}

          <Pressable onPress={handleForgotPin} className="mt-8 py-2" disabled={busy || forgotBusy}>
            <Text className="text-sm font-semibold text-primary underline">
              {forgotBusy ? 'Checking connection…' : 'Forgot PIN?'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
