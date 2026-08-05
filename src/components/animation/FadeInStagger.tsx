import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { springPresets } from '@/lib/springPresets';

interface FadeInStaggerProps {
  index?: number;
  delayStep?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Optional replay trigger from useFocusReplay(). When provided, the
   * entrance animation replays on every increment WITHOUT remounting the
   * subtree (unlike Reanimated's mount-only `entering` prop, used when this
   * is omitted). Pass the same shared value to every FadeInStagger on a
   * screen that should replay its entrance on each tab focus.
   */
  replay?: SharedValue<number>;
}

/** Replaces repeated MotiView entrance blocks with a staggered Reanimated spring entrance. */
export function FadeInStagger({ index = 0, delayStep = 40, children, style, replay }: FadeInStaggerProps) {
  if (!replay) {
    return (
      <Animated.View entering={FadeInDown.springify().delay(index * delayStep)} style={style}>
        {children}
      </Animated.View>
    );
  }

  return (
    <ReplayableFadeIn index={index} delayStep={delayStep} replay={replay} style={style}>
      {children}
    </ReplayableFadeIn>
  );
}

function ReplayableFadeIn({
  index,
  delayStep,
  replay,
  style,
  children,
}: {
  index: number;
  delayStep: number;
  replay: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const progress = useSharedValue(0);

  // Initial mount — mirrors the mount-only `entering` behaviour.
  useEffect(() => {
    progress.value = withDelay(index * delayStep, withSpring(1, springPresets.entrance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every subsequent focus — replays without remounting.
  useAnimatedReaction(
    () => replay.value,
    (current, previous) => {
      if (previous === null || current === previous) return;
      progress.value = 0;
      progress.value = withDelay(index * delayStep, withSpring(1, springPresets.entrance));
    },
    [index, delayStep]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 20 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
