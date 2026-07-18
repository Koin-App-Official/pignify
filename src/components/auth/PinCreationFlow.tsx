/**
 * Shared "enter + confirm a new PIN, optionally enroll biometrics" flow, used by
 * first-time PIN setup (SetPinGate) and by PIN changes (change-pin.tsx). Always
 * writes a fresh encrypted session blob via setPin(); if biometrics were already
 * enabled it silently re-enrolls them with the new derived key (the old key is a
 * function of the old PIN and stops decrypting the moment the PIN changes), and
 * only shows the "enable biometrics?" prompt when the caller asks for it (first
 * setup) — a PIN change isn't the moment to upsell a feature the user hasn't
 * opted into yet.
 */
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/button';
import { PIN_LENGTH, setPin, validatePinStrength, isPinReused, type PinReuseSource } from '@/lib/pin';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  getBiometricKind,
  type BiometricKind,
} from '@/lib/biometrics';
import { PinPad, PinDots } from './PinPad';

type Stage = 'enter' | 'confirm' | 'biometric';

interface PinCreationFlowProps {
  /** The (already-authenticated) session secret to encrypt under the new PIN. */
  sessionSecret: string;
  title?: string;
  subtitle?: string;
  /** Show the "enable Face ID?" prompt for a device that never had it on. */
  offerBiometricEnrollment?: boolean;
  /**
   * When set, reject a new PIN identical to the one being replaced: 'current'
   * checks against the still-live blob (Change PIN, before it's overwritten),
   * 'stale' checks against a blob demoted by a forgot-PIN reset. Omit for a
   * genuine first-time setup, where there's nothing to compare against.
   */
  reuseCheckSource?: PinReuseSource;
  /**
   * Show a cancel (X) button during entry/confirm. Only safe to pass when
   * nothing has been committed yet if the user backs out — e.g. Change PIN,
   * where the old PIN is still live until setPin() succeeds. Omit for
   * first-time/forgot-PIN setup, where PIN creation is mandatory to finish
   * logging in and there's no valid "cancelled" state to return to.
   */
  onCancel?: () => void;
  onDone: () => void | Promise<void>;
}

export function PinCreationFlow({
  sessionSecret,
  title = 'Create your PIN',
  subtitle = 'Choose a 6-digit PIN to lock the app on this device',
  offerBiometricEnrollment = true,
  reuseCheckSource,
  onCancel,
  onDone,
}: PinCreationFlowProps) {
  const [stage, setStage] = useState<Stage>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [derivedKey, setDerivedKey] = useState<Uint8Array | null>(null);
  const [bioKind, setBioKind] = useState<BiometricKind>('none');

  const fail = (msg: string) => {
    setError(msg);
    setShakeKey((k) => k + 1);
    setPinValue('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const finish = async (key: Uint8Array) => {
    if (await isBiometricEnabled()) {
      await enableBiometric(key).catch(() => false);
      await onDone();
      return;
    }
    if (offerBiometricEnrollment && (await isBiometricAvailable())) {
      setDerivedKey(key);
      setBioKind(await getBiometricKind());
      setStage('biometric');
      setBusy(false);
      return;
    }
    await onDone();
  };

  const handleComplete = async (value: string) => {
    if (stage === 'enter') {
      const weak = validatePinStrength(value);
      if (weak) return fail(weak);
      if (reuseCheckSource) {
        setBusy(true);
        const reused = await isPinReused(value, reuseCheckSource);
        setBusy(false);
        if (reused) return fail('Choose a PIN different from your previous one.');
      }
      setFirst(value);
      setPinValue('');
      setError('');
      setStage('confirm');
      return;
    }

    // confirm
    if (value !== first) {
      setFirst('');
      setStage('enter');
      return fail("PINs didn't match. Start again.");
    }

    setBusy(true);
    try {
      const key = await setPin(value, sessionSecret);
      await finish(key);
    } catch {
      setBusy(false);
      fail('Could not save PIN. Please try again.');
    }
  };

  const onDigit = (d: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setError('');
    setPinValue(next);
    if (next.length === PIN_LENGTH) handleComplete(next);
  };

  const enrollBiometric = async () => {
    if (!derivedKey) return;
    setBusy(true);
    await enableBiometric(derivedKey).catch(() => false);
    setBusy(false);
    await onDone();
  };

  const skipBiometric = async () => {
    setBusy(true);
    await onDone();
  };

  if (stage === 'biometric') {
    const label = bioKind === 'face' ? 'Face ID' : 'biometrics';
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
          <Text className="text-5xl mb-4">🔐</Text>
          <Text className="text-2xl font-black text-on-surface mb-2 text-center">
            Unlock faster with {label}?
          </Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">
            You can always use your PIN instead.
          </Text>
          <Button onPress={enrollBiometric} disabled={busy} className="w-full h-14 mb-3">
            <Text className="text-base font-bold text-primary-foreground">Enable {label}</Text>
          </Button>
          <Button variant="ghost" onPress={skipBiometric} disabled={busy} className="w-full">
            <Text className="text-base font-bold text-primary">Not now</Text>
          </Button>
        </Animated.View>
      </View>
    );
  }

  const stageTitle = stage === 'enter' ? title : 'Confirm your PIN';
  const stageSubtitle = stage === 'enter' ? subtitle : 'Enter your PIN again to confirm';

  return (
    <View className="flex-1 items-center justify-center px-8">
      {onCancel && (
        <Pressable onPress={onCancel} className="absolute top-4 right-4 p-2" hitSlop={12} disabled={busy}>
          <X size={22} color="#6b7280" />
        </Pressable>
      )}
      <Animated.View entering={FadeInDown.springify()} className="w-full items-center">
        <Text className="text-5xl mb-4">🐷</Text>
        <Text className="text-2xl font-black text-on-surface mb-1">{stageTitle}</Text>
        <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">{stageSubtitle}</Text>

        <PinDots length={PIN_LENGTH} filled={pin.length} shakeKey={shakeKey} />
        <View className="h-6 mt-4">
          {error ? <Text className="text-sm font-semibold text-destructive">{error}</Text> : null}
        </View>

        {busy ? (
          <View className="mt-6 items-center gap-3">
            <ActivityIndicator color="#1D4ED8" />
            <Text className="text-sm font-medium text-on-surface-variant">
              {stage === 'enter' ? 'Checking…' : 'Securing your PIN…'}
            </Text>
          </View>
        ) : (
          <View className="mt-6">
            <PinPad onDigit={onDigit} onBackspace={() => setPinValue((p) => p.slice(0, -1))} disabled={busy} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}
