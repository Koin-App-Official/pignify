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

/**
 * Splits total monthly savings capacity (#191 D2 — the sum of every active
 * income's set-aside) evenly across however many active goals are competing
 * for it. Equal split is the only rule that needs no data the app doesn't
 * have (no goal priority, no per-goal urgency signal) — mirrors how
 * goals.tsx already sums contributions across active goals
 * (`otherActiveGoalsMonthlyTotal`), just inverted: dividing a total rather
 * than summing parts. A user can always override a specific goal's
 * contribution by hand; this only sets the default.
 */
export function capacityShareForGoal(totalCapacity: number, activeGoalCount: number): number {
  if (!(totalCapacity > 0) || !(activeGoalCount > 0)) return 0;
  return totalCapacity / activeGoalCount;
}

/**
 * Projects when a goal would be reached at its capacity share — same math as
 * deriveGoalDate, applied to the *remaining* amount (target minus already
 * saved), since capacity shouldn't be spent projecting money the goal
 * already has. A goal that's already fully funded projects as reached today,
 * without invoking deriveGoalDate's zero/capped branch (which would
 * otherwise report a 10-year horizon for a goal that needs $0 more).
 */
export function projectedGoalDate(
  targetAmount: number,
  savedAmount: number,
  capacityShare: number,
  from: Date = new Date()
): DerivedGoalDate {
  const remaining = Math.max(0, targetAmount - savedAmount);
  if (remaining <= 0) {
    return { date: from.toISOString(), months: 0, capped: false };
  }
  return deriveGoalDate(remaining, capacityShare, from);
}

/**
 * Structural subset of `Goal` (store.ts) this module needs — not imported
 * directly, same rationale as currencyConversion.ts's ConvertibleProfile/
 * ConvertibleGoal: store.ts imports this module, so the reverse import would
 * be circular.
 */
export interface CapacityGoalInput {
  id: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  createdAt: string;
  monthlyContribution?: number | null;
  /** Undefined means 'deadline' — matches Goal's own doc comment (pre-flip
   * goals never had this field, and always meant a picked date). A goal
   * without an explicit 'contribution' here is never a capacity-apply
   * candidate. */
  planningMode?: 'contribution' | 'deadline';
  archived?: boolean;
}

export interface CapacityApplyCandidate {
  goalId: string;
  oldDate: string;
  newDate: string;
  newContribution: number;
}

/** Year+month identity — coarser than a raw ISO comparison, since two dates
 * computed from different `from` instants (the goal's original creation time
 * vs. "now") will almost never share a millisecond even when they land in
 * the same displayed month (`formatMonthYear`). */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/**
 * Which active, contribution-mode goals would get a different reach-date if
 * `totalCapacity` were applied to them right now, and what their new date/
 * contribution would be (#191 D2/Phase 8 — the interactive half).
 *
 * Deliberately excludes:
 *  - deadline-mode goals (including goals with no `planningMode` at all,
 *    i.e. pre-flip goals — see CapacityGoalInput). Their date is a
 *    constraint, never rewritten by capacity (see this module's Phase 8
 *    header note in the implementation plan).
 *  - archived goals (C7 — inactive, doesn't compete for capacity).
 *  - already-complete/overfunded goals (nothing to apply a contribution to).
 *  - a goal whose projected month already matches its stored month (nothing
 *    would actually change — not a real candidate).
 *
 * Capacity splits evenly across the *contribution-mode* goals competing for
 * it (via capacityShareForGoal) — deadline-mode goals don't draw from this
 * pool at all, since their contribution is derived from their date, not from
 * capacity.
 */
export function capacityApplyCandidates(
  goals: CapacityGoalInput[],
  totalCapacity: number,
  from: Date = new Date()
): CapacityApplyCandidate[] {
  const eligible = goals.filter(
    (g) => !g.archived && g.planningMode === 'contribution' && g.targetAmount - g.savedAmount > 0
  );
  if (eligible.length === 0 || !(totalCapacity > 0)) return [];

  const share = capacityShareForGoal(totalCapacity, eligible.length);
  const candidates: CapacityApplyCandidate[] = [];
  for (const g of eligible) {
    const projected = projectedGoalDate(g.targetAmount, g.savedAmount, share, from);
    if (monthKey(g.deadline) === monthKey(projected.date)) continue;
    candidates.push({
      goalId: g.id,
      oldDate: g.deadline,
      newDate: projected.date,
      newContribution: Math.round(share * 100) / 100,
    });
  }
  return candidates;
}
