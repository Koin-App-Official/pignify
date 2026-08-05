import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Shared-value counter bumped every time the screen regains focus. Pass to
 * FadeInStagger's `replay` prop to replay entrance animations on each visit
 * WITHOUT remounting the screen's subtree — unlike a `key`-remount approach,
 * this keeps FlatLists, carousels, and any other in-flight state mounted and
 * intact across tab revisits, only re-triggering the decorative entrance.
 */
export function useFocusReplay(): SharedValue<number> {
  const epoch = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      epoch.value += 1;
    }, [epoch])
  );
  return epoch;
}
