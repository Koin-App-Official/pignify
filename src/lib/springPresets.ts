import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * Canonical spring configs (guide §5.1/§5.2). Reuse these instead of
 * hand-rolling damping/stiffness per animation so motion feels consistent.
 */
export const springPresets = {
  /** Tap/press feedback — snappy, minimal overshoot. */
  press: { damping: 15, stiffness: 300 } satisfies WithSpringConfig,
  /** Sheet drag-to-dismiss snaps — softer, more travel. */
  sheet: { damping: 20, stiffness: 200 } satisfies WithSpringConfig,
} as const;
