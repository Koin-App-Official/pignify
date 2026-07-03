/**
 * Quota period model — periodic quota tracking & reset strategy (architecture §5).
 *
 * Periodic quotas (AI messages, email reports) are keyed by the BILLING period,
 * not the calendar month. Reset is LAZY: a new period yields a new `periodKey`,
 * so the counter "resets" simply because a fresh counter document is created on
 * first use. No cron required.
 */
import { isUnlimited, type QuotaValue } from './entitlements';

/**
 * Period key = the date portion of the subscription's current period start
 * (YYYY-MM-DD). Falls back to the first of the calendar month when no
 * subscription period is known (e.g. brand-new account before first sync).
 */
export function periodKeyFromStart(currentPeriodStart?: string | null): string {
  if (currentPeriodStart) return currentPeriodStart.slice(0, 10);
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export interface PeriodicQuotaResult {
  allowed: boolean;
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
}

/**
 * Evaluate a periodic quota given the resolved limit, current usage, and any
 * add-on allowance already folded in by the resolver. `allowed` = may consume one
 * more now?
 */
export function evaluatePeriodicQuota(
  limit: QuotaValue,
  used: number,
  allowanceBonus = 0
): PeriodicQuotaResult {
  if (isUnlimited(limit)) {
    return { allowed: true, unlimited: true, limit: null, used, remaining: null };
  }
  const effective = limit + Math.max(0, allowanceBonus);
  return {
    allowed: used < effective,
    unlimited: false,
    limit: effective,
    used,
    remaining: Math.max(0, effective - used),
  };
}

/**
 * Email-report request outcome. Distinguishes the two tier behaviours:
 *  - hard limit (e.g. Medium 3/mo)  → 'upgrade'  (show upgrade popup)
 *  - soft limit (Family)            → 'soft_error' (generic "Something went wrong", C12)
 */
export type EmailReportOutcome = 'allowed' | 'upgrade' | 'soft_error';

export function evaluateEmailReport(params: {
  limit: QuotaValue;
  used: number;
  softLimited: boolean;
  softCap: number;
  hasFeature: boolean;
}): EmailReportOutcome {
  const { limit, used, softLimited, softCap, hasFeature } = params;
  if (!hasFeature) return 'upgrade';

  if (softLimited) {
    // Family: effectively unlimited but soft-capped; over the cap returns a
    // generic error rather than an upgrade prompt.
    return used < softCap ? 'allowed' : 'soft_error';
  }
  if (isUnlimited(limit)) return 'allowed';
  return used < limit ? 'allowed' : 'upgrade';
}
