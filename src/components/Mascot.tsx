import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
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
  const celebrateScale = useSharedValue(1);

  useEffect(() => {
    if (expression === 'celebrating') {
      celebrateScale.value = withSequence(
        withSpring(1.25, springPresets.press),
        withSpring(1, springPresets.press)
      );
    }
  }, [expression, celebrateScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrateScale.value }],
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
