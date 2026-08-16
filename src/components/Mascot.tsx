import { useEffect } from 'react';
import { Image } from 'expo-image';
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

const DEFAULT_MASCOT_IMAGE = require('../../assets/mascot.png');

/**
 * Per-expression illustrations. Expressions without an entry here fall back
 * to DEFAULT_MASCOT_IMAGE (the waving pose) — this is the seam the file
 * header used to describe as aspirational; fill in the rest here as they're
 * drawn, no call site needs to change either way.
 */
const EXPRESSION_IMAGES: Partial<Record<MascotExpression, ReturnType<typeof require>>> = {
  celebrating: require('../../assets/mascot-celebrating.png'),
};

/**
 * The Piggy mascot. `expression` picks a per-expression illustration when one
 * exists (see EXPRESSION_IMAGES), falling back to the default waving pose.
 */
export function Mascot({ expression = 'idle', size = 48 }: MascotProps) {
  const mascotImage = EXPRESSION_IMAGES[expression] ?? DEFAULT_MASCOT_IMAGE;
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
        source={mascotImage}
        contentFit="contain"
        cachePolicy="memory-disk"
        style={{ width: size, height: size }}
      />
    </Animated.View>
  );
}
