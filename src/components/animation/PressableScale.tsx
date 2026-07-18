import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { springPresets } from '@/lib/springPresets';

interface PressableScaleProps {
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Canonical tap primitive (guide §5.1) — scale-down feedback + selection haptic.
 * The one tap primitive for chips/tabs/list rows; prefer over ad-hoc Pressable + manual scale.
 */
export function PressableScale({ onPress, disabled, children, style }: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
  }));

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      pressed.value = withSpring(1, springPresets.press);
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, springPresets.press);
    })
    .onEnd(() => {
      runOnJS(Haptics.selectionAsync)();
      if (onPress) runOnJS(onPress)();
    });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
