import { describe, it, expect, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';
import { evaluateDowngradeRetention, validateRetentionSelection } from './retention';
import { createTestT } from './i18n/testInstance';

let tPlans: TFunction<'plans'>;
beforeAll(async () => {
  tPlans = await createTestT('plans');
});

describe('evaluateDowngradeRetention', () => {
  it('requires no selection when everything already fits the target plan', () => {
    const req = evaluateDowngradeRetention('medium', { goals: 2, incomes: 1, devices: 1 });
    expect(req.selectionRequired).toBe(false);
    expect(req.toArchive).toEqual({ goals: 0, incomes: 0, devices: 0 });
  });

  it('requires a selection when active goals exceed the target limit', () => {
    // beginner allows 1 goal (see entitlements.ts PLAN_CONFIG)
    const req = evaluateDowngradeRetention('beginner', { goals: 5, incomes: 1, devices: 1 });
    expect(req.selectionRequired).toBe(true);
    expect(req.limits.goals).toBe(1);
    expect(req.toArchive.goals).toBe(4);
  });

  it('never requires a selection for an unlimited resource', () => {
    // family allows unlimited goals
    const req = evaluateDowngradeRetention('family', { goals: 50, incomes: 1, devices: 1 });
    expect(req.limits.goals).toBe('unlimited');
    expect(req.toArchive.goals).toBe(0);
    expect(req.selectionRequired).toBe(false);
  });

  it('flags any over-limit resource, not just goals', () => {
    const req = evaluateDowngradeRetention('beginner', { goals: 1, incomes: 1, devices: 3 });
    expect(req.selectionRequired).toBe(true);
    expect(req.toArchive.devices).toBeGreaterThan(0);
  });
});

describe('validateRetentionSelection', () => {
  it('accepts a selection within every resource limit', () => {
    const result = validateRetentionSelection(
      'beginner',
      {
        keepGoalIds: ['g1'],
        keepIncomeIds: ['i1'],
        keepDeviceIds: ['d1'],
      },
      tPlans
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects a selection that keeps more goals than the target allows', () => {
    const result = validateRetentionSelection(
      'beginner',
      {
        keepGoalIds: ['g1', 'g2'],
        keepIncomeIds: [],
        keepDeviceIds: [],
      },
      tPlans
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('goals'))).toBe(true);
  });

  it('places no ceiling on an unlimited resource', () => {
    const result = validateRetentionSelection(
      'family',
      {
        keepGoalIds: Array.from({ length: 20 }, (_, i) => `g${i}`),
        keepIncomeIds: [],
        keepDeviceIds: [],
      },
      tPlans
    );
    expect(result.valid).toBe(true);
  });

  it('reports every violated resource at once', () => {
    const result = validateRetentionSelection(
      'beginner',
      {
        keepGoalIds: ['g1', 'g2'],
        keepIncomeIds: ['i1', 'i2'],
        keepDeviceIds: [],
      },
      tPlans
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
