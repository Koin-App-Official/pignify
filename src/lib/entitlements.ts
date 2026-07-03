/**
 * Single source of truth for subscription plans, quotas, and feature entitlements.
 *
 * Scope (vertical slice): plan configuration + pure check helpers consumed by the
 * UI gating layer. This is intentionally a *pure* module — no React, no store, no
 * I/O — so it can later be mirrored/enforced server-side (Appwrite) as the real
 * authority. Today's client checks are UX gating only; do not treat them as the
 * security boundary (see requirements doc, assumption A2 / question Q-authority).
 *
 * Naming note: the enum value `free` is the spec's paid "Beginner" tier. Renaming
 * the persisted enum (`free` -> `beginner`) is a separate migration (question
 * Q-naming) and deliberately out of scope for this slice; we surface the correct
 * label via `displayName` instead.
 *
 * Encryption note (decision K4 = "strong baseline for all"): every tier receives
 * strong encryption of financial data. `exclusiveProtection` represents an
 * *additional* layer for Medium/Family, never the only protection for lower tiers.
 */
import type { UserPlan } from './store';
import { PLAN_RANK } from './store';

export type QuotaValue = number | 'unlimited';

export interface PlanFeatures {
  aiCoach: boolean;
  emailReports: boolean;
  exclusiveProtection: boolean;
  referral: boolean;
  deepAnalysis: boolean;
  goalBonus: boolean;
  loyaltyDiscount: boolean;
}

export interface PlanConfig {
  id: UserPlan;
  displayName: string;
  priceUSD: number;
  /** Per-month quotas; absolute quotas (incomes/goals/devices) are point-in-time. */
  quotas: {
    incomes: QuotaValue;
    goals: QuotaValue;
    devices: QuotaValue;
    aiMessages: QuotaValue;
    emailReports: QuotaValue;
  };
  /** Price of one extra AI message beyond quota, or null if add-ons not offered. */
  extraMessagePriceUSD: number | null;
  /**
   * When true, hitting the (effectively unlimited) email-report cap surfaces a
   * GENERIC error ("Something went wrong") rather than an upgrade prompt — see
   * hard constraint C12. Only Family is soft-limited.
   */
  emailReportsSoftLimited: boolean;
  /** Internal soft cap used only when emailReportsSoftLimited is true. */
  emailReportsSoftCap: number;
  features: PlanFeatures;
  /** Free-trial length in days; 0 means no trial. Only Family offers a trial (C5). */
  trialDays: number;
}

export const PLAN_CONFIG: Record<UserPlan, PlanConfig> = {
  free: {
    id: 'free',
    displayName: 'Beginner',
    priceUSD: 5.99,
    quotas: { incomes: 1, goals: 1, devices: 1, aiMessages: 0, emailReports: 0 },
    extraMessagePriceUSD: null,
    emailReportsSoftLimited: false,
    emailReportsSoftCap: 0,
    features: {
      aiCoach: false,
      emailReports: false,
      exclusiveProtection: false,
      referral: false,
      deepAnalysis: false,
      goalBonus: false,
      loyaltyDiscount: false,
    },
    trialDays: 0,
  },
  medium: {
    id: 'medium',
    displayName: 'Medium',
    priceUSD: 7.99,
    quotas: { incomes: 1, goals: 2, devices: 1, aiMessages: 6, emailReports: 3 },
    extraMessagePriceUSD: 1.99,
    emailReportsSoftLimited: false,
    emailReportsSoftCap: 0,
    features: {
      aiCoach: true,
      emailReports: true,
      exclusiveProtection: true,
      referral: false,
      deepAnalysis: false,
      goalBonus: false,
      loyaltyDiscount: false,
    },
    trialDays: 0,
  },
  family: {
    id: 'family',
    displayName: 'Family',
    priceUSD: 9.99,
    quotas: {
      incomes: 3,
      goals: 'unlimited',
      devices: 'unlimited',
      aiMessages: 20,
      emailReports: 'unlimited',
    },
    extraMessagePriceUSD: 0.99,
    emailReportsSoftLimited: true,
    emailReportsSoftCap: 100,
    features: {
      aiCoach: true,
      emailReports: true,
      exclusiveProtection: true,
      referral: true,
      deepAnalysis: true,
      goalBonus: true,
      loyaltyDiscount: true,
    },
    trialDays: 7,
  },
};

/** Plans in ascending rank order (lowest tier first). */
export const PLAN_ORDER: UserPlan[] = (Object.keys(PLAN_CONFIG) as UserPlan[]).sort(
  (a, b) => PLAN_RANK[a] - PLAN_RANK[b]
);

export function getPlanConfig(plan: UserPlan): PlanConfig {
  return PLAN_CONFIG[plan] ?? PLAN_CONFIG.free;
}

export function isUnlimited(q: QuotaValue): q is 'unlimited' {
  return q === 'unlimited';
}

export function isUpgrade(from: UserPlan, to: UserPlan): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

export function isDowngrade(from: UserPlan, to: UserPlan): boolean {
  return PLAN_RANK[to] < PLAN_RANK[from];
}

export function hasFeature(plan: UserPlan, feature: keyof PlanFeatures): boolean {
  return getPlanConfig(plan).features[feature];
}

export type QuotaResource = keyof PlanConfig['quotas'];

export interface QuotaCheck {
  allowed: boolean;
  unlimited: boolean;
  limit: number | null; // null when unlimited
  used: number;
  remaining: number | null; // null when unlimited
}

/**
 * Evaluate a quota for the given plan and current usage.
 * `allowed` answers: may the user perform ONE more of this action right now?
 */
export function checkQuota(plan: UserPlan, resource: QuotaResource, used: number): QuotaCheck {
  const limit = getPlanConfig(plan).quotas[resource];
  if (isUnlimited(limit)) {
    return { allowed: true, unlimited: true, limit: null, used, remaining: null };
  }
  return {
    allowed: used < limit,
    unlimited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/** Lowest-rank plan satisfying a predicate, or null if none. */
function lowestPlan(pred: (c: PlanConfig) => boolean): UserPlan | null {
  for (const id of PLAN_ORDER) {
    if (pred(PLAN_CONFIG[id])) return id;
  }
  return null;
}

/** Lowest plan that grants a boolean feature. */
export function lowestPlanWithFeature(feature: keyof PlanFeatures): UserPlan | null {
  return lowestPlan((c) => c.features[feature]);
}

/** Lowest plan whose quota for `resource` exceeds the current plan's quota. */
export function lowestPlanWithMoreQuota(
  resource: QuotaResource,
  currentPlan: UserPlan
): UserPlan | null {
  const current = getPlanConfig(currentPlan).quotas[resource];
  return lowestPlan((c) => {
    const q = c.quotas[resource];
    if (isUnlimited(q)) return !isUnlimited(current);
    if (isUnlimited(current)) return false;
    return q > current;
  });
}

// ─── User-facing gate metadata ─────────────────────────────────────────────────
// Drives the "Upgrade your plan" popup. Gated features stay VISIBLE in the UI and
// open this popup when blocked (hard constraint C13) — they are never hidden.

export type GateKey =
  | 'aiCoach'
  | 'aiMessages'
  | 'goals'
  | 'incomes'
  | 'devices'
  | 'emailReports'
  | 'deepAnalysis'
  | 'referral';

export interface GateInfo {
  title: string;
  description: string;
  /** Suggested plan to upgrade to, or null if already on the top plan. */
  requiredPlan: UserPlan | null;
}

export function gateInfo(key: GateKey, currentPlan: UserPlan): GateInfo {
  switch (key) {
    case 'aiCoach':
      return {
        title: 'Unlock the AI Coach',
        description: 'Chat with your personal savings coach by upgrading your plan.',
        requiredPlan: lowestPlanWithFeature('aiCoach'),
      };
    case 'aiMessages':
      return {
        title: "You're out of AI messages",
        description:
          "You've used all of this month's AI messages. Upgrade for a bigger monthly allowance.",
        requiredPlan: lowestPlanWithMoreQuota('aiMessages', currentPlan),
      };
    case 'goals':
      return {
        title: 'Goal limit reached',
        description:
          'Your current plan supports fewer goals. Upgrade to track more savings goals at once.',
        requiredPlan: lowestPlanWithMoreQuota('goals', currentPlan),
      };
    case 'incomes':
      return {
        title: 'Income limit reached',
        description: 'Upgrade to add more income sources to your budget.',
        requiredPlan: lowestPlanWithMoreQuota('incomes', currentPlan),
      };
    case 'devices':
      return {
        title: 'Device limit reached',
        description:
          'This plan allows fewer connected devices. Upgrade to use Piggy on more devices.',
        requiredPlan: lowestPlanWithMoreQuota('devices', currentPlan),
      };
    case 'emailReports':
      return {
        title: 'Email reports are a paid feature',
        description: 'Upgrade your plan to request email reports of your progress.',
        requiredPlan: lowestPlanWithFeature('emailReports'),
      };
    case 'deepAnalysis':
      return {
        title: 'Deep spending analysis',
        description: 'Get advanced insights into your spending with the Family plan.',
        requiredPlan: lowestPlanWithFeature('deepAnalysis'),
      };
    case 'referral':
      return {
        title: 'Referral rewards',
        description: 'Invite friends and earn free months on the Family plan.',
        requiredPlan: lowestPlanWithFeature('referral'),
      };
  }
}

/** Format a USD price for display, e.g. 5.99 -> "$5.99". */
export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Human-readable quota value for plan cards, e.g. 'unlimited' -> "Unlimited". */
export function quotaLabel(q: QuotaValue): string {
  return isUnlimited(q) ? 'Unlimited' : String(q);
}
