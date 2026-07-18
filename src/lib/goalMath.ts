/**
 * Contribution-first goal math. Given how much someone can set aside each
 * month, derive when they'll hit their goal — the inverse of the old
 * date-first flow, which divided a picked date into a required contribution.
 */

/** Hard ceiling on any derived horizon. Income-skippers have no % anchor to
 * warn them off a tiny contribution, so this is the backstop that keeps
 * "$5/month" from rendering a 40-year date. */
export const MAX_HORIZON_MONTHS = 120;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function monthDiff(from: Date, to: Date): number {
  return Math.max(
    1,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  );
}

export interface DerivedGoalDate {
  /** ISO date string for the derived goal date, capped at MAX_HORIZON_MONTHS. */
  date: string;
  /** Months to reach the goal, capped at MAX_HORIZON_MONTHS. */
  months: number;
  /** True when the uncapped math exceeded MAX_HORIZON_MONTHS. */
  capped: boolean;
}

/**
 * Derives the goal date from a target amount and a monthly contribution.
 * `months = ceil(targetAmount / monthlyContribution)`, capped at the 10-year
 * horizon so an unrealistically small contribution can't produce an
 * unrealistically distant date.
 */
export function deriveGoalDate(
  targetAmount: number,
  monthlyContribution: number,
  from: Date = new Date()
): DerivedGoalDate {
  if (!(targetAmount > 0) || !(monthlyContribution > 0)) {
    return { date: addMonths(from, MAX_HORIZON_MONTHS).toISOString(), months: MAX_HORIZON_MONTHS, capped: true };
  }

  const rawMonths = Math.ceil(targetAmount / monthlyContribution);
  const capped = rawMonths > MAX_HORIZON_MONTHS;
  const months = capped ? MAX_HORIZON_MONTHS : rawMonths;

  return { date: addMonths(from, months).toISOString(), months, capped };
}

/**
 * Suggests a monthly contribution as a percentage of income, rounded to the
 * nearest $10 so the number reads as a clean suggestion chip.
 */
export function suggestedContribution(monthlyIncome: number, pct = 0.15): number {
  if (!(monthlyIncome > 0)) return 0;
  const raw = monthlyIncome * pct;
  return Math.max(10, Math.round(raw / 10) * 10);
}

export interface ContributionBounds {
  min: number;
  max: number;
}

/**
 * Sensible min/max for the contribution input: min is whatever reaches the
 * goal within the 10-year horizon, max is the full amount (done in 1 month).
 */
export function contributionBounds(targetAmount: number): ContributionBounds {
  if (!(targetAmount > 0)) return { min: 0, max: 0 };
  return {
    min: Math.round((targetAmount / MAX_HORIZON_MONTHS) * 100) / 100,
    max: targetAmount,
  };
}

/**
 * The old flow's math, now living in one tested place: the monthly
 * contribution required to hit a target amount by a fixed deadline.
 */
export function requiredContribution(
  targetAmount: number,
  deadline: Date,
  from: Date = new Date()
): number {
  if (!(targetAmount > 0)) return 0;
  const months = monthDiff(from, deadline);
  return targetAmount / months;
}

/**
 * The monthly contribution to show for a goal: the stored value if the goal
 * was created post-flip, otherwise derived from its target/deadline/creation
 * date — the read-time fallback for pre-flip goals that never had this field.
 */
export function resolveMonthlyContribution(
  targetAmount: number,
  deadline: string,
  createdAt: string,
  stored?: number | null
): number {
  if (stored != null) return stored;
  return requiredContribution(targetAmount, new Date(deadline), new Date(createdAt));
}
