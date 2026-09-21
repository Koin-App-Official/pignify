import { describe, it, expect } from 'vitest';
import { activeIncomes, totalIncome, totalSaveAside, makeIncome, type IncomeSource } from './income';

const income = (overrides: Partial<IncomeSource> = {}): IncomeSource => ({
  id: 'x',
  label: 'Primary',
  amount: 1000,
  saveAmount: null,
  ...overrides,
});

describe('activeIncomes', () => {
  it('excludes archived sources', () => {
    const incomes = [income({ id: 'a' }), income({ id: 'b', archived: true })];
    expect(activeIncomes(incomes).map((i) => i.id)).toEqual(['a']);
  });

  it('returns an empty array unchanged', () => {
    expect(activeIncomes([])).toEqual([]);
  });
});

describe('totalIncome', () => {
  it('sums amounts across active sources', () => {
    const incomes = [income({ amount: 1000 }), income({ id: 'b', amount: 500 })];
    expect(totalIncome(incomes)).toBe(1500);
  });

  it('excludes archived sources from the sum', () => {
    const incomes = [income({ amount: 1000 }), income({ id: 'b', amount: 500, archived: true })];
    expect(totalIncome(incomes)).toBe(1000);
  });

  it('is 0 for an empty array', () => {
    expect(totalIncome([])).toBe(0);
  });
});

describe('totalSaveAside', () => {
  it('sums set-aside amounts across active sources', () => {
    const incomes = [income({ saveAmount: 200 }), income({ id: 'b', saveAmount: 300 })];
    expect(totalSaveAside(incomes)).toBe(500);
  });

  it('treats a null saveAmount as contributing 0', () => {
    const incomes = [income({ saveAmount: 200 }), income({ id: 'b', saveAmount: null })];
    expect(totalSaveAside(incomes)).toBe(200);
  });

  it('excludes archived sources from the sum', () => {
    const incomes = [income({ saveAmount: 200 }), income({ id: 'b', saveAmount: 300, archived: true })];
    expect(totalSaveAside(incomes)).toBe(200);
  });

  it('is 0 for an empty array', () => {
    expect(totalSaveAside([])).toBe(0);
  });
});

describe('makeIncome', () => {
  it('defaults saveAmount to null when omitted', () => {
    const result = makeIncome({ label: 'Salary', amount: 4000 });
    expect(result.saveAmount).toBeNull();
    expect(result.label).toBe('Salary');
    expect(result.amount).toBe(4000);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('accepts an explicit saveAmount', () => {
    const result = makeIncome({ label: 'Salary', amount: 4000, saveAmount: 600 });
    expect(result.saveAmount).toBe(600);
  });

  it('generates distinct ids across calls', () => {
    const a = makeIncome({ label: 'A', amount: 1 });
    const b = makeIncome({ label: 'B', amount: 1 });
    expect(a.id).not.toBe(b.id);
  });
});
