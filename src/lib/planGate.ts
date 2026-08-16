/**
 * Decides whether the app should interrupt the user with the plan gate, and
 * what it should say. Pure and dependency-free on purpose: `store.ts` can't be
 * imported under vitest (it transitively pulls in react-native), so anything
 * worth testing lives outside it — same rationale as goalMath.ts, deposits.ts
 * and storeMigrations.ts.
 */
import type { PlanStatus } from './store';

export type PlanGateReason =
  /** First run after onboarding: tell the user a trial started and what it includes. */
  | 'trial_intro'
  /** The trial lapsed (or a subscription was cancelled) and entitlements are zeroed. */
  | 'locked';

/**
 * Whether a lapsed trial actually blocks the app.
 *
 * FALSE until there is a payment rail (plan issue H). Enforcing a lockout with
 * nothing to convert to would be a screen with no way out — the user would be
 * told to subscribe and given no means of doing so. The gate still *shows*, so
 * the lapse is never silent; it just isn't a dead end.
 *
 * Flip to true in the same change that ships checkout. Nobody can reach this
 * state before 14 days after the first signup, so there is time.
 */
export const LOCKOUT_ENFORCED = false;

export interface PlanGateInput {
  planStatus: PlanStatus;
  /** Set once the user has acknowledged the trial intro. */
  trialIntroSeen: boolean;
  /** False before onboarding finishes — the gate must never pre-empt onboarding. */
  onboardingCompleted: boolean;
}

/**
 * `null` means "no interruption". `locked` outranks `trial_intro`: a user whose
 * trial already lapsed should be told that, not welcomed to a trial they no
 * longer have.
 */
export function planGateReason(input: PlanGateInput): PlanGateReason | null {
  if (!input.onboardingCompleted) return null;
  if (input.planStatus === 'expired' || input.planStatus === 'canceled') return 'locked';
  if (input.planStatus === 'trialing' && !input.trialIntroSeen) return 'trial_intro';
  return null;
}

/**
 * The lapsed check runs on every transition to unlocked, so a trial that ends
 * mid-week is caught on the next unlock rather than only at login. The intro is
 * deliberately excluded: it belongs to the onboarding hand-off, and surfacing it
 * on an ordinary unlock days later would be baffling.
 */
export function planGateReasonOnUnlock(input: PlanGateInput): PlanGateReason | null {
  const reason = planGateReason(input);
  return reason === 'locked' ? reason : null;
}

/**
 * Whole days left, rounded up so a trial ending in six hours reads "1 day left"
 * rather than "0". Returns 0 once the end has passed, and null when there's no
 * trial or the stored value isn't a usable date.
 */
export function trialDaysRemaining(
  trialEndsAt: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
