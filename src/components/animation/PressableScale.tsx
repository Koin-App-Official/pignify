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
  /** Extra touch area in dp on all sides, forwarded to the gesture and the view. Defaults to 8. */
  hitSlop?: number;
  accessibilityLabel?: string;
}

/**
 * Canonical tap primitive (guide §5.1) — scale-down feedback + selection haptic.
 * The one tap primitive for chips/tabs/list rows; prefer over ad-hoc Pressable + manual scale.
 *
 * `shouldCancelWhenOutside(false)` + `maxDistance` corrects a platform asymmetry in RNGH's
 * TapGestureHandler: Android defaults `shouldCancelWhenOutside` to true (iOS defaults to false),
 * so on Android alone a tiny finger drift during the press silently cancels the tap. `maxDistance`
 * keeps a real scroll/drag gesture correctly failing the tap. `maxDuration` is raised from RNGH's
 * 500ms default so a slower, deliberate press still registers, matching RN Pressable semantics.
 */
export function PressableScale({ onPress, disabled, children, style, hitSlop = 8, accessibilityLabel }: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
  }));

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .hitSlop(hitSlop)
    .shouldCancelWhenOutside(false)
    .maxDistance(16)
    .maxDuration(10000)
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
      <Animated.View
        style={[animatedStyle, style]}
        hitSlop={hitSlop}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
