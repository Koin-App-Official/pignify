/**
 * Reusable numeric PIN keypad + dot indicator, shared by the lock and set-PIN
 * screens. Emits digits/backspace; the parent owns the value. Includes haptics
 * and a shake animation hook for wrong-PIN feedback.
 */
import { View, Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { Delete, FingerprintPattern as Fingerprint, ScanFace } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { BiometricKind } from '@/lib/biometrics';

export function PinDots({
  length,
  filled,
  shakeKey,
}: {
  length: number;
  filled: number;
  /** Increment to trigger a shake (e.g. on wrong PIN). */
  shakeKey?: number;
}) {
  const tx = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey) return;
    tx.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-7, { duration: 50 }),
      withTiming(7, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  }, [shakeKey, tx]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <Animated.View className="flex-row justify-center gap-4" style={style}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          className={`h-4 w-4 rounded-full ${
            i < filled ? 'bg-primary' : 'bg-surface-container border border-outline'
          }`}
        />
      ))}
    </Animated.View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({
  onDigit,
  onBackspace,
  onBiometric,
  biometricKind = 'none',
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  /** When provided, the bottom-left slot becomes a biometric trigger. */
  onBiometric?: () => void;
  biometricKind?: BiometricKind;
  disabled?: boolean;
}) {
  const press = (fn: () => void) => () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  const BiometricIcon = biometricKind === 'face' ? ScanFace : Fingerprint;

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap justify-center" style={{ gap: 20 }}>
        {KEYS.map((k) => (
          <Key key={k} onPress={press(() => onDigit(k))} disabled={disabled}>
            <Text className="text-3xl font-semibold text-on-surface">{k}</Text>
          </Key>
        ))}

        {/* bottom-left: biometric or empty */}
        {onBiometric && biometricKind !== 'none' ? (
          <Key onPress={press(onBiometric)} disabled={disabled} subtle>
            <BiometricIcon size={28} color="#1D4ED8" />
          </Key>
        ) : (
          <View style={{ width: 76, height: 76 }} />
        )}

        <Key onPress={press(() => onDigit('0'))} disabled={disabled}>
          <Text className="text-3xl font-semibold text-on-surface">0</Text>
        </Key>

        <Key onPress={press(onBackspace)} disabled={disabled} subtle>
          <Delete size={26} color="#64748B" />
        </Key>
      </View>
    </View>
  );
}

function Key({
  children,
  onPress,
  disabled,
  subtle,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ width: 76, height: 76 }}
      className={`items-center justify-center rounded-full ${
        subtle ? '' : 'bg-surface-container-low'
      } active:bg-surface-container ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </Pressable>
  );
}
