/**
 * Subscription state machine + entitlement resolver (pure, shared logic).
 *
 * This is the authoritative twin consumed by BOTH the Appwrite "entitlement
 * resolver" function (server, source of truth) and the React Native client
 * (optimistic mirror). Keeping it pure and dependency-free lets the same code run
 * in a Function runtime and in the app. See architecture doc §3 and §4.
 *
 * Decisions baked in:
 *  - Cancellation end-state = FULL LOCKOUT (status `canceled` zeroes all
 *    entitlements and sets `locked`).
 *  - Loyalty discount applies only while `active` (lost on cancel/restart).
 */
import {
  getPlanConfig,
  isUnlimited,
  type PlanConfig,
  type QuotaValue,
  type PlanFeatures,
} from './entitlements';
import type { UserPlan } from './store';

export const RESOLVER_VERSION = 1;

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancel_scheduled'
  | 'canceled'
  | 'incomplete';

/**
 * Internal lifecycle events. The billing phase maps Stripe webhook events onto
 * these; this module only defines the abstract transitions (architecture doc §4).
 */
export type LifecycleEvent =
  | 'start_trial'
  | 'activate'
  | 'payment_failed'
  | 'payment_recovered'
  | 'request_cancel'
  | 'period_ended'
  | 'resume'
  | 'mark_incomplete';

/** Statuses that retain access to plan features (lockout = everything else). */
const ENTITLED_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due', // grace during dunning
  'cancel_scheduled', // still paid until period end (C3)
];

export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTITLED_STATUSES.includes(status);
}

/**
 * Deterministic transition table. Returns the next status, or the current status
 * if the event is not valid from the current state (caller may treat as no-op).
 */
export function nextStatus(current: SubscriptionStatus, event: LifecycleEvent): SubscriptionStatus {
  switch (event) {
    case 'start_trial':
      return current === 'incomplete' || current === 'canceled' ? 'trialing' : current;
    case 'activate':
      return current === 'trialing' || current === 'incomplete' || current === 'past_due'
        ? 'active'
        : current;
    case 'payment_failed':
      return current === 'active' || current === 'trialing' ? 'past_due' : current;
    case 'payment_recovered':
      return current === 'past_due' ? 'active' : current;
    case 'request_cancel':
      return current === 'active' || current === 'trialing' || current === 'past_due'
        ? 'cancel_scheduled'
        : current;
    case 'period_ended':
      // Cancel takes effect; full lockout.
      return current === 'cancel_scheduled' || current === 'past_due' ? 'canceled' : current;
    case 'resume':
      return current === 'cancel_scheduled' || current === 'canceled' ? 'active' : current;
    case 'mark_incomplete':
      return 'incomplete';
    default:
      return current;
  }
}

// ─── Entitlement resolution ─────────────────────────────────────────────────

export interface ResolverInput {
  planId: UserPlan;
  status: SubscriptionStatus;
  pendingPlanId?: UserPlan | null;
  currentPeriodEnd?: string | null;
  /** Loyalty discount currently active (already validated against tenure + status). */
  loyaltyActive?: boolean;
  /** Extra AI messages purchased & confirmed for the current period. */
  addonAllowance?: number;
}

export interface EntitlementSnapshot {
  effectivePlanId: UserPlan;
  status: SubscriptionStatus;
  quotas: PlanConfig['quotas'];
  features: PlanFeatures;
  deviceLimit: QuotaValue;
  discountActive: boolean;
  discountPercent: number;
  pendingPlanId: UserPlan | null;
  currentPeriodEnd: string | null;
  locked: boolean;
  resolverVersion: number;
}

const ZERO_QUOTAS: PlanConfig['quotas'] = {
  incomes: 0,
  goals: 0,
  devices: 0,
  aiMessages: 0,
  emailReports: 0,
};

const NO_FEATURES: PlanFeatures = {
  aiCoach: false,
  emailReports: false,
  exclusiveProtection: false,
  referral: false,
  deepAnalysis: false,
  goalBonus: false,
  loyaltyDiscount: false,
};

/**
 * Resolve effective entitlements from subscription state. Pure: same input →
 * same output. The server persists the result to the `entitlements` collection;
 * the client computes it locally for instant, optimistic gating.
 */
export function resolveEntitlements(input: ResolverInput): EntitlementSnapshot {
  const {
    planId,
    status,
    pendingPlanId = null,
    currentPeriodEnd = null,
    loyaltyActive = false,
    addonAllowance = 0,
  } = input;

  const plan = getPlanConfig(planId);
  const locked = !isEntitled(status);

  if (locked) {
    // Full lockout: data is retained elsewhere but every entitlement is revoked.
    return {
      effectivePlanId: planId,
      status,
      quotas: { ...ZERO_QUOTAS },
      features: { ...NO_FEATURES },
      deviceLimit: 0,
      discountActive: false,
      discountPercent: 0,
      pendingPlanId,
      currentPeriodEnd,
      locked: true,
      resolverVersion: RESOLVER_VERSION,
    };
  }

  // AI message allowance = plan quota + confirmed add-ons (unless unlimited).
  const aiQuota: QuotaValue = isUnlimited(plan.quotas.aiMessages)
    ? 'unlimited'
    : plan.quotas.aiMessages + Math.max(0, addonAllowance);

  const discountActive = loyaltyActive && status === 'active' && plan.features.loyaltyDiscount;

  return {
    effectivePlanId: planId,
    status,
    quotas: { ...plan.quotas, aiMessages: aiQuota },
    features: { ...plan.features },
    deviceLimit: plan.quotas.devices,
    discountActive,
    discountPercent: discountActive ? 10 : 0,
    pendingPlanId,
    currentPeriodEnd,
    locked: false,
    resolverVersion: RESOLVER_VERSION,
  };
}
