import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { springPresets } from '@/lib/springPresets';

export type MascotExpression = 'idle' | 'happy' | 'thinking' | 'celebrating';

interface MascotProps {
  expression?: MascotExpression;
  size?: number;
}

const MASCOT_IMAGE = require('../../assets/mascot.png');

/**
 * The Piggy mascot. Currently a single static illustration reused across all
 * expressions — swap MASCOT_IMAGE for per-expression assets (or a Rive/Skia
 * animation) once they exist; the `expression` prop is the seam, so call
 * sites won't need to change.
 */
export function Mascot({ expression = 'idle', size = 48 }: MascotProps) {
  const bounce = useSharedValue(0);
  const celebrateScale = useSharedValue(1);

  useEffect(() => {
    if (expression === 'celebrating') {
      celebrateScale.value = withSequence(
        withSpring(1.25, springPresets.press),
        withSpring(1, springPresets.press)
      );
      return;
    }
    bounce.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [expression, bounce, celebrateScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }, { scale: celebrateScale.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
      <Image
        source={MASCOT_IMAGE}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </Animated.View>
  );
}
