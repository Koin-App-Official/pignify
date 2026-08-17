/**
 * Deposit reads, calendar-day helpers and the streak walk.
 *
 * Extracted from `store.ts` so this logic is unit-testable: `store.ts` pulls in
 * AsyncStorage and `./notifications` (and through it expo-notifications), none
 * of which resolve under vitest. Same reason `goalMath.ts` stands alone — keep
 * this module free of store/React imports.
 *
 * ## The calendar-day contract
 *
 * Every date here is a **plain calendar-day string, `YYYY-MM-DD`**, with no
 * timezone of its own — matching `Expense.date`, `lastActiveDate` and
 * `lastStreakCheckDate`.
 *
 * `deposits[].date` used to be written as a full ISO timestamp
 * (`new Date().toISOString()`) while every reader compared it for exact
 * equality against a day string. That comparison can never be true, so
 * `sumDepositsForDate` always returned 0 — which silently pinned every user's
 * streak at 0 and made "saved today" always render zero. The readers below
 * therefore normalize defensively via `normalizeDay` rather than trusting the
 * stored shape: persisted data predates the fix, and a future write path must
 * not be able to re-break the streak by reintroducing a timestamp.
 */

/**
 * Structural subset of `Goal` — deliberately not importing the real type, since
 * `store.ts` imports this module and the cycle would be circular. Any `Goal` is
 * assignable to this.
 */
export interface DepositBearingGoal {
  deposits: { date: string; amount: number }[];
  monthlyContribution?: number;
  archived?: boolean;
}

/**
 * Upper bound on the streak walk. The walk is already guarded by a validity
 * check on its start date, so this is pure belt-and-braces: a malformed cursor
 * that failed to advance would otherwise spin forever.
 */
export const MAX_STREAK_WALK_DAYS = 3660;

/**
 * Coerce any stored date to its calendar-day prefix. Total by design — malformed
 * persisted rows return `''`, which simply never matches a real day.
 */
export function normalizeDay(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Defaults to the real current time; pass an explicit `referenceDate` to compute relative to some other day (e.g. an injected `today` in tests). */
export function getWeekMondayString(referenceDate: Date = new Date()): string {
  // UTC throughout: mixing local getDay()/setDate() with a UTC toISOString()
  // serialization is the same bug class as addDaysString below — in any
  // timezone ahead of UTC it can silently roll the result back a day.
  const d = new Date(referenceDate);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

export function isValidDateString(s: unknown): s is string {
  return typeof s === 'string' && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/**
 * UTC throughout — these are plain calendar-day strings (no timezone of their
 * own), so parsing/mutating in local time and then serializing via
 * toISOString() (always UTC) is inconsistent: in any timezone ahead of UTC,
 * local midnight of `dateStr + days` can land on the previous UTC day,
 * returning the SAME string back for `days = 1`. Callers that loop by
 * incrementing a cursor with this (e.g. the streak walk) would then spin
 * forever, since the cursor never advances. Doing everything in UTC removes
 * the round-trip entirely.
 */
export function addDaysString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/** (monthly contribution across active goals) / 30 — the amount a "day" requires to count toward the streak. */
export function getDailySavingsTarget(goals: DepositBearingGoal[]): number {
  return goals.filter((g) => !g.archived).reduce((sum, g) => sum + (g.monthlyContribution ?? 0), 0) / 30;
}

/** Total deposited on one specific calendar day, across all goals. */
export function sumDepositsForDate(goals: DepositBearingGoal[], dateStr: string): number {
  return goals.reduce(
    (sum, g) =>
      sum +
      (g.deposits ?? [])
        .filter((d) => normalizeDay(d.date) === dateStr)
        .reduce((s, d) => s + d.amount, 0),
    0
  );
}

/** Total deposited on or after `sinceDateStr`, across all goals. */
export function sumDepositsSince(goals: DepositBearingGoal[], sinceDateStr: string): number {
  return goals.reduce(
    (sum, g) =>
      sum +
      (g.deposits ?? [])
        .filter((d) => normalizeDay(d.date) >= sinceDateStr)
        .reduce((s, d) => s + d.amount, 0),
    0
  );
}

export interface StreakWalkInput {
  streak: number;
  /** Consecutive days the check-in reminder fired with the target unmet. */
  ignored: number;
  /** Last calendar day already fully evaluated — the walk starts the day after. */
  lastCheckedDate: string;
  today: string;
  goals: DepositBearingGoal[];
  dailyTarget: number;
}

/**
 * Walk forward day by day from `lastCheckedDate`, incrementing the streak for
 * each day that met the target and breaking it for each that didn't.
 *
 * Today is deliberately NOT evaluated — the user still has the rest of the day
 * to save, so the walk stops at `cursor < today` and today gets judged tomorrow.
 *
 * With no target set (`dailyTarget <= 0`) the streak is left untouched rather
 * than broken: there is nothing to succeed or fail at yet.
 */
export function computeStreak({
  streak,
  ignored,
  lastCheckedDate,
  today,
  goals,
  dailyTarget,
}: StreakWalkInput): { streak: number; ignored: number } {
  let nextStreak = streak;
  let nextIgnored = ignored;
  let cursor = addDaysString(lastCheckedDate, 1);
  let walked = 0;

  while (cursor < today && walked < MAX_STREAK_WALK_DAYS) {
    if (dailyTarget > 0) {
      if (sumDepositsForDate(goals, cursor) >= dailyTarget) {
        nextStreak += 1;
        nextIgnored = 0;
      } else {
        nextStreak = 0;
        nextIgnored += 1;
      }
    }
    cursor = addDaysString(cursor, 1);
    walked += 1;
  }

  return { streak: nextStreak, ignored: nextIgnored };
}

/**
 * Normalize every persisted deposit date to `YYYY-MM-DD`. Returns the same
 * array reference when nothing needed changing, so a no-op migration doesn't
 * churn the store. Defensive against malformed rows — this runs against data
 * written by older builds.
 */
export function migrateGoalDepositDates<T extends DepositBearingGoal>(goals: T[]): T[] {
  if (!Array.isArray(goals)) return goals;

  let changed = false;
  const migrated = goals.map((g) => {
    if (!Array.isArray(g?.deposits)) return g;

    let goalChanged = false;
    const deposits = g.deposits.map((d) => {
      const day = normalizeDay(d?.date);
      if (day === d?.date) return d;
      goalChanged = true;
      return { ...d, date: day };
    });

    if (!goalChanged) return g;
    changed = true;
    return { ...g, deposits };
  });

  return changed ? migrated : goals;
}
