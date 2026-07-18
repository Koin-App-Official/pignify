import { useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { springPresets } from '@/lib/springPresets';

interface Props {
  children: React.ReactNode;
}

export function ScreenTransition({ children }: Props) {
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      progress.value = withSpring(1, springPresets.sheet);
      return () => {
        progress.value = 0;
      };
    }, [])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.97, 1]) }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
