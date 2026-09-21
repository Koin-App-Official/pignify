import { describe, it, expect } from 'vitest';
import {
  convertAmount,
  convertProfileAmounts,
  convertGoalAmounts,
  hasConvertibleMonetaryData,
  type ConvertibleProfile,
  type ConvertibleGoal,
} from './currencyConversion';

const emptyProfile = (overrides: Partial<ConvertibleProfile> = {}): ConvertibleProfile => ({
  incomes: [],
  monthlyContribution: null,
  estimatedMonthlySavings: null,
  expenses: [],
  ...overrides,
});

const goal = (overrides: Partial<ConvertibleGoal> = {}): ConvertibleGoal => ({
  targetAmount: 0,
  savedAmount: 0,
  deposits: [],
  ...overrides,
});

describe('convertAmount', () => {
  it('applies the rate and rounds to 2 decimals', () => {
    expect(convertAmount(10, 0.923)).toBe(9.23);
  });

  it('always rounds up (ceiling), even when the third decimal is below 5', () => {
    // Plain round-to-nearest would give 0.92 here — ceiling must give 0.93.
    expect(convertAmount(1, 0.921)).toBe(0.93);
  });

  it('rounds up when the third decimal is 5 or more', () => {
    expect(convertAmount(1, 0.925)).toBe(0.93);
  });

  it('leaves a whole-number result unchanged', () => {
    expect(convertAmount(100, 1)).toBe(100);
  });
});

describe('convertProfileAmounts', () => {
  it('converts contribution and the deprecated savings alias', () => {
    const profile = emptyProfile({ monthlyContribution: 200, estimatedMonthlySavings: 200 });
    const result = convertProfileAmounts(profile, 0.5);
    expect(result.monthlyContribution).toBe(100);
    expect(result.estimatedMonthlySavings).toBe(100);
  });

  it('leaves null fields as null instead of converting them', () => {
    const result = convertProfileAmounts(emptyProfile(), 0.5);
    expect(result.monthlyContribution).toBeNull();
    expect(result.estimatedMonthlySavings).toBeNull();
  });

  it('converts every expense amount', () => {
    const profile = emptyProfile({ expenses: [{ amount: 40 }, { amount: 60 }] });
    const result = convertProfileAmounts(profile, 2);
    expect(result.expenses).toEqual([{ amount: 80 }, { amount: 120 }]);
  });

  it('converts every income source\'s amount and saveAmount', () => {
    const profile = emptyProfile({
      incomes: [
        { amount: 1000, saveAmount: 200 },
        { amount: 500, saveAmount: null },
      ],
    });
    const result = convertProfileAmounts(profile, 0.5);
    expect(result.incomes).toEqual([
      { amount: 500, saveAmount: 100 },
      { amount: 250, saveAmount: null },
    ]);
  });

  it('preserves extra fields on each income (id, label, archived) while converting amounts', () => {
    // convertProfileAmounts<T extends ConvertibleProfile> preserves whatever
    // shape T's incomes actually are (e.g. the real IncomeSource) — exercised
    // here with a richer inline type rather than the bare ConvertibleIncome
    // `emptyProfile` is typed to, matching how store.ts's IncomeSource carries
    // id/label/archived on top of amount/saveAmount.
    const profile: ConvertibleProfile & {
      incomes: { id: string; label: string; amount: number; saveAmount: number | null; archived: boolean }[];
    } = {
      ...emptyProfile(),
      incomes: [{ id: 'a1', label: 'Salary', amount: 1000, saveAmount: 200, archived: false }],
    };
    const result = convertProfileAmounts(profile, 0.5);
    expect(result.incomes).toEqual([
      { id: 'a1', label: 'Salary', amount: 500, saveAmount: 100, archived: false },
    ]);
  });
});

describe('convertGoalAmounts', () => {
  it('converts targetAmount, savedAmount, and deposits', () => {
    const goals = [
      goal({
        targetAmount: 1000,
        savedAmount: 250,
        deposits: [
          { date: '2026-08-01', amount: 100 },
          { date: '2026-08-15', amount: 150 },
        ],
      }),
    ];
    const [result] = convertGoalAmounts(goals, 0.5);
    expect(result.targetAmount).toBe(500);
    expect(result.savedAmount).toBe(125);
    expect(result.deposits).toEqual([
      { date: '2026-08-01', amount: 50 },
      { date: '2026-08-15', amount: 75 },
    ]);
  });

  it('converts monthlyContribution when present, leaves it undefined when absent', () => {
    const goals = [goal({ monthlyContribution: 300 }), goal()];
    const [withContribution, withoutContribution] = convertGoalAmounts(goals, 0.5);
    expect(withContribution.monthlyContribution).toBe(150);
    expect(withoutContribution.monthlyContribution).toBeUndefined();
  });
});

describe('hasConvertibleMonetaryData', () => {
  it('is false for an empty profile and no goals', () => {
    expect(hasConvertibleMonetaryData(emptyProfile(), [])).toBe(false);
  });

  it('is true when an income source exists', () => {
    expect(
      hasConvertibleMonetaryData(emptyProfile({ incomes: [{ amount: 1000, saveAmount: null }] }), [])
    ).toBe(true);
  });

  it('is true when an expense exists', () => {
    expect(hasConvertibleMonetaryData(emptyProfile({ expenses: [{ amount: 10 }] }), [])).toBe(true);
  });

  it('is true when a goal has a target amount', () => {
    expect(hasConvertibleMonetaryData(emptyProfile(), [goal({ targetAmount: 500 })])).toBe(true);
  });

  it('is true when a goal has only deposits', () => {
    const goals = [goal({ deposits: [{ date: '2026-08-01', amount: 20 }] })];
    expect(hasConvertibleMonetaryData(emptyProfile(), goals)).toBe(true);
  });

  it('is false when goals exist but every amount is zero', () => {
    expect(hasConvertibleMonetaryData(emptyProfile(), [goal()])).toBe(false);
  });
});
