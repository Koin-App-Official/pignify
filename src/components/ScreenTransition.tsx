import { useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

interface Props {
  children: React.ReactNode;
}

export function ScreenTransition({ children }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.97);

  useFocusEffect(
    useCallback(() => {
      const config = { duration: 220, easing: Easing.out(Easing.ease) };
      opacity.value = withTiming(1, config);
      scale.value = withTiming(1, config);
      return () => {
        opacity.value = 0;
        scale.value = 0.97;
      };
    }, [])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
