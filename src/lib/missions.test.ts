import { describe, it, expect } from 'vitest';
import {
  MISSION_CATALOG,
  buildMissionContext,
  getMissionProgress,
  getTier,
  microAmount,
  renderMissionCopy,
  roundHuman,
  selectMissions,
  type MissionContext,
  type MissionContextInput,
  type MissionGoal,
  type MissionProfileSlice,
} from './missions';

const PROFILE = (overrides: Partial<MissionProfileSlice> = {}): MissionProfileSlice => ({
  level: 1,
  streak: 0,
  monthlyContribution: 300,
  currency: 'USD',
  lastActiveDate: '2026-08-15',
  ...overrides,
});

const GOAL = (overrides: Partial<MissionGoal> = {}): MissionGoal => ({
  id: 'g1',
  targetAmount: 1000,
  savedAmount: 0,
  deposits: [],
  monthlyContribution: 300,
  archived: false,
  ...overrides,
});

const ctxFrom = (input: Partial<MissionContextInput> = {}): MissionContext =>
  buildMissionContext({
    goals: [],
    profile: PROFILE(),
    expenses: [],
    today: '2026-08-15', // a Saturday
    ...input,
  });

describe('getTier', () => {
  it('starts everyone at tier 1', () => {
    expect(getTier(PROFILE({ level: 1, streak: 0 }))).toBe(1);
  });

  it('promotes to tier 2 by level', () => {
    expect(getTier(PROFILE({ level: 2, streak: 0 }))).toBe(2);
  });

  it('promotes to tier 2 by streak', () => {
    expect(getTier(PROFILE({ level: 1, streak: 7 }))).toBe(2);
  });

  it('promotes to tier 3 by level', () => {
    expect(getTier(PROFILE({ level: 5, streak: 0 }))).toBe(3);
  });

  it('promotes to tier 3 by streak', () => {
    expect(getTier(PROFILE({ level: 1, streak: 21 }))).toBe(3);
  });
});

describe('roundHuman', () => {
  it('never returns 0 or negative', () => {
    expect(roundHuman(0)).toBeGreaterThan(0);
    expect(roundHuman(-5)).toBeGreaterThan(0);
    expect(roundHuman(NaN)).toBeGreaterThan(0);
  });

  it('rounds small amounts to whole numbers', () => {
    expect(roundHuman(3.67)).toBe(4);
  });

  it('rounds larger amounts to nice steps', () => {
    expect(roundHuman(123)).toBe(120);
    expect(roundHuman(987)).toBe(1000);
  });
});

describe('microAmount', () => {
  it('has a currency-specific fallback', () => {
    expect(microAmount('JPY')).toBeGreaterThan(microAmount('USD'));
  });

  it('falls back to a default for an unlisted currency', () => {
    expect(microAmount('XYZ')).toBeGreaterThan(0);
  });
});

describe('buildMissionContext', () => {
  it('computes today/this-week deposit and expense sums', () => {
    const goals = [
      GOAL({
        deposits: [
          { date: '2026-08-15', amount: 10 },
          { date: '2026-08-11', amount: 20 }, // this week (Monday 2026-08-10)
          { date: '2026-08-01', amount: 999 }, // outside the window
        ],
      }),
    ];
    const expenses = [
      { amount: 5, date: '2026-08-15' },
      { amount: 7, date: '2026-08-12' }, // this week
      { amount: 50, date: '2026-08-05' }, // last week
      { amount: 999, date: '2026-07-01' }, // neither
    ];
    const ctx = buildMissionContext({ goals, profile: PROFILE(), expenses, today: '2026-08-15' });

    expect(ctx.weekStart).toBe('2026-08-10');
    expect(ctx.depositsToday).toBe(10);
    expect(ctx.depositsThisWeek).toBe(30);
    expect(ctx.expensesToday).toHaveLength(1);
    expect(ctx.expensesThisWeek).toHaveLength(2);
    expect(ctx.expensesLastWeek).toEqual([{ amount: 50, date: '2026-08-05' }]);
    expect(ctx.dailyTarget).toBe(10); // 300/30
  });

  it('handles a user with no goals and no expenses', () => {
    const ctx = buildMissionContext({ goals: [], profile: PROFILE(), expenses: [], today: '2026-08-15' });
    expect(ctx.dailyTarget).toBe(0);
    expect(ctx.depositsToday).toBe(0);
    expect(ctx.expensesToday).toEqual([]);
  });
});

describe('catalog verifiers are total', () => {
  const emptyCtx = ctxFrom({ goals: [], expenses: [] });

  it('never throws on an empty context', () => {
    for (const def of MISSION_CATALOG) {
      const verify = def.verify;
      if (verify === 'manual') continue;
      expect(() => verify(emptyCtx)).not.toThrow();
    }
  });

  it('eligible() never throws on an empty context', () => {
    for (const def of MISSION_CATALOG) {
      if (!def.eligible) continue;
      expect(() => def.eligible!(emptyCtx)).not.toThrow();
    }
  });

  it('amount() never throws on an empty context', () => {
    for (const def of MISSION_CATALOG) {
      if (!def.amount) continue;
      expect(() => def.amount!(emptyCtx)).not.toThrow();
      expect(def.amount!(emptyCtx)).toBeGreaterThan(0);
    }
  });
});

describe('deposit-based missions require an active goal', () => {
  const ctxNoGoals = ctxFrom({ goals: [] });
  const depositMissionIds = ['save-today', 'save-this-week', 'save-1.5x-target', 'save-almost-bought',
    'save-20-percent-over', 'save-2x-target', 'two-deposits-today', 'push-goal-ten-percent'];

  it('are ineligible with zero goals', () => {
    for (const id of depositMissionIds) {
      const def = MISSION_CATALOG.find((d) => d.id === id)!;
      expect(def.eligible?.(ctxNoGoals)).not.toBe(true);
    }
  });

  it('become eligible once an active goal exists', () => {
    const ctxWithGoal = ctxFrom({ goals: [GOAL()] });
    const def = MISSION_CATALOG.find((d) => d.id === 'save-today')!;
    expect(def.eligible?.(ctxWithGoal)).toBe(true);
  });

  it('an archived-only goal does not count as active', () => {
    const ctxArchived = ctxFrom({ goals: [GOAL({ archived: true })] });
    const def = MISSION_CATALOG.find((d) => d.id === 'save-today')!;
    expect(def.eligible?.(ctxArchived)).not.toBe(true);
  });
});

describe('first-goal mission', () => {
  it('is only offered with zero goals', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'first-goal')!;
    expect(def.eligible?.(ctxFrom({ goals: [] }))).toBe(true);
    expect(def.eligible?.(ctxFrom({ goals: [GOAL()] }))).toBe(false);
  });

  it('verifies as soon as a goal exists', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'first-goal')!;
    const verify = def.verify as (ctx: MissionContext) => boolean;
    expect(verify(ctxFrom({ goals: [GOAL()] }))).toBe(true);
    expect(verify(ctxFrom({ goals: [] }))).toBe(false);
  });
});

describe('hit-daily-target', () => {
  const def = MISSION_CATALOG.find((d) => d.id === 'hit-daily-target')!;
  const verify = def.verify as (ctx: MissionContext) => boolean;

  it('requires a positive daily target to be eligible', () => {
    expect(def.eligible?.(ctxFrom({ goals: [] }))).toBe(false);
    expect(def.eligible?.(ctxFrom({ goals: [GOAL()] }))).toBe(true);
  });

  it('verifies once deposits meet the target', () => {
    const goal = GOAL({ deposits: [{ date: '2026-08-15', amount: 10 }] }); // target = 10/day
    expect(verify(ctxFrom({ goals: [goal] }))).toBe(true);
  });

  it('does not verify below the target', () => {
    const goal = GOAL({ deposits: [{ date: '2026-08-15', amount: 5 }] });
    expect(verify(ctxFrom({ goals: [goal] }))).toBe(false);
  });
});

describe('beat-last-week', () => {
  const def = MISSION_CATALOG.find((d) => d.id === 'beat-last-week')!;
  const verify = def.verify as (ctx: MissionContext) => boolean;

  it('requires expense history from last week to be eligible', () => {
    expect(def.eligible?.(ctxFrom({ expenses: [] }))).toBe(false);
    expect(def.eligible?.(ctxFrom({ expenses: [{ amount: 10, date: '2026-08-05' }] }))).toBe(true);
  });

  it('verifies when this week is cheaper', () => {
    const expenses = [
      { amount: 100, date: '2026-08-05' }, // last week
      { amount: 40, date: '2026-08-12' }, // this week
    ];
    expect(verify(ctxFrom({ expenses }))).toBe(true);
  });

  it('does not verify when this week is not cheaper', () => {
    const expenses = [
      { amount: 40, date: '2026-08-05' },
      { amount: 100, date: '2026-08-12' },
    ];
    expect(verify(ctxFrom({ expenses }))).toBe(false);
  });
});

describe('push-goal-ten-percent', () => {
  const def = MISSION_CATALOG.find((d) => d.id === 'push-goal-ten-percent')!;
  const verify = def.verify as (ctx: MissionContext) => boolean;

  it('verifies when a deposit this week crosses a new 10% band', () => {
    // Was at 22% (220/1000) before this week's +30 deposit -> now 25%; both floor(2.2)=2 -> not crossed
    // Use numbers that clearly cross a band: 85 -> 250 crosses 0->2 tenths.
    const goal = GOAL({
      targetAmount: 1000,
      savedAmount: 250,
      deposits: [{ date: '2026-08-12', amount: 250 }], // all of it deposited this week
    });
    expect(verify(ctxFrom({ goals: [goal] }))).toBe(true);
  });

  it('does not verify when staying within the same band', () => {
    const goal = GOAL({
      targetAmount: 1000,
      savedAmount: 205,
      deposits: [{ date: '2026-08-12', amount: 5 }], // 200 -> 205, same tenth
    });
    expect(verify(ctxFrom({ goals: [goal] }))).toBe(false);
  });

  it('ignores archived goals', () => {
    const goal = GOAL({
      archived: true,
      targetAmount: 1000,
      savedAmount: 250,
      deposits: [{ date: '2026-08-12', amount: 250 }],
    });
    expect(verify(ctxFrom({ goals: [goal] }))).toBe(false);
  });
});

describe('add-second-goal', () => {
  const def = MISSION_CATALOG.find((d) => d.id === 'add-second-goal')!;

  it('is only offered with exactly one active goal', () => {
    expect(def.eligible?.(ctxFrom({ goals: [] }))).toBe(false);
    expect(def.eligible?.(ctxFrom({ goals: [GOAL({ id: 'a' })] }))).toBe(true);
    expect(def.eligible?.(ctxFrom({ goals: [GOAL({ id: 'a' }), GOAL({ id: 'b' })] }))).toBe(false);
  });
});

describe('renderMissionCopy', () => {
  const fmt = (n: number) => `$${n}`;

  it('substitutes the {amount} placeholder', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'save-today')!;
    const ctx = ctxFrom({ goals: [GOAL()] });
    const copy = renderMissionCopy(def, ctx, fmt);
    expect(copy.title).not.toContain('{amount}');
    expect(copy.title).toContain('$');
    expect(copy.amount).toBeGreaterThan(0);
  });

  it('leaves titles without a placeholder untouched', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'skip-coffee')!;
    const ctx = ctxFrom({});
    const copy = renderMissionCopy(def, ctx, fmt);
    expect(copy.title).toBe('Skip a coffee');
    expect(copy.amount).toBeNull();
  });
});

describe('getMissionProgress', () => {
  it('returns null for defs with no natural running total', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'skip-coffee')!; // manual
    expect(getMissionProgress(def, ctxFrom({}))).toBeNull();

    const firstGoal = MISSION_CATALOG.find((d) => d.id === 'first-goal')!;
    expect(getMissionProgress(firstGoal, ctxFrom({ goals: [] }))).toBeNull();

    const beatLastWeek = MISSION_CATALOG.find((d) => d.id === 'beat-last-week')!;
    expect(getMissionProgress(beatLastWeek, ctxFrom({}))).toBeNull();
  });

  it('reports a currency amount progress for save-today', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'save-today')!;
    const goal = GOAL({ deposits: [{ date: '2026-08-15', amount: 3 }] });
    const progress = getMissionProgress(def, ctxFrom({ goals: [goal] }))!;
    expect(progress.isCurrency).toBe(true);
    expect(progress.current).toBe(3);
    expect(progress.target).toBeGreaterThan(0);
  });

  it('reports a count progress for log-five-expenses', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'log-five-expenses')!;
    const expenses = [
      { amount: 5, date: '2026-08-11' },
      { amount: 5, date: '2026-08-12' },
    ];
    const progress = getMissionProgress(def, ctxFrom({ expenses }))!;
    expect(progress).toEqual({ current: 2, target: 5, isCurrency: false });
  });

  it('reports streak progress for streak-seven', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'streak-seven')!;
    const progress = getMissionProgress(def, ctxFrom({ profile: PROFILE({ streak: 4 }) }))!;
    expect(progress).toEqual({ current: 4, target: 7, isCurrency: false });
  });

  it('reports active-goal-count progress for add-second-goal', () => {
    const def = MISSION_CATALOG.find((d) => d.id === 'add-second-goal')!;
    const progress = getMissionProgress(def, ctxFrom({ goals: [GOAL()] }))!;
    expect(progress).toEqual({ current: 1, target: 2, isCurrency: false });
  });

  it('never throws across the whole catalog on an empty context', () => {
    const emptyCtx = ctxFrom({ goals: [], expenses: [] });
    for (const def of MISSION_CATALOG) {
      expect(() => getMissionProgress(def, emptyCtx)).not.toThrow();
    }
  });
});

describe('selectMissions', () => {
  const ctxWithGoal = ctxFrom({ goals: [GOAL()] });

  it('is deterministic for the same period', () => {
    const a = selectMissions(ctxWithGoal, { cadence: 'daily', count: 3, periodKey: '2026-08-15' });
    const b = selectMissions(ctxWithGoal, { cadence: 'daily', count: 3, periodKey: '2026-08-15' });
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
  });

  it('differs across periods', () => {
    const results = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const picked = selectMissions(ctxWithGoal, {
        cadence: 'daily',
        count: 3,
        periodKey: `2026-08-${10 + i}`,
      });
      results.add(picked.map((d) => d.id).join(','));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('always returns exactly `count` when the catalog can support it', () => {
    for (let i = 0; i < 10; i++) {
      const picked = selectMissions(ctxWithGoal, {
        cadence: 'daily',
        count: 3,
        periodKey: `seed-${i}`,
      });
      expect(picked).toHaveLength(3);
    }
  });

  it('never repeats an id within one selection', () => {
    for (let i = 0; i < 10; i++) {
      const picked = selectMissions(ctxWithGoal, {
        cadence: 'weekly',
        count: 3,
        periodKey: `w-${i}`,
      });
      expect(new Set(picked.map((d) => d.id)).size).toBe(picked.length);
    }
  });

  it('a level-1 user never draws a tier-3 mission', () => {
    const ctx = ctxFrom({ goals: [GOAL()], profile: PROFILE({ level: 1, streak: 0 }) });
    for (let i = 0; i < 20; i++) {
      const picked = selectMissions(ctx, { cadence: 'daily', count: 3, periodKey: `t1-${i}` });
      expect(picked.every((d) => d.tier < 3)).toBe(true);
    }
  });

  it('a tier-3 user can draw any tier', () => {
    const ctx = ctxFrom({ goals: [GOAL()], profile: PROFILE({ level: 5, streak: 30 }) });
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const picked = selectMissions(ctx, { cadence: 'daily', count: 3, periodKey: `t3-${i}` });
      picked.forEach((d) => seen.add(d.tier));
    }
    expect(seen.has(1)).toBe(true);
  });

  it('caps manual missions at maxManual within one selection', () => {
    for (let i = 0; i < 15; i++) {
      const picked = selectMissions(ctxWithGoal, { cadence: 'daily', count: 3, periodKey: `m-${i}` });
      const manualCount = picked.filter((d) => d.verify === 'manual').length;
      expect(manualCount).toBeLessThanOrEqual(1);
    }
  });

  it('excludes recentIds on the first pass when enough alternatives exist', () => {
    const ctx = ctxFrom({ goals: [GOAL()], profile: PROFILE({ level: 5, streak: 30 }) });
    const first = selectMissions(ctx, { cadence: 'daily', count: 3, periodKey: 'r1' });
    const recentIds = first.map((d) => d.id);
    const second = selectMissions(ctx, { cadence: 'daily', count: 3, periodKey: 'r2', recentIds });
    // At tier 3 there are enough daily defs that recent exclusion should bite.
    const overlap = second.filter((d) => recentIds.includes(d.id));
    expect(overlap.length).toBeLessThan(second.length);
  });

  it('never returns an empty set, even with no eligible goal-dependent missions', () => {
    const ctxNoGoals = ctxFrom({ goals: [] });
    const picked = selectMissions(ctxNoGoals, { cadence: 'daily', count: 3, periodKey: 'empty' });
    expect(picked.length).toBe(3);
  });

  it('never returns an empty weekly set for a brand-new user', () => {
    const ctxNoGoals = ctxFrom({ goals: [], profile: PROFILE({ level: 1, streak: 0 }) });
    const picked = selectMissions(ctxNoGoals, { cadence: 'weekly', count: 1, periodKey: 'empty-week' });
    expect(picked.length).toBe(1);
  });
});

describe('compliance: no mission requires spending money', () => {
  const BANNED = /\b(buy|purchase|spend \$|minimum spend)\b/i;

  it('scans every catalog entry for spend-inducing language', () => {
    for (const def of MISSION_CATALOG) {
      expect(BANNED.test(def.title)).toBe(false);
      expect(BANNED.test(def.description)).toBe(false);
    }
  });
});
