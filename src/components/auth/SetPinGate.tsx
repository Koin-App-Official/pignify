/**
 * Set-PIN screen — shown after a fresh login (needs_pin_setup). Enter + confirm a
 * 6-digit PIN (rejecting trivial ones), encrypt the in-memory session secret
 * under it, then optionally enroll biometrics. Used for first setup and after a
 * forgot-PIN reset (same flow, since reset returns the user to login → set PIN).
 */
import { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { useAuthLock } from '@/lib/authLock';
import { Button } from '@/components/ui/button';
import { PIN_LENGTH, setPin, validatePinStrength } from '@/lib/pin';
import {
  isBiometricAvailable,
  enableBiometric,
  getBiometricKind,
  type BiometricKind,
} from '@/lib/biometrics';
import { PinPad, PinDots } from './PinPad';

type Stage = 'enter' | 'confirm' | 'biometric';

export function SetPinGate() {
  const sessionSecret = useAuthLock((s) => s.sessionSecret);
  const onPinConfigured = useAuthLock((s) => s.onPinConfigured);

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
  };

  const handleComplete = async (value: string) => {
    if (stage === 'enter') {
      const weak = validatePinStrength(value);
      if (weak) return fail(weak);
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
    if (!sessionSecret) return fail('Session missing. Please sign in again.');

    setBusy(true);
    try {
      const key = await setPin(value, sessionSecret);
      const available = await isBiometricAvailable();
      if (available) {
        setDerivedKey(key);
        setBioKind(await getBiometricKind());
        setStage('biometric');
        setBusy(false);
        return;
      }
      await onPinConfigured(); // unlocks
    } catch {
      setBusy(false);
      return fail('Could not save PIN. Please try again.');
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
    await onPinConfigured();
  };

  const skipBiometric = async () => {
    setBusy(true);
    await onPinConfigured();
  };

  if (stage === 'biometric') {
    const label = bioKind === 'face' ? 'Face ID' : 'biometrics';
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-8">
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} className="w-full items-center">
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
          </MotiView>
        </View>
      </SafeAreaView>
    );
  }

  const title = stage === 'enter' ? 'Create your PIN' : 'Confirm your PIN';
  const subtitle =
    stage === 'enter'
      ? 'Choose a 6-digit PIN to lock the app on this device'
      : 'Enter your PIN again to confirm';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-8">
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} className="w-full items-center">
          <Text className="text-5xl mb-4">🐷</Text>
          <Text className="text-2xl font-black text-on-surface mb-1">{title}</Text>
          <Text className="text-sm font-medium text-on-surface-variant mb-10 text-center">{subtitle}</Text>

          <PinDots length={PIN_LENGTH} filled={pin.length} shakeKey={shakeKey} />
          <View className="h-6 mt-4">
            {error ? <Text className="text-sm font-semibold text-destructive">{error}</Text> : null}
          </View>

          <View className="mt-6">
            <PinPad onDigit={onDigit} onBackspace={() => setPinValue((p) => p.slice(0, -1))} disabled={busy} />
          </View>
        </MotiView>
      </View>
    </SafeAreaView>
  );
}
