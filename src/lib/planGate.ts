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
 * Whether the product *intends* a lapsed trial to block the app (decision D12).
 * Read `lockoutEnforced()` rather than this — the intent alone isn't sufficient.
 */
export const LOCKOUT_INTENDED = true;

/**
 * Whether a lapsed trial actually blocks the app, right now, on this build.
 *
 * Enforcement is deliberately conditional on checkout being reachable. A total
 * lockout (D12) leaves no escape hatch, so if `EXPO_PUBLIC_N8N_BILLING_URL` is
 * missing — as it is in any build that forgot it — every Subscribe tap returns
 * `unavailable` and the user is stuck on a screen whose only action is broken,
 * with no way back into an app they were happily using minutes earlier.
 *
 * Making this structural rather than a second flag someone has to remember to
 * flip means the trap cannot be shipped by omission. The failure direction is
 * chosen on purpose: a misconfigured build lets lapsed users through, which
 * costs revenue, rather than bricking them, which costs the user.
 */
export function lockoutEnforced(billingConfigured: boolean): boolean {
  return LOCKOUT_INTENDED && billingConfigured;
}

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
 * Whether picking `target` should go through checkout, independent of tier
 * ranking. A trialing user is provisioned onto Family — the top tier —
 * regardless of what they'll actually pay for, so ranking `target` against
 * `current` makes every other tier read as a downgrade and hides checkout
 * entirely: the exact bug this exists to prevent. Same reasoning for
 * `expired` — there's no real subscription left to rank against. `active`
 * and `canceled` users have a real paid tier, so ranking still applies:
 * `isUpgradeTarget` is left to the caller (entitlements.ts's `isUpgrade`),
 * since this module stays free of `store.ts`'s value exports so it keeps
 * loading under vitest.
 */
export function canSubscribe(planStatus: PlanStatus, isUpgradeTarget: boolean): boolean {
  if (planStatus === 'trialing' || planStatus === 'expired') return true;
  return isUpgradeTarget;
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
