import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface AnimatedProgressBarProps {
  /** 0–1 */
  progress: number;
  height?: number;
  color?: string;
  trackStyle?: StyleProp<ViewStyle>;
  duration?: number;
}

/**
 * Progress bar driven by transform: scaleX (guide rule 2) instead of animated
 * `width`, which would force a layout re-measure every frame.
 */
export function AnimatedProgressBar({
  progress,
  height = 8,
  color = '#22C55E',
  trackStyle,
  duration = 500,
}: AnimatedProgressBarProps) {
  const value = useSharedValue(progress);

  useEffect(() => {
    value.value = withTiming(progress, { duration, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.0001, value.value) }],
  }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, trackStyle]}>
      <Animated.View
        style={[
          styles.fill,
          { height, borderRadius: height / 2, backgroundColor: color, transformOrigin: 'left' },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.08)' },
  fill: { width: '100%' },
});
