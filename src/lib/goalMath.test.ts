import { describe, it, expect } from 'vitest';
import {
  deriveGoalDate,
  suggestedContribution,
  contributionBounds,
  requiredContribution,
  resolveMonthlyContribution,
  addMonths,
  MAX_HORIZON_MONTHS,
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
