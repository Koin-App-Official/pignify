import { describe, it, expect } from 'vitest';
import {
  deriveGoalDate,
  suggestedContribution,
  contributionBounds,
  requiredContribution,
  resolveMonthlyContribution,
  capacityShareForGoal,
  projectedGoalDate,
  capacityApplyCandidates,
  addMonths,
  MAX_HORIZON_MONTHS,
  type CapacityGoalInput,
} from './goalMath';

const FROM = new Date('2026-01-15T00:00:00.000Z');

describe('deriveGoalDate', () => {
  it('reaches the goal in 1 month when contribution >= amount', () => {
    const result = deriveGoalDate(500, 500, FROM);
    expect(result.months).toBe(1);
    expect(result.capped).toBe(false);
    expect(new Date(result.date).toISOString()).toBe(addMonths(FROM, 1).toISOString());
  });

  it('reaches the goal in 1 month when contribution exceeds amount', () => {
    const result = deriveGoalDate(500, 900, FROM);
    expect(result.months).toBe(1);
    expect(result.capped).toBe(false);
  });

  it('caps a tiny contribution at the 10-year horizon', () => {
    const result = deriveGoalDate(10000, 5, FROM);
    expect(result.months).toBe(MAX_HORIZON_MONTHS);
    expect(result.capped).toBe(true);
    expect(new Date(result.date).toISOString()).toBe(
      addMonths(FROM, MAX_HORIZON_MONTHS).toISOString()
    );
  });

  it('treats zero contribution as capped rather than dividing by zero', () => {
    const result = deriveGoalDate(1000, 0, FROM);
    expect(result.capped).toBe(true);
    expect(result.months).toBe(MAX_HORIZON_MONTHS);
    expect(Number.isFinite(new Date(result.date).getTime())).toBe(true);
  });

  it('treats NaN inputs as capped rather than producing an invalid date', () => {
    const result = deriveGoalDate(NaN, NaN, FROM);
    expect(result.capped).toBe(true);
    expect(Number.isFinite(new Date(result.date).getTime())).toBe(true);
  });

  it('treats a negative contribution as capped', () => {
    const result = deriveGoalDate(1000, -50, FROM);
    expect(result.capped).toBe(true);
  });

  it('rounds up so the last, smaller month is never dropped', () => {
    // $1000 at $300/month needs 4 months (3 full + 1 partial), not 3.
    const result = deriveGoalDate(1000, 300, FROM);
    expect(result.months).toBe(4);
  });

  it('lands exactly on the horizon cap boundary without over-capping', () => {
    const result = deriveGoalDate(1200, 10, FROM); // exactly 120 months
    expect(result.months).toBe(MAX_HORIZON_MONTHS);
    expect(result.capped).toBe(false);
  });
});

describe('suggestedContribution', () => {
  it('suggests 15% of income by default, rounded to the nearest 10', () => {
    expect(suggestedContribution(2000)).toBe(300);
  });

  it('supports a custom percentage', () => {
    expect(suggestedContribution(2000, 0.1)).toBe(200);
  });

  it('rounds to the nearest 10', () => {
    expect(suggestedContribution(1234, 0.15)).toBe(190); // 185.1 -> 190
  });

  it('returns 0 for missing or non-positive income', () => {
    expect(suggestedContribution(0)).toBe(0);
    expect(suggestedContribution(-500)).toBe(0);
    expect(suggestedContribution(NaN)).toBe(0);
  });

  it('floors at a minimum suggestion of 10 for very low income', () => {
    expect(suggestedContribution(20, 0.15)).toBe(10);
  });
});

describe('contributionBounds', () => {
  it('derives min from the 10-year horizon and max from the full amount', () => {
    const bounds = contributionBounds(1200);
    expect(bounds.min).toBeCloseTo(10, 5);
    expect(bounds.max).toBe(1200);
  });

  it('returns zero bounds for a non-positive amount', () => {
    expect(contributionBounds(0)).toEqual({ min: 0, max: 0 });
    expect(contributionBounds(-100)).toEqual({ min: 0, max: 0 });
  });
});

describe('requiredContribution', () => {
  it('computes the monthly amount needed to hit a fixed deadline', () => {
    const deadline = addMonths(FROM, 10);
    expect(requiredContribution(1000, deadline, FROM)).toBe(100);
  });

  it('never divides by less than 1 month for a near/past deadline', () => {
    const pastDeadline = new Date('2025-01-01T00:00:00.000Z');
    expect(requiredContribution(1200, pastDeadline, FROM)).toBe(1200);
  });

  it('returns 0 for a non-positive target amount', () => {
    expect(requiredContribution(0, addMonths(FROM, 6), FROM)).toBe(0);
  });
});

describe('resolveMonthlyContribution', () => {
  it('returns the stored value when present', () => {
    expect(resolveMonthlyContribution(1000, addMonths(FROM, 10).toISOString(), FROM.toISOString(), 250)).toBe(250);
  });

  it('derives from target/deadline/createdAt for pre-flip goals with no stored value', () => {
    const deadline = addMonths(FROM, 10).toISOString();
    expect(resolveMonthlyContribution(1000, deadline, FROM.toISOString())).toBe(100);
  });
});

describe('capacityShareForGoal', () => {
  it('splits capacity evenly across active goals', () => {
    expect(capacityShareForGoal(900, 3)).toBe(300);
  });

  it('is the full amount for a single active goal', () => {
    expect(capacityShareForGoal(900, 1)).toBe(900);
  });

  it('returns 0 for zero capacity', () => {
    expect(capacityShareForGoal(0, 3)).toBe(0);
  });

  it('returns 0 for a negative capacity', () => {
    expect(capacityShareForGoal(-100, 3)).toBe(0);
  });

  it('returns 0 for zero active goals (nothing to divide across)', () => {
    expect(capacityShareForGoal(900, 0)).toBe(0);
  });
});

describe('projectedGoalDate', () => {
  it('projects the same as deriveGoalDate on the remaining amount, when nothing is saved yet', () => {
    const result = projectedGoalDate(1000, 0, 250, FROM);
    expect(result).toEqual(deriveGoalDate(1000, 250, FROM));
  });

  it('applies capacity only to the remaining (unsaved) amount', () => {
    // $1000 target, $600 already saved -> $400 remaining at $200/month = 2 months.
    const result = projectedGoalDate(1000, 600, 200, FROM);
    expect(result.months).toBe(2);
    expect(result.capped).toBe(false);
  });

  it('reports an already-complete goal as reached today, not capped at the horizon', () => {
    const result = projectedGoalDate(1000, 1000, 0, FROM);
    expect(result.months).toBe(0);
    expect(result.capped).toBe(false);
    expect(result.date).toBe(FROM.toISOString());
  });

  it('reports a goal saved past its target as reached today', () => {
    const result = projectedGoalDate(1000, 1500, 200, FROM);
    expect(result.months).toBe(0);
    expect(result.capped).toBe(false);
  });

  it('caps at the 10-year horizon for zero capacity with money still remaining', () => {
    const result = projectedGoalDate(1000, 0, 0, FROM);
    expect(result.capped).toBe(true);
    expect(result.months).toBe(MAX_HORIZON_MONTHS);
  });

  it('caps at the 10-year horizon for a capacity share too small to reach the goal in time', () => {
    const result = projectedGoalDate(10000, 0, 5, FROM);
    expect(result.capped).toBe(true);
    expect(result.months).toBe(MAX_HORIZON_MONTHS);
  });

  it('splits capacity across 2+ goals before projecting each one', () => {
    // $600 total capacity across 3 goals -> $200/goal share.
    const share = capacityShareForGoal(600, 3);
    const goalA = projectedGoalDate(1000, 0, share, FROM);
    const goalB = projectedGoalDate(2000, 0, share, FROM);
    expect(share).toBe(200);
    expect(goalA.months).toBe(5); // 1000 / 200
    expect(goalB.months).toBe(10); // 2000 / 200
  });
});

describe('capacityApplyCandidates', () => {
  const goal = (overrides: Partial<CapacityGoalInput> = {}): CapacityGoalInput => ({
    id: 'g1',
    targetAmount: 1200,
    savedAmount: 0,
    deadline: addMonths(FROM, 12).toISOString(), // implies a slow ~$100/month original plan
    createdAt: FROM.toISOString(),
    planningMode: 'contribution',
    ...overrides,
  });

  it('returns no candidates when capacity is 0', () => {
    expect(capacityApplyCandidates([goal()], 0, FROM)).toEqual([]);
  });

  it('returns no candidates when capacity is unset (negative/NaN guard)', () => {
    expect(capacityApplyCandidates([goal()], -100, FROM)).toEqual([]);
  });

  it('includes a contribution-mode goal whose projected month differs from its stored month', () => {
    // $300/month capacity reaches $1200 in 4 months, not the stored 12.
    const result = capacityApplyCandidates([goal()], 300, FROM);
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe('g1');
    expect(result[0].newContribution).toBe(300);
  });

  it('excludes a goal whose stored date already matches the projected month (capacity unchanged)', () => {
    // Deadline already lands in the same month deriveGoalDate(1200, 300) would produce.
    const alreadyCurrent = goal({ deadline: deriveGoalDate(1200, 300, FROM).date });
    expect(capacityApplyCandidates([alreadyCurrent], 300, FROM)).toEqual([]);
  });

  it('never includes a deadline-mode goal', () => {
    const deadlineGoal = goal({ planningMode: 'deadline' });
    expect(capacityApplyCandidates([deadlineGoal], 300, FROM)).toEqual([]);
  });

  it('never includes a goal with no planningMode at all (pre-flip goals default to deadline)', () => {
    const preFlipGoal = goal({ planningMode: undefined });
    expect(capacityApplyCandidates([preFlipGoal], 300, FROM)).toEqual([]);
  });

  it('never includes an archived goal', () => {
    const archivedGoal = goal({ archived: true });
    expect(capacityApplyCandidates([archivedGoal], 300, FROM)).toEqual([]);
  });

  it('never includes an already-complete goal', () => {
    const doneGoal = goal({ savedAmount: 1200 });
    expect(capacityApplyCandidates([doneGoal], 300, FROM)).toEqual([]);
  });

  it('splits capacity across multiple contribution-mode goals and reports each new date', () => {
    const goalA = goal({ id: 'a', targetAmount: 1000 });
    const goalB = goal({ id: 'b', targetAmount: 2000 });
    // $600 total / 2 goals = $300 share each.
    const result = capacityApplyCandidates([goalA, goalB], 600, FROM);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.newContribution === 300)).toBe(true);
    const a = result.find((c) => c.goalId === 'a')!;
    const b = result.find((c) => c.goalId === 'b')!;
    expect(new Date(a.newDate).getTime()).toBeLessThan(new Date(b.newDate).getTime());
  });
});
