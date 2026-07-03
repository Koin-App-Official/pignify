/**
 * Downgrade data-retention rules (architecture §7).
 *
 * Invariant: user data is NEVER auto-deleted (constraint C4). On a downgrade that
 * would exceed the target plan's limits, over-limit records are ARCHIVED (kept
 * visible, excluded from limits — C7), never removed.
 *
 * Decision: when the user has NOT chosen what to keep, the downgrade is BLOCKED
 * until they select (status `awaiting_selection`). No silent auto-archive.
 */
import { getPlanConfig, isUnlimited, type QuotaResource } from './entitlements';
import type { UserPlan } from './store';

export interface RetentionSelection {
  keepGoalIds: string[];
  keepIncomeIds: string[];
  keepDeviceIds: string[];
}

export interface RetentionRequirement {
  /** True if the user must actively choose what to keep before the downgrade applies. */
  selectionRequired: boolean;
  /** Per-resource: how many active records may remain on the target plan. */
  limits: Record<'goals' | 'incomes' | 'devices', number | 'unlimited'>;
  /** Per-resource: how many must be archived given current active counts. */
  toArchive: Record<'goals' | 'incomes' | 'devices', number>;
}

function limitFor(plan: UserPlan, resource: QuotaResource): number | 'unlimited' {
  const q = getPlanConfig(plan).quotas[resource];
  return isUnlimited(q) ? 'unlimited' : q;
}

function overBy(active: number, limit: number | 'unlimited'): number {
  if (limit === 'unlimited') return 0;
  return Math.max(0, active - limit);
}

/**
 * Compute what a downgrade to `targetPlan` would require, given current ACTIVE
 * (non-archived) counts. If any resource is over the target limit, a keep-
 * selection is required before the change can be applied.
 */
export function evaluateDowngradeRetention(
  targetPlan: UserPlan,
  activeCounts: { goals: number; incomes: number; devices: number }
): RetentionRequirement {
  const limits = {
    goals: limitFor(targetPlan, 'goals'),
    incomes: limitFor(targetPlan, 'incomes'),
    devices: limitFor(targetPlan, 'devices'),
  };
  const toArchive = {
    goals: overBy(activeCounts.goals, limits.goals),
    incomes: overBy(activeCounts.incomes, limits.incomes),
    devices: overBy(activeCounts.devices, limits.devices),
  };
  const selectionRequired =
    toArchive.goals > 0 || toArchive.incomes > 0 || toArchive.devices > 0;

  return { selectionRequired, limits, toArchive };
}

export interface RetentionValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a user's keep-selection against the target plan limits. Used at the
 * period boundary just before applying the downgrade (records may have changed
 * since the request).
 */
export function validateRetentionSelection(
  targetPlan: UserPlan,
  selection: RetentionSelection
): RetentionValidation {
  const errors: string[] = [];
  const checks: [keyof RetentionSelection, 'goals' | 'incomes' | 'devices'][] = [
    ['keepGoalIds', 'goals'],
    ['keepIncomeIds', 'incomes'],
    ['keepDeviceIds', 'devices'],
  ];

  for (const [field, resource] of checks) {
    const limit = limitFor(targetPlan, resource);
    if (limit === 'unlimited') continue;
    const count = selection[field].length;
    if (count > limit) {
      errors.push(`Too many ${resource} selected to keep (${count}); ${targetPlan} allows ${limit}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
