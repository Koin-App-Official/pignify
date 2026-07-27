import { Easing } from 'react-native-reanimated';
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

/**
 * Canonical spring configs (guide §5.1/§5.2). Reuse these instead of
 * hand-rolling damping/stiffness per animation so motion feels consistent.
 */
export const springPresets = {
  /** Tap/press feedback — snappy, minimal overshoot. */
  press: { damping: 15, stiffness: 300 } satisfies WithSpringConfig,
  /** Sheet drag-to-dismiss snaps — critically damped, no bounce. */
  sheet: { damping: 30, stiffness: 200 } satisfies WithSpringConfig,
} as const;

/**
 * Canonical timing configs (guide §3 rule 3: `withTiming` for non-interruptible,
 * decorative motion — used here for programmatic show/hide, not gesture handoff).
 */
export const timingPresets = {
  /** Modal/sheet open & programmatic close — smooth ease-in-out, no overshoot. */
  sheet: { duration: 280, easing: Easing.inOut(Easing.cubic) } satisfies WithTimingConfig,
} as const;
