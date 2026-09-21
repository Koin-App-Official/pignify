/**
 * Pure currency-conversion math. Extracted from `store.ts` so this is
 * unit-testable — same reason `deposits.ts` and `goalMath.ts` stand alone
 * (see `deposits.ts`'s header): `store.ts` pulls in AsyncStorage and doesn't
 * resolve under vitest.
 *
 * Structural subset types instead of importing `UserProfile`/`Goal` from
 * `store.ts` — that module imports this one, and the reverse import would be
 * circular.
 *
 * Rounding: always up (ceiling), to 2 decimal places. There's no existing
 * per-currency decimal-places table in the codebase (`formatMoney` just
 * strips trailing zeros generically), so this doesn't invent one. Rounding
 * up rather than to-nearest is deliberate — it never understates a
 * converted goal target or income figure by a fraction of a unit.
 */

export interface ConvertibleIncome {
  amount: number;
  saveAmount: number | null;
}

export interface ConvertibleProfile {
  incomes: ConvertibleIncome[];
  monthlyContribution: number | null;
  estimatedMonthlySavings: number | null;
  expenses: { amount: number }[];
}

export interface ConvertibleGoal {
  targetAmount: number;
  savedAmount: number;
  monthlyContribution?: number;
  deposits: { date: string; amount: number }[];
}

export function convertAmount(amount: number, rate: number): number {
  return Math.ceil(amount * rate * 100) / 100;
}

export function convertProfileAmounts<T extends ConvertibleProfile>(profile: T, rate: number): T {
  return {
    ...profile,
    incomes: profile.incomes.map((i) => ({
      ...i,
      amount: convertAmount(i.amount, rate),
      saveAmount: i.saveAmount == null ? null : convertAmount(i.saveAmount, rate),
    })),
    monthlyContribution:
      profile.monthlyContribution == null ? null : convertAmount(profile.monthlyContribution, rate),
    estimatedMonthlySavings:
      profile.estimatedMonthlySavings == null ? null : convertAmount(profile.estimatedMonthlySavings, rate),
    expenses: profile.expenses.map((e) => ({ ...e, amount: convertAmount(e.amount, rate) })),
  };
}

export function convertGoalAmounts<T extends ConvertibleGoal>(goals: T[], rate: number): T[] {
  return goals.map((g) => ({
    ...g,
    targetAmount: convertAmount(g.targetAmount, rate),
    savedAmount: convertAmount(g.savedAmount, rate),
    monthlyContribution:
      g.monthlyContribution == null ? g.monthlyContribution : convertAmount(g.monthlyContribution, rate),
    deposits: g.deposits.map((d) => ({ ...d, amount: convertAmount(d.amount, rate) })),
  }));
}

/**
 * True if there's anything for a currency switch to convert. Used to skip
 * the convert-vs-relabel modal entirely when a profile has no monetary data
 * yet — nothing to ask the user about.
 */
export function hasConvertibleMonetaryData(profile: ConvertibleProfile, goals: ConvertibleGoal[]): boolean {
  if (profile.incomes.length > 0 || profile.monthlyContribution || profile.estimatedMonthlySavings) return true;
  if (profile.expenses.length > 0) return true;
  return goals.some(
    (g) => g.targetAmount > 0 || g.savedAmount > 0 || (g.monthlyContribution ?? 0) > 0 || g.deposits.length > 0
  );
}
