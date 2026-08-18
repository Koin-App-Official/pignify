import { Easing } from 'react-native-reanimated';
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

/**
 * Canonical spring configs (guide §5.1/§5.2). Reuse these instead of
 * hand-rolling damping/stiffness per animation so motion feels consistent.
 */
export const springPresets = {
  /** Tap/press feedback — snappy, minimal overshoot. */
  press: { damping: 15, stiffness: 300 } satisfies WithSpringConfig,
  /**
   * Sheet drag-to-dismiss snaps. Overdamped AND overshoot-clamped, so a fast
   * flick (which passes its velocity into the spring) can never carry the sheet
   * past its target and oscillate back — the snap only ever settles inward.
   */
  sheet: {
    damping: 30,
    stiffness: 200,
    overshootClamping: true,
  } satisfies WithSpringConfig,
  /** Staggered list/card entrance replay — mirrors FadeInDown's default feel. */
  entrance: { damping: 16, stiffness: 160 } satisfies WithSpringConfig,
} as const;

/**
 * Canonical timing configs (guide §3 rule 3: `withTiming` for non-interruptible,
 * decorative motion — used here for programmatic show/hide, not gesture handoff).
 */
export const timingPresets = {
  /** Modal/sheet open & programmatic close — smooth ease-in-out, no overshoot. */
  sheet: { duration: 280, easing: Easing.inOut(Easing.cubic) } satisfies WithTimingConfig,
  /** Segmented-control pill slide — quick ease-out, no overshoot. */
  segment: { duration: 200, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
} as const;
