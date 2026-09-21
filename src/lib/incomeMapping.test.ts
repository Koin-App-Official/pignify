import { describe, it, expect } from 'vitest';
import { amountToCents, centsToAmount, toClientIncome, toServerIncomeData, type ServerIncomeRow } from './incomeMapping';

const row = (overrides: Partial<ServerIncomeRow> = {}): ServerIncomeRow =>
  ({
    $id: 'row1',
    $collectionId: 'incomes',
    $databaseId: 'piggnify_mobile_db',
    $tableId: 'incomes',
    $createdAt: '2026-09-17T00:00:00.000Z',
    $updatedAt: '2026-09-17T00:00:00.000Z',
    $permissions: [],
    $sequence: 1,
    label: 'Primary',
    amount_cents: 400000,
    save_amount_cents: 60000,
    archived: false,
    ...overrides,
  }) as ServerIncomeRow;

describe('amountToCents', () => {
  it('converts a float amount to integer cents', () => {
    expect(amountToCents(1234.56)).toBe(123456);
  });

  it('rounds floating-point noise', () => {
    expect(amountToCents(10.1 * 10)).toBe(10100);
  });
});

describe('centsToAmount', () => {
  it('converts integer cents to a float amount', () => {
    expect(centsToAmount(123456)).toBe(1234.56);
  });
});

describe('amountToCents / centsToAmount round-trip', () => {
  it('round-trips 1234.56 -> 123456 -> 1234.56', () => {
    expect(centsToAmount(amountToCents(1234.56))).toBe(1234.56);
  });

  it('round-trips 0', () => {
    expect(centsToAmount(amountToCents(0))).toBe(0);
  });
});

describe('toClientIncome', () => {
  it('maps a full row to an IncomeSource', () => {
    expect(toClientIncome(row())).toEqual({
      id: 'row1',
      label: 'Primary',
      amount: 4000,
      saveAmount: 600,
      archived: false,
    });
  });

  it('maps a null save_amount_cents to a null saveAmount', () => {
    expect(toClientIncome(row({ save_amount_cents: null })).saveAmount).toBeNull();
  });

  it('maps a missing save_amount_cents to a null saveAmount', () => {
    const { save_amount_cents: _omit, ...rest } = row();
    expect(toClientIncome(rest as ServerIncomeRow).saveAmount).toBeNull();
  });

  it('defaults a missing label to an empty string', () => {
    const { label: _omit, ...rest } = row();
    expect(toClientIncome(rest as ServerIncomeRow).label).toBe('');
  });

  it('defaults a missing archived to false', () => {
    const { archived: _omit, ...rest } = row();
    expect(toClientIncome(rest as ServerIncomeRow).archived).toBe(false);
  });
});

describe('toServerIncomeData', () => {
  it('maps an IncomeSource to the write shape, converting to cents', () => {
    expect(
      toServerIncomeData('user1', { id: 'i1', label: 'Salary', amount: 4000, saveAmount: 600 })
    ).toEqual({
      user_id: 'user1',
      label: 'Salary',
      amount_cents: 400000,
      save_amount_cents: 60000,
      archived: false,
    });
  });

  it('maps a null saveAmount to a null save_amount_cents', () => {
    const result = toServerIncomeData('user1', { id: 'i1', label: 'Salary', amount: 4000, saveAmount: null });
    expect(result.save_amount_cents).toBeNull();
  });

  it('defaults archived to false when unset', () => {
    const result = toServerIncomeData('user1', { id: 'i1', label: 'Salary', amount: 4000, saveAmount: null });
    expect(result.archived).toBe(false);
  });

  it('preserves an explicit archived: true', () => {
    const result = toServerIncomeData('user1', {
      id: 'i1',
      label: 'Salary',
      amount: 4000,
      saveAmount: null,
      archived: true,
    });
    expect(result.archived).toBe(true);
  });
});
