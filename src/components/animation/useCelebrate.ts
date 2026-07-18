import { useCallback } from 'react';
import type { RefObject } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';
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
 */
export function useCelebrate({
  riveRef,
  stateMachineName = 'CharacterMachine',
  triggerInput = 'celebrate',
}: UseCelebrateOptions = {}) {
  const confettiProgress = useSharedValue(0);

  const celebrate = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    riveRef?.current?.fireState(stateMachineName, triggerInput);
    confettiProgress.value = 0;
    confettiProgress.value = withTiming(1, { duration: 2200 });
  }, [riveRef, stateMachineName, triggerInput]);

  return { confettiProgress, celebrate };
}
