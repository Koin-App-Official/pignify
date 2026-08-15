import { describe, it, expect } from 'vitest';
import {
  addDaysString,
  computeStreak,
  getDailySavingsTarget,
  migrateGoalDepositDates,
  normalizeDay,
  sumDepositsForDate,
  sumDepositsSince,
  type DepositBearingGoal,
} from './deposits';

/** A goal whose deposits use the legacy full-ISO-timestamp shape. */
const legacyGoal = (deposits: { date: string; amount: number }[]): DepositBearingGoal => ({
  deposits,
  monthlyContribution: 300,
});

describe('normalizeDay', () => {
  it('passes a day string through unchanged', () => {
    expect(normalizeDay('2026-08-15')).toBe('2026-08-15');
  });

  it('truncates a full ISO timestamp to its calendar day', () => {
    expect(normalizeDay('2026-08-15T14:32:11.000Z')).toBe('2026-08-15');
  });

  it('is total — non-strings become an empty string that matches no real day', () => {
    expect(normalizeDay(undefined)).toBe('');
    expect(normalizeDay(null)).toBe('');
    expect(normalizeDay(42)).toBe('');
  });
});

describe('sumDepositsForDate', () => {
  // This is the regression test for the bug: deposits were written as full ISO
  // timestamps but compared with `d.date === 'YYYY-MM-DD'`, which never matched,
  // so this always returned 0 and the streak could never increment.
  it('matches deposits stored as full ISO timestamps', () => {
    const goals = [legacyGoal([{ date: '2026-08-15T14:32:11.000Z', amount: 25 }])];
    expect(sumDepositsForDate(goals, '2026-08-15')).toBe(25);
  });

  it('matches deposits stored as day strings', () => {
    const goals = [legacyGoal([{ date: '2026-08-15', amount: 25 }])];
    expect(sumDepositsForDate(goals, '2026-08-15')).toBe(25);
  });

  it('sums across goals and ignores other days', () => {
    const goals = [
      legacyGoal([
        { date: '2026-08-15T09:00:00.000Z', amount: 10 },
        { date: '2026-08-14', amount: 99 },
      ]),
      legacyGoal([{ date: '2026-08-15', amount: 5 }]),
    ];
    expect(sumDepositsForDate(goals, '2026-08-15')).toBe(15);
  });

  it('returns 0 for a day with no deposits', () => {
    expect(sumDepositsForDate([legacyGoal([{ date: '2026-08-15', amount: 10 }])], '2026-08-16')).toBe(0);
  });

  it('survives goals with no deposits array', () => {
    const malformed = [{ monthlyContribution: 100 } as unknown as DepositBearingGoal];
    expect(sumDepositsForDate(malformed, '2026-08-15')).toBe(0);
  });

  it('handles an empty goal list', () => {
    expect(sumDepositsForDate([], '2026-08-15')).toBe(0);
  });
});

describe('sumDepositsSince', () => {
  it('includes the boundary day for both date shapes', () => {
    const goals = [
      legacyGoal([
        { date: '2026-08-10T23:59:59.000Z', amount: 7 },
        { date: '2026-08-10', amount: 3 },
        { date: '2026-08-09', amount: 100 },
      ]),
    ];
    expect(sumDepositsSince(goals, '2026-08-10')).toBe(10);
  });

  it('survives goals with no deposits array', () => {
    const malformed = [{ monthlyContribution: 100 } as unknown as DepositBearingGoal];
    expect(sumDepositsSince(malformed, '2026-08-10')).toBe(0);
  });
});

describe('getDailySavingsTarget', () => {
  it('spreads the summed monthly contribution over 30 days', () => {
    expect(getDailySavingsTarget([legacyGoal([]), legacyGoal([])])).toBe(20);
  });

  it('excludes archived goals', () => {
    const goals: DepositBearingGoal[] = [
      { deposits: [], monthlyContribution: 300 },
      { deposits: [], monthlyContribution: 600, archived: true },
    ];
    expect(getDailySavingsTarget(goals)).toBe(10);
  });

  it('is 0 when no goal carries a contribution', () => {
    expect(getDailySavingsTarget([{ deposits: [] }])).toBe(0);
  });
});

describe('addDaysString', () => {
  it('advances by one day', () => {
    expect(addDaysString('2026-08-15', 1)).toBe('2026-08-16');
  });

  it('crosses a month boundary', () => {
    expect(addDaysString('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a leap day', () => {
    expect(addDaysString('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('computeStreak', () => {
  const goals = (days: string[], amount: number): DepositBearingGoal[] => [
    { deposits: days.map((date) => ({ date, amount })), monthlyContribution: 300 },
  ];

  // dailyTarget = 300/30 = 10.

  // The core regression: before the fix this could never happen, because
  // sumDepositsForDate always returned 0 and every day took the `else` branch.
  it('increments for each day that met the target', () => {
    const result = computeStreak({
      streak: 0,
      ignored: 0,
      lastCheckedDate: '2026-08-11',
      today: '2026-08-15',
      goals: goals(['2026-08-12', '2026-08-13', '2026-08-14'], 10),
      dailyTarget: 10,
    });
    expect(result).toEqual({ streak: 3, ignored: 0 });
  });

  it('increments when deposits are stored as full ISO timestamps', () => {
    const result = computeStreak({
      streak: 0,
      ignored: 0,
      lastCheckedDate: '2026-08-13',
      today: '2026-08-15',
      goals: goals(['2026-08-14T14:32:11.000Z'], 10),
      dailyTarget: 10,
    });
    expect(result.streak).toBe(1);
  });

  it('breaks the streak on a missed day and counts it as ignored', () => {
    const result = computeStreak({
      streak: 5,
      ignored: 0,
      lastCheckedDate: '2026-08-13',
      today: '2026-08-15',
      goals: goals([], 0),
      dailyTarget: 10,
    });
    expect(result).toEqual({ streak: 0, ignored: 1 });
  });

  it('resets then rebuilds across a gap', () => {
    const result = computeStreak({
      streak: 9,
      ignored: 0,
      lastCheckedDate: '2026-08-10',
      today: '2026-08-15',
      // 11th missed, 12th–14th met.
      goals: goals(['2026-08-12', '2026-08-13', '2026-08-14'], 10),
      dailyTarget: 10,
    });
    expect(result).toEqual({ streak: 3, ignored: 0 });
  });

  it('does not evaluate today — the user still has time to save', () => {
    const result = computeStreak({
      streak: 4,
      ignored: 0,
      lastCheckedDate: '2026-08-14',
      today: '2026-08-15',
      goals: goals([], 0),
      dailyTarget: 10,
    });
    expect(result).toEqual({ streak: 4, ignored: 0 });
  });

  it('leaves the streak untouched when no target is set', () => {
    const result = computeStreak({
      streak: 7,
      ignored: 2,
      lastCheckedDate: '2026-08-01',
      today: '2026-08-15',
      goals: goals([], 0),
      dailyTarget: 0,
    });
    expect(result).toEqual({ streak: 7, ignored: 2 });
  });

  it('counts a day where deposits across goals sum to the target', () => {
    const split: DepositBearingGoal[] = [
      { deposits: [{ date: '2026-08-14', amount: 6 }], monthlyContribution: 150 },
      { deposits: [{ date: '2026-08-14', amount: 4 }], monthlyContribution: 150 },
    ];
    const result = computeStreak({
      streak: 0,
      ignored: 0,
      lastCheckedDate: '2026-08-13',
      today: '2026-08-15',
      goals: split,
      dailyTarget: 10,
    });
    expect(result.streak).toBe(1);
  });

  it('terminates on a very stale last-checked date', () => {
    const result = computeStreak({
      streak: 0,
      ignored: 0,
      lastCheckedDate: '2000-01-01',
      today: '2026-08-15',
      goals: goals([], 0),
      dailyTarget: 10,
    });
    expect(result.streak).toBe(0);
    expect(result.ignored).toBeGreaterThan(0);
  });
});

describe('migrateGoalDepositDates', () => {
  it('normalizes timestamps to day strings', () => {
    const goals = [legacyGoal([{ date: '2026-08-15T14:32:11.000Z', amount: 25 }])];
    expect(migrateGoalDepositDates(goals)[0].deposits[0].date).toBe('2026-08-15');
  });

  it('returns the same reference when nothing needs changing', () => {
    const goals = [legacyGoal([{ date: '2026-08-15', amount: 25 }])];
    expect(migrateGoalDepositDates(goals)).toBe(goals);
  });

  it('preserves the amount and other goal fields', () => {
    const goals = [{ deposits: [{ date: '2026-08-15T00:00:00.000Z', amount: 25 }], monthlyContribution: 300, archived: true }];
    const [migrated] = migrateGoalDepositDates(goals);
    expect(migrated.deposits[0].amount).toBe(25);
    expect(migrated.monthlyContribution).toBe(300);
    expect(migrated.archived).toBe(true);
  });

  it('handles an empty list and goals without deposits', () => {
    expect(migrateGoalDepositDates([])).toEqual([]);
    const malformed = [{ monthlyContribution: 100 } as unknown as DepositBearingGoal];
    expect(migrateGoalDepositDates(malformed)).toBe(malformed);
  });
});
