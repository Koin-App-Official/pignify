/**
 * Single source of truth for subscription plans, quotas, and feature entitlements.
 *
 * Scope (vertical slice): plan configuration + pure check helpers consumed by the
 * UI gating layer. This is intentionally a *pure* module — no React, no store, no
 * I/O — so it can later be mirrored/enforced server-side (Appwrite) as the real
 * authority. Today's client checks are UX gating only; do not treat them as the
 * security boundary (see requirements doc, assumption A2 / question Q-authority).
 *
 * Naming note: the entry tier is `beginner` on both client and server as of #83.
 * It was `free` on the client only, which was actively misleading for a $5.99
 * tier and never matched the backend's `effective_plan_id`.
 *
 * Encryption note (decision K4 = "strong baseline for all"): every tier receives
 * strong encryption of financial data. `exclusiveProtection` represents an
 * *additional* layer for Medium/Family, never the only protection for lower tiers.
 */
import type { TFunction } from 'i18next';
import type { UserPlan } from './store';

/**
 * Ascending tier rank. Used to decide upgrade (immediate) vs downgrade
 * (next-cycle) transitions. Lives here (not store.ts) so this stays a true leaf
 * module with zero runtime dependency on the store — `import type { UserPlan }`
 * above is erased at compile time, so nothing here pulls in react-native, which
 * is what lets entitlements.ts (and retention.ts/quota.ts/subscription.ts,
 * which import it) load under vitest. store.ts imports this constant, not the
 * other way around.
 */
export const PLAN_RANK: Record<UserPlan, number> = {
  beginner: 0,
  medium: 1,
  family: 2,
};

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
    deepAnalysis: QuotaValue;
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
  /**
   * Free-trial length in days. Every tier now gets the same 14-day no-card
   * trial (decision D1); the trial itself is granted server-side by
   * CLAUDE_onboarding, so this is descriptive copy, not the authority.
   */
  trialDays: number;
}

export const PLAN_CONFIG: Record<UserPlan, PlanConfig> = {
  beginner: {
    id: 'beginner',
    displayName: 'Beginner',
    priceUSD: 5.99,
    quotas: { incomes: 1, goals: 1, devices: 1, aiMessages: 0, emailReports: 0, deepAnalysis: 0 },
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
    trialDays: 14,
  },
  medium: {
    id: 'medium',
    displayName: 'Medium',
    priceUSD: 7.99,
    quotas: { incomes: 1, goals: 2, devices: 1, aiMessages: 10, emailReports: 3, deepAnalysis: 6 },
    extraMessagePriceUSD: 2.99,
    emailReportsSoftLimited: false,
    emailReportsSoftCap: 0,
    features: {
      aiCoach: true,
      emailReports: true,
      exclusiveProtection: true,
      referral: false,
      deepAnalysis: true,
      goalBonus: false,
      loyaltyDiscount: false,
    },
    trialDays: 14,
  },
  family: {
    id: 'family',
    displayName: 'Family',
    priceUSD: 9.99,
    quotas: {
      incomes: 3,
      goals: 'unlimited',
      devices: 'unlimited',
      aiMessages: 30,
      emailReports: 'unlimited',
      deepAnalysis: 10,
    },
    extraMessagePriceUSD: 2.99,
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
    trialDays: 14,
  },
};

/** Plans in ascending rank order (lowest tier first). */
export const PLAN_ORDER: UserPlan[] = (Object.keys(PLAN_CONFIG) as UserPlan[]).sort(
  (a, b) => PLAN_RANK[a] - PLAN_RANK[b]
);

export function getPlanConfig(plan: UserPlan): PlanConfig {
  return PLAN_CONFIG[plan] ?? PLAN_CONFIG.beginner;
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
  | 'deepAnalysisQuota'
  | 'referral';

export interface GateInfo {
  title: string;
  description: string;
  /** Suggested plan to upgrade to, or null if already on the top plan. */
  requiredPlan: UserPlan | null;
}

export function gateInfo(
  key: GateKey,
  currentPlan: UserPlan,
  t?: TFunction<'plans'>
): GateInfo {
  switch (key) {
    case 'aiCoach':
      return {
        title: t ? t('gates.aiCoach.title') : 'Unlock the AI Coach',
        description: t
          ? t('gates.aiCoach.description')
          : 'Chat with your personal savings coach by upgrading your plan.',
        requiredPlan: lowestPlanWithFeature('aiCoach'),
      };
    case 'aiMessages':
      return {
        title: t ? t('gates.aiMessages.title') : "You're out of AI messages",
        description: t
          ? t('gates.aiMessages.description')
          : "You've used all of this month's AI messages. Upgrade for a bigger monthly allowance.",
        requiredPlan: lowestPlanWithMoreQuota('aiMessages', currentPlan),
      };
    case 'goals':
      return {
        title: t ? t('gates.goals.title') : 'Goal limit reached',
        description: t
          ? t('gates.goals.description')
          : 'Your current plan supports fewer goals. Upgrade to track more savings goals at once.',
        requiredPlan: lowestPlanWithMoreQuota('goals', currentPlan),
      };
    case 'incomes':
      return {
        title: t ? t('gates.incomes.title') : 'Income limit reached',
        description: t
          ? t('gates.incomes.description')
          : 'Upgrade to add more income sources to your budget.',
        requiredPlan: lowestPlanWithMoreQuota('incomes', currentPlan),
      };
    case 'devices':
      return {
        title: t ? t('gates.devices.title') : 'Device limit reached',
        description: t
          ? t('gates.devices.description')
          : 'This plan allows fewer connected devices. Upgrade to use Piggy on more devices.',
        requiredPlan: lowestPlanWithMoreQuota('devices', currentPlan),
      };
    case 'emailReports':
      return {
        title: t ? t('gates.emailReports.title') : 'Email reports are a paid feature',
        description: t
          ? t('gates.emailReports.description')
          : 'Upgrade your plan to request email reports of your progress.',
        requiredPlan: lowestPlanWithFeature('emailReports'),
      };
    case 'deepAnalysis':
      return {
        title: t ? t('gates.deepAnalysis.title') : 'Deep spending analysis',
        description: t
          ? t('gates.deepAnalysis.description')
          : 'Get an AI-powered deep dive into your spending, delivered straight to your inbox, by upgrading your plan.',
        requiredPlan: lowestPlanWithFeature('deepAnalysis'),
      };
    case 'deepAnalysisQuota':
      return {
        title: t ? t('gates.deepAnalysisQuota.title') : "You're out of Deep Analyses",
        description: t
          ? t('gates.deepAnalysisQuota.description')
          : "You've used all of this period's deep analyses. Upgrade for a bigger allowance.",
        requiredPlan: lowestPlanWithMoreQuota('deepAnalysis', currentPlan),
      };
    case 'referral':
      return {
        title: t ? t('gates.referral.title') : 'Referral rewards',
        description: t
          ? t('gates.referral.description')
          : 'Invite friends and earn free months on the Family plan.',
        requiredPlan: lowestPlanWithFeature('referral'),
      };
  }
}

/** Format a USD price for display, e.g. 5.99 -> "$5.99". */
export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

