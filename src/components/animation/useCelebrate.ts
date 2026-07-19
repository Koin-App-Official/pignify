import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { RiveRef } from 'rive-react-native';

interface UseCelebrateOptions {
  /** Optional — celebrate() works with the emoji fallback until a mascot asset exists. */
  riveRef?: RefObject<RiveRef | null>;
  stateMachineName?: string;
  triggerInput?: string;
}

/**
 * Orchestrates a celebration moment (guide §5.5): haptic first (perceived
 * latency), then Rive trigger, then a single confettiProgress shared value
 * driving all confetti particles.
 *
 * `active` gates whether the confetti canvas is mounted at all — at rest
 * confettiProgress sits at 0, which computes as fully opaque (opacity =
 * 1 - progress), so an always-mounted SkiaConfetti would show a static
 * cluster of particles at their spawn point. Consumers should render
 * SkiaConfetti only while `active` is true.
 */
export function useCelebrate({
  riveRef,
  stateMachineName = 'CharacterMachine',
  triggerInput = 'celebrate',
}: UseCelebrateOptions = {}) {
  const confettiProgress = useSharedValue(0);
  const [active, setActive] = useState(false);

  const celebrate = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    riveRef?.current?.fireState(stateMachineName, triggerInput);
    setActive(true);
    confettiProgress.value = 0;
    confettiProgress.value = withTiming(1, { duration: 2200 }, (finished) => {
      if (finished) runOnJS(setActive)(false);
    });
  }, [riveRef, stateMachineName, triggerInput]);

  return { confettiProgress, celebrate, active };
}
