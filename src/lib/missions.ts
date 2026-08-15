/**
 * Mission catalog, context, tiering, verification and rotation — Phase 1 of
 * Missions v2 (see implementations/MISSIONS.md, issue #64).
 *
 * Deliberately store/React-free, same rationale as goalMath.ts and
 * deposits.ts: store.ts pulls in AsyncStorage and expo-notifications, neither
 * of which resolve under vitest. Phase 2 (#65) wires this into the store.
 *
 * ## Verification classes
 *
 * Piggy is manual-entry only — there is no bank link — so missions split into
 * three classes (see the plan doc):
 *   A. auto-verified — a `verify` function reading MissionContext
 *   B. manual        — `verify === 'manual'`, the user's own word
 *   C. impossible today (round-ups, payday split, debt, investing, ...) — not
 *      represented here at all; see the plan's "explicitly out of scope" list.
 *
 * Class A is the backbone. `selectMissions` caps Class B at one of the three
 * daily slots so an unverifiable checkbox never dominates the surfaced set.
 */

import type { DepositBearingGoal } from './deposits';
import {
  addDaysString,
  getDailySavingsTarget,
  getWeekMondayString,
  normalizeDay,
  sumDepositsForDate,
  sumDepositsSince,
} from './deposits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MissionCategory = 'saving' | 'habit' | 'spending' | 'planning' | 'learning';
export type MissionCadence = 'daily' | 'weekly';
export type MissionTier = 1 | 2 | 3;

/** Structural subset of `Goal` — see the same pattern in deposits.ts, and for
 * the same reason: missions.ts must not import store.ts (store.ts will import
 * this module in Phase 2, and the reverse import would be circular). */
export interface MissionGoal extends DepositBearingGoal {
  id: string;
  targetAmount: number;
  savedAmount: number;
}

/** Structural subset of `Expense`. */
export interface MissionExpense {
  amount: number;
  date: string;
  note?: string;
}

/** The profile fields missions need — never the whole `UserProfile`. */
export interface MissionProfileSlice {
  level: number;
  streak: number;
  monthlyContribution: number | null;
  currency: string;
  lastActiveDate: string;
}

export interface MissionContext {
  today: string;
  weekStart: string;
  goals: MissionGoal[];
  profile: MissionProfileSlice;
  depositsToday: number;
  depositsThisWeek: number;
  expensesToday: MissionExpense[];
  expensesThisWeek: MissionExpense[];
  expensesLastWeek: MissionExpense[];
  dailyTarget: number;
  currency: string;
}

export type MissionVerifier = 'manual' | ((ctx: MissionContext) => boolean);

export interface MissionProgressState {
  current: number;
  target: number;
  /** True when `current`/`target` are a currency amount rather than a count. */
  isCurrency: boolean;
}

export interface MissionDef {
  id: string;
  category: MissionCategory;
  cadence: MissionCadence;
  tier: MissionTier;
  reward: number;
  /** May contain a literal `{amount}` placeholder, resolved by `renderMissionCopy`. */
  title: string;
  description: string;
  /** Present only on missions with a currency-denominated target. */
  amount?: (ctx: MissionContext) => number;
  verify: MissionVerifier;
  /** Gates whether this def is even offered — distinct from `verify` (whether it's DONE). */
  eligible?: (ctx: MissionContext) => boolean;
  /**
   * Present only on missions with a natural numeric progress toward a known
   * target (a running total or count) — omitted for one-shot/comparison
   * verifiers (e.g. "beat last week's spending", "create your first goal")
   * where a progress bar wouldn't mean anything.
   */
  progress?: (ctx: MissionContext) => MissionProgressState;
}

// ---------------------------------------------------------------------------
// Context construction
// ---------------------------------------------------------------------------

export interface MissionContextInput {
  goals: MissionGoal[];
  profile: MissionProfileSlice;
  expenses: MissionExpense[];
  /** Injectable for tests; defaults to the real today. */
  today?: string;
}

function sumExpenseAmounts(expenses: MissionExpense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function buildMissionContext(input: MissionContextInput): MissionContext {
  const today = input.today ?? new Date().toISOString().split('T')[0];
  const weekStart = getWeekMondayString();
  const lastWeekStart = addDaysString(weekStart, -7);

  const expensesToday = input.expenses.filter((e) => normalizeDay(e.date) === today);
  const expensesThisWeek = input.expenses.filter((e) => normalizeDay(e.date) >= weekStart);
  const expensesLastWeek = input.expenses.filter(
    (e) => normalizeDay(e.date) >= lastWeekStart && normalizeDay(e.date) < weekStart
  );

  return {
    today,
    weekStart,
    goals: input.goals,
    profile: input.profile,
    depositsToday: sumDepositsForDate(input.goals, today),
    depositsThisWeek: sumDepositsSince(input.goals, weekStart),
    expensesToday,
    expensesThisWeek,
    expensesLastWeek,
    dailyTarget: getDailySavingsTarget(input.goals),
    currency: input.profile.currency,
  };
}

// ---------------------------------------------------------------------------
// Tier resolution — performance-gated, not calendar-gated.
// ---------------------------------------------------------------------------

export function getTier(profile: MissionProfileSlice): MissionTier {
  if (profile.level >= 5 || profile.streak >= 21) return 3;
  if (profile.level >= 2 || profile.streak >= 7) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Amounts — derived from the user's own contribution, never a hardcoded `$`.
// ---------------------------------------------------------------------------

/**
 * Fallback baseline for users with no goal or skipped income (`dailyTarget ===
 * 0`), so amount-bearing missions still have something sane to ask for. Not
 * an exhaustive per-currency table — deliberately just enough to avoid asking
 * a JPY or INR user to "save 5" when 5 is meaningless in that currency.
 */
const MICRO_AMOUNTS: Record<string, number> = {
  USD: 5, EUR: 5, GBP: 5, CHF: 5, SGD: 5, NZD: 8,
  BRL: 20, PLN: 20, AED: 20, DKK: 30, CNY: 30,
  SEK: 50, NOK: 50, MXN: 100, INR: 300, JPY: 500, ZAR: 80,
};
const DEFAULT_MICRO_AMOUNT = 5;

export function microAmount(currency: string): number {
  return MICRO_AMOUNTS[currency] ?? DEFAULT_MICRO_AMOUNT;
}

/** Round to a "nice" human number — never a raw fraction like 3.67. */
export function roundHuman(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  let unit: number;
  if (n < 10) unit = 1;
  else if (n < 50) unit = 5;
  else if (n < 200) unit = 10;
  else if (n < 1000) unit = 50;
  else unit = 100;
  return Math.max(unit, Math.round(n / unit) * unit);
}

function baselineDaily(ctx: MissionContext): number {
  return ctx.dailyTarget > 0 ? ctx.dailyTarget : microAmount(ctx.currency);
}

/** A daily amount, scaled by `multiplier`, off the user's real target when they have one. */
function dailyAmount(ctx: MissionContext, multiplier: number): number {
  return roundHuman(baselineDaily(ctx) * multiplier);
}

/** A weekly amount — the daily baseline projected over 7 days, scaled. */
function weeklyAmount(ctx: MissionContext, multiplier: number): number {
  return roundHuman(baselineDaily(ctx) * 7 * multiplier);
}

// ---------------------------------------------------------------------------
// Eligibility helpers
// ---------------------------------------------------------------------------

function activeGoals(ctx: MissionContext): MissionGoal[] {
  return ctx.goals.filter((g) => !g.archived);
}

/** Deposit-based missions are only offered when there's somewhere to deposit. */
function hasActiveGoal(ctx: MissionContext): boolean {
  return activeGoals(ctx).length > 0;
}

function hasNoGoals(ctx: MissionContext): boolean {
  return ctx.goals.length === 0;
}

function hasExactlyOneActiveGoal(ctx: MissionContext): boolean {
  return activeGoals(ctx).length === 1;
}

function hasLastWeekExpenses(ctx: MissionContext): boolean {
  return ctx.expensesLastWeek.length > 0;
}

function hasDailyTarget(ctx: MissionContext): boolean {
  return ctx.dailyTarget > 0;
}

// ---------------------------------------------------------------------------
// Verify helpers
// ---------------------------------------------------------------------------

function countDepositsForDate(goals: MissionGoal[], dateStr: string): number {
  return goals.reduce(
    (count, g) => count + (g.deposits ?? []).filter((d) => normalizeDay(d.date) === dateStr).length,
    0
  );
}

function hasExpenseWithNote(expenses: MissionExpense[]): boolean {
  return expenses.some((e) => (e.note ?? '').trim().length > 0);
}

/**
 * True if any active goal crossed a new 10%-completion band within this
 * week — computed from the current snapshot alone (no separate "at week
 * start" state to persist): subtract this week's deposits back out to
 * reconstruct where the goal stood at the start of the week.
 */
function crossedTenPercentBandThisWeek(ctx: MissionContext): boolean {
  return activeGoals(ctx).some((g) => {
    if (g.targetAmount <= 0) return false;
    const depositedThisWeek = (g.deposits ?? [])
      .filter((d) => normalizeDay(d.date) >= ctx.weekStart)
      .reduce((sum, d) => sum + d.amount, 0);
    const fractionNow = g.savedAmount / g.targetAmount;
    const fractionAtWeekStart = (g.savedAmount - depositedThisWeek) / g.targetAmount;
    return Math.floor(fractionNow * 10) > Math.floor(Math.max(0, fractionAtWeekStart) * 10);
  });
}

// ---------------------------------------------------------------------------
// Catalog — Tier 1 (build the habit, guarantee wins)
// ---------------------------------------------------------------------------

const SAVE_TODAY: MissionDef = {
  id: 'save-today',
  category: 'saving',
  cadence: 'daily',
  tier: 1,
  reward: 5,
  title: 'Save {amount} today',
  description: "Move a bit toward your goal — doesn't have to be much.",
  amount: (ctx) => dailyAmount(ctx, 0.5),
  eligible: hasActiveGoal,
  verify: (ctx) => ctx.depositsToday >= dailyAmount(ctx, 0.5),
  progress: (ctx) => ({ current: ctx.depositsToday, target: dailyAmount(ctx, 0.5), isCurrency: true }),
};

const HIT_DAILY_TARGET: MissionDef = {
  id: 'hit-daily-target',
  category: 'saving',
  cadence: 'daily',
  tier: 1,
  reward: 8,
  title: "Hit today's target",
  description: 'Save enough today to stay on pace for your goal.',
  amount: (ctx) => roundHuman(ctx.dailyTarget),
  eligible: hasDailyTarget,
  verify: (ctx) => ctx.depositsToday >= ctx.dailyTarget,
  progress: (ctx) => ({ current: ctx.depositsToday, target: ctx.dailyTarget, isCurrency: true }),
};

const LOG_EXPENSE: MissionDef = {
  id: 'log-expense',
  category: 'habit',
  cadence: 'daily',
  tier: 1,
  reward: 4,
  title: 'Log an expense',
  description: 'Track one thing you spent today.',
  verify: (ctx) => ctx.expensesToday.length >= 1,
};

const CHECK_IN: MissionDef = {
  id: 'check-in',
  category: 'habit',
  cadence: 'daily',
  tier: 1,
  reward: 3,
  title: 'Check in',
  description: 'Open the app and see where you stand.',
  verify: (ctx) => ctx.profile.lastActiveDate === ctx.today,
};

const SKIP_COFFEE: MissionDef = {
  id: 'skip-coffee',
  category: 'spending',
  cadence: 'daily',
  tier: 1,
  reward: 5,
  title: 'Skip a coffee',
  description: 'Make it at home today.',
  verify: 'manual',
};

const NO_SPEND_LUNCH: MissionDef = {
  id: 'no-spend-lunch',
  category: 'spending',
  cadence: 'daily',
  tier: 1,
  reward: 8,
  title: 'No-spend lunch',
  description: 'Pack lunch instead of buying.',
  verify: 'manual',
};

const WALK_INSTEAD: MissionDef = {
  id: 'walk-instead',
  category: 'spending',
  cadence: 'daily',
  tier: 1,
  reward: 3,
  title: 'Walk instead of ride',
  description: 'Save on transport today.',
  verify: 'manual',
};

const COOK_AT_HOME: MissionDef = {
  id: 'cook-at-home',
  category: 'spending',
  cadence: 'daily',
  tier: 1,
  reward: 6,
  title: 'Cook dinner at home',
  description: 'Skip delivery tonight.',
  verify: 'manual',
};

const SAVE_THIS_WEEK: MissionDef = {
  id: 'save-this-week',
  category: 'saving',
  cadence: 'weekly',
  tier: 1,
  reward: 20,
  title: 'Save {amount} this week',
  description: 'A weekly boost toward your goal.',
  amount: (ctx) => weeklyAmount(ctx, 1),
  eligible: hasActiveGoal,
  verify: (ctx) => ctx.depositsThisWeek >= weeklyAmount(ctx, 1),
  progress: (ctx) => ({ current: ctx.depositsThisWeek, target: weeklyAmount(ctx, 1), isCurrency: true }),
};

const FIRST_GOAL: MissionDef = {
  id: 'first-goal',
  category: 'planning',
  cadence: 'weekly',
  tier: 1,
  reward: 25,
  title: 'Set up your first goal',
  description: 'Create a savings goal to get started.',
  eligible: hasNoGoals,
  verify: (ctx) => ctx.goals.length >= 1,
};

const LOG_FIVE_EXPENSES: MissionDef = {
  id: 'log-five-expenses',
  category: 'habit',
  cadence: 'weekly',
  tier: 1,
  reward: 15,
  title: 'Log 5 expenses this week',
  description: 'Build the habit of tracking spending.',
  verify: (ctx) => ctx.expensesThisWeek.length >= 5,
  progress: (ctx) => ({ current: ctx.expensesThisWeek.length, target: 5, isCurrency: false }),
};

const NO_SPEND_WEEKEND: MissionDef = {
  id: 'no-spend-weekend',
  category: 'spending',
  cadence: 'weekly',
  tier: 1,
  reward: 18,
  title: 'No-spend weekend',
  description: 'Keep non-essential spending at zero this weekend.',
  verify: 'manual',
};

// ---------------------------------------------------------------------------
// Catalog — Tier 2 (consistency & first real behaviour change)
// ---------------------------------------------------------------------------

const SAVE_1_5X_TARGET: MissionDef = {
  id: 'save-1.5x-target',
  category: 'saving',
  cadence: 'daily',
  tier: 2,
  reward: 12,
  title: 'Save 1.5× today’s target',
  description: 'Get ahead of pace today.',
  amount: (ctx) => roundHuman(ctx.dailyTarget * 1.5),
  eligible: hasDailyTarget,
  verify: (ctx) => ctx.depositsToday >= ctx.dailyTarget * 1.5,
  progress: (ctx) => ({ current: ctx.depositsToday, target: ctx.dailyTarget * 1.5, isCurrency: true }),
};

const LOG_THREE_EXPENSES: MissionDef = {
  id: 'log-three-expenses',
  category: 'habit',
  cadence: 'daily',
  tier: 2,
  reward: 8,
  title: 'Log every expense today',
  description: 'Track at least 3 things you spent today.',
  verify: (ctx) => ctx.expensesToday.length >= 3,
  progress: (ctx) => ({ current: ctx.expensesToday.length, target: 3, isCurrency: false }),
};

const EXPENSE_WITH_NOTE: MissionDef = {
  id: 'expense-with-note',
  category: 'habit',
  cadence: 'daily',
  tier: 2,
  reward: 5,
  title: 'Add a note to an expense',
  description: 'Give one of today’s expenses some context.',
  verify: (ctx) => hasExpenseWithNote(ctx.expensesToday),
};

const SAVE_ALMOST_BOUGHT: MissionDef = {
  id: 'save-almost-bought',
  category: 'saving',
  cadence: 'daily',
  tier: 2,
  reward: 8,
  title: 'Save what you almost bought',
  description: 'Held off on something you wanted? Move that amount to savings.',
  eligible: hasActiveGoal,
  verify: 'manual',
};

const BEAT_LAST_WEEK: MissionDef = {
  id: 'beat-last-week',
  category: 'planning',
  cadence: 'weekly',
  tier: 2,
  reward: 25,
  title: "Beat last week's spending",
  description: 'Spend less this week than you did last week.',
  eligible: hasLastWeekExpenses,
  verify: (ctx) => sumExpenseAmounts(ctx.expensesThisWeek) < sumExpenseAmounts(ctx.expensesLastWeek),
};

const DINE_OUT_DETOX: MissionDef = {
  id: 'dine-out-detox',
  category: 'spending',
  cadence: 'weekly',
  tier: 2,
  reward: 25,
  title: 'Dine-out detox',
  description: 'Skip eating out this week.',
  verify: 'manual',
};

const CANCEL_SUBSCRIPTION: MissionDef = {
  id: 'cancel-subscription',
  category: 'spending',
  cadence: 'weekly',
  tier: 2,
  reward: 15,
  title: 'Cancel a subscription',
  description: 'Review and cancel one unused subscription.',
  verify: 'manual',
};

const STREAK_SEVEN: MissionDef = {
  id: 'streak-seven',
  category: 'habit',
  cadence: 'weekly',
  tier: 2,
  reward: 30,
  title: 'Hit a 7-day streak',
  description: 'Save toward your target 7 days in a row.',
  verify: (ctx) => ctx.profile.streak >= 7,
  progress: (ctx) => ({ current: ctx.profile.streak, target: 7, isCurrency: false }),
};

const SAVE_20_PERCENT_OVER: MissionDef = {
  id: 'save-20-percent-over',
  category: 'saving',
  cadence: 'weekly',
  tier: 2,
  reward: 25,
  title: 'Save 20% over your weekly target',
  description: 'Push past your usual pace this week.',
  amount: (ctx) => roundHuman(ctx.dailyTarget * 7 * 1.2),
  eligible: hasDailyTarget,
  verify: (ctx) => ctx.depositsThisWeek >= ctx.dailyTarget * 7 * 1.2,
  progress: (ctx) => ({ current: ctx.depositsThisWeek, target: ctx.dailyTarget * 7 * 1.2, isCurrency: true }),
};

// Deferred to Phase 4 (#67): a "today's money quiz" learning mission belongs
// here once lessonsCompleted exists to verify against. Adding a half-wired
// entry now (permanently ineligible) would be dead weight until then.

// ---------------------------------------------------------------------------
// Catalog — Tier 3 (stretch)
//
// XP calibration (Phase 3, #66): daily selection always picks exactly
// DAILY_MISSION_COUNT defs regardless of tier, but weighting biases higher-
// tier users toward higher-tier (higher-reward) defs — so reward growth
// across tiers compounds with that bias rather than adding on top of it.
// The original tier-3 values (up to 50 XP on a single weekly claim) would
// have let a tier-3 user's daily XP pace roughly triple a tier-1 user's,
// well past "harder missions pay a bit more" into "leveling runs away at the
// top" — the opposite of the source report's Duolingo-tier finding (higher
// tiers should feel EARNED, i.e. slower, not faster). Trimmed the standout
// values below rather than touching the flat xp/100 level formula in
// store.ts, which is out of this phase's scope and affects every XP source,
// not just missions.
// ---------------------------------------------------------------------------

const SAVE_2X_TARGET: MissionDef = {
  id: 'save-2x-target',
  category: 'saving',
  cadence: 'daily',
  tier: 3,
  reward: 15, // was 18 — see calibration note above
  title: 'Save 2× today’s target',
  description: 'A serious push today.',
  amount: (ctx) => roundHuman(ctx.dailyTarget * 2),
  eligible: hasDailyTarget,
  verify: (ctx) => ctx.depositsToday >= ctx.dailyTarget * 2,
  progress: (ctx) => ({ current: ctx.depositsToday, target: ctx.dailyTarget * 2, isCurrency: true }),
};

const TWO_DEPOSITS_TODAY: MissionDef = {
  id: 'two-deposits-today',
  category: 'saving',
  cadence: 'daily',
  tier: 3,
  reward: 12, // was 15 — see calibration note above
  title: 'Two deposits today',
  description: 'Save twice today instead of once.',
  eligible: hasActiveGoal,
  verify: (ctx) => countDepositsForDate(ctx.goals, ctx.today) >= 2,
  progress: (ctx) => ({ current: countDepositsForDate(ctx.goals, ctx.today), target: 2, isCurrency: false }),
};

const PANTRY_DAY: MissionDef = {
  id: 'pantry-day',
  category: 'spending',
  cadence: 'daily',
  tier: 3,
  reward: 12,
  title: 'Pantry day',
  description: 'Cook only from what you already have.',
  verify: 'manual',
};

const PUSH_GOAL_TEN_PERCENT: MissionDef = {
  id: 'push-goal-ten-percent',
  category: 'saving',
  cadence: 'weekly',
  tier: 3,
  reward: 28, // was 40 — see calibration note above; no progress bar (band-crossing is a comparison, not a running total)
  title: 'Push your goal to the next 10%',
  description: 'Cross into a new tenth of your goal this week.',
  eligible: hasActiveGoal,
  verify: crossedTenPercentBandThisWeek,
};

const STREAK_THIRTY: MissionDef = {
  id: 'streak-thirty',
  category: 'habit',
  cadence: 'weekly',
  tier: 3,
  reward: 35, // was 50 — see calibration note above
  title: 'Hit a 30-day streak',
  description: 'A full month of hitting your target.',
  verify: (ctx) => ctx.profile.streak >= 30,
  progress: (ctx) => ({ current: ctx.profile.streak, target: 30, isCurrency: false }),
};

/**
 * "Did the contribution change this week" has no auto-detectable signal in
 * this context — that needs a persisted "last changed at" timestamp, which is
 * out of Phase 1 scope. Manual until that field exists.
 */
const REVIEW_CONTRIBUTION: MissionDef = {
  id: 'review-contribution',
  category: 'planning',
  cadence: 'weekly',
  tier: 3,
  reward: 20,
  title: "Review next month's contribution",
  description: 'Check whether your monthly amount still fits.',
  verify: 'manual',
};

const ADD_SECOND_GOAL: MissionDef = {
  id: 'add-second-goal',
  category: 'planning',
  cadence: 'weekly',
  tier: 3,
  reward: 30,
  title: 'Add a second goal',
  description: 'Start saving toward something else too.',
  eligible: hasExactlyOneActiveGoal,
  verify: (ctx) => activeGoals(ctx).length >= 2,
  progress: (ctx) => ({ current: activeGoals(ctx).length, target: 2, isCurrency: false }),
};

const NEGOTIATE_BILL: MissionDef = {
  id: 'negotiate-bill',
  category: 'spending',
  cadence: 'weekly',
  tier: 3,
  reward: 25,
  title: 'Negotiate or downgrade a bill',
  description: 'Call one provider and ask for a better rate.',
  verify: 'manual',
};

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const MISSION_CATALOG: MissionDef[] = [
  // Tier 1
  SAVE_TODAY, HIT_DAILY_TARGET, LOG_EXPENSE, CHECK_IN,
  SKIP_COFFEE, NO_SPEND_LUNCH, WALK_INSTEAD, COOK_AT_HOME,
  SAVE_THIS_WEEK, FIRST_GOAL, LOG_FIVE_EXPENSES, NO_SPEND_WEEKEND,
  // Tier 2
  SAVE_1_5X_TARGET, LOG_THREE_EXPENSES, EXPENSE_WITH_NOTE, SAVE_ALMOST_BOUGHT,
  BEAT_LAST_WEEK, DINE_OUT_DETOX, CANCEL_SUBSCRIPTION, STREAK_SEVEN, SAVE_20_PERCENT_OVER,
  // Tier 3
  SAVE_2X_TARGET, TWO_DEPOSITS_TODAY, PANTRY_DAY,
  PUSH_GOAL_TEN_PERCENT, STREAK_THIRTY, REVIEW_CONTRIBUTION, ADD_SECOND_GOAL, NEGOTIATE_BILL,
];

/** Last-resort picks that are always eligible — the selection floor. */
const SAFE_DEFAULTS: Record<MissionCadence, MissionDef[]> = {
  daily: [SKIP_COFFEE, SAVE_TODAY, LOG_EXPENSE, CHECK_IN],
  weekly: [NO_SPEND_WEEKEND, SAVE_THIS_WEEK, LOG_FIVE_EXPENSES],
};

// ---------------------------------------------------------------------------
// Deterministic selection
// ---------------------------------------------------------------------------

/** FNV-1a — small, dependency-free, good enough for seeding a shuffle. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface SelectMissionsOptions {
  cadence: MissionCadence;
  count: number;
  /** Stable per period, e.g. the day string for daily / the Monday string for weekly. */
  periodKey: string;
  /** Defs assigned recently, excluded on a first pass to avoid immediate repeats. */
  recentIds?: string[];
  /** How many manual (Class B) defs may appear in one selection. Default 1. */
  maxManual?: number;
}

/**
 * Pick `count` defs for one cadence, deterministically for a given
 * `periodKey` — same inputs always produce the same set, so the surfaced
 * missions don't reshuffle on every re-render or app restart within a period.
 *
 * Degrades in stages rather than ever returning fewer than `count` when the
 * catalog has enough defs for this cadence: relax the recent-repeat exclusion,
 * then the manual cap, then the tier ceiling, then fall back to a hardcoded
 * safe set. The screen must never render an empty mission list.
 */
export function selectMissions(ctx: MissionContext, opts: SelectMissionsOptions): MissionDef[] {
  const { cadence, count, periodKey, recentIds = [], maxManual = 1 } = opts;
  const recentSet = new Set(recentIds);
  const currentTier = getTier(ctx.profile);

  const isEligible = (def: MissionDef) => (def.eligible ? def.eligible(ctx) : true);
  const forCadence = (tierCeiling: number) => (def: MissionDef) =>
    def.cadence === cadence && def.tier <= tierCeiling && isEligible(def);

  const pool = MISSION_CATALOG.filter(forCadence(currentTier));

  // Weight toward the user's actual tier (appears twice) so tier-1 "easy win"
  // defs stay in the mix as a guaranteed floor, without dominating the set.
  const weighted: MissionDef[] = [];
  for (const def of pool) {
    weighted.push(def);
    if (def.tier === currentTier) weighted.push(def);
  }

  const seed = `${periodKey}:${cadence}`;
  const shuffled = seededShuffle(weighted, seed);

  const picked: MissionDef[] = [];
  const pickedIds = new Set<string>();
  let manualCount = 0;

  const tryPick = (def: MissionDef, allowManualOverflow: boolean): void => {
    if (picked.length >= count || pickedIds.has(def.id)) return;
    const isManual = def.verify === 'manual';
    if (isManual && manualCount >= maxManual && !allowManualOverflow) return;
    picked.push(def);
    pickedIds.add(def.id);
    if (isManual) manualCount++;
  };

  // Pass 1: exclude recent repeats, respect the manual cap.
  for (const def of shuffled) {
    if (recentSet.has(def.id)) continue;
    tryPick(def, false);
  }
  // Pass 2: allow recent repeats back in, still respect the manual cap.
  if (picked.length < count) {
    for (const def of shuffled) tryPick(def, false);
  }
  // Pass 3: relax the manual cap too.
  if (picked.length < count) {
    for (const def of shuffled) tryPick(def, true);
  }
  // Pass 4: relax the tier ceiling — any-tier eligible defs for this cadence.
  if (picked.length < count) {
    const anyTier = MISSION_CATALOG.filter(
      (def) => def.cadence === cadence && isEligible(def)
    );
    for (const def of seededShuffle(anyTier, `${seed}:fallback`)) tryPick(def, true);
  }
  // Pass 5: hardcoded safe defaults, ignoring eligibility entirely.
  if (picked.length < count) {
    for (const def of SAFE_DEFAULTS[cadence]) tryPick(def, true);
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Rendering helper — kept pure (no store import) by accepting the formatter.
// ---------------------------------------------------------------------------

export interface MissionCopy {
  title: string;
  description: string;
  amount: number | null;
}

/** Resolve a def's `{amount}` placeholder via an injected formatter (e.g. `formatCurrency`). */
export function renderMissionCopy(
  def: MissionDef,
  ctx: MissionContext,
  formatAmount: (n: number) => string
): MissionCopy {
  const amount = def.amount ? def.amount(ctx) : null;
  const title = amount != null ? def.title.replace('{amount}', formatAmount(amount)) : def.title;
  return { title, description: def.description, amount };
}

/** Progress toward a def's target, or null for defs with no natural running total (see `MissionDef.progress`). */
export function getMissionProgress(def: MissionDef, ctx: MissionContext): MissionProgressState | null {
  return def.progress ? def.progress(ctx) : null;
}
