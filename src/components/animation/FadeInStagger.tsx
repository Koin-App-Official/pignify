import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface FadeInStaggerProps {
  index?: number;
  delayStep?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Replaces repeated MotiView entrance blocks with a staggered Reanimated spring entrance. */
export function FadeInStagger({ index = 0, delayStep = 40, children, style }: FadeInStaggerProps) {
  return (
    <Animated.View entering={FadeInDown.springify().delay(index * delayStep)} style={style}>
      {children}
    </Animated.View>
  );
}
