import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Returns a key that increments every time the screen gains focus.
 * Apply it to a content wrapper inside ScrollView to force all `entering`-animated
 * children (e.g. FadeInStagger) to remount and replay their entrance on each visit.
 */
export function useFocusKey() {
  const [key, setKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setKey((k) => k + 1);
    }, [])
  );
  return key;
}
