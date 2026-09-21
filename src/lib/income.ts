/**
 * Multiple income sources (#191). Pure and store-free — same rationale as
 * `goalMath.ts`/`deposits.ts`: `store.ts` pulls in AsyncStorage/react-native
 * and doesn't resolve under vitest, so anything worth unit-testing lives here
 * instead and `store.ts` re-exports what it needs.
 *
 * Replaces the old `UserProfile.monthlyIncome: number | null` scalar. Everyone
 * gets 1 source; Family gets up to 3 (`PLAN_CONFIG.family.quotas.incomes`,
 * entitlements.ts) — the limit itself is enforced by the UI gating layer, not
 * here.
 */

export interface IncomeSource {
  id: string;
  /** Shown for every tier (decision D4) — an unlabelled number reads worse
   * than "Salary", and it removes a migration seam on upgrade. */
  label: string;
  amount: number;
  /**
   * Monthly amount the user wants to set aside from this source. null means
   * "not set" — distinct from 0, which would be a deliberate "don't count
   * this source toward savings capacity" (decision D2).
   */
  saveAmount: number | null;
  /** Excluded from every active total (C7) but never deleted (C4) — set by
   * downgrade retention (Phase 9), never by the user directly. */
  archived?: boolean;
}

/** Active (non-archived) sources only — the only ones that count toward totals and quota (C7). */
export function activeIncomes(incomes: IncomeSource[]): IncomeSource[] {
  return incomes.filter((i) => !i.archived);
}

/** Sum of active incomes' amounts. */
export function totalIncome(incomes: IncomeSource[]): number {
  return activeIncomes(incomes).reduce((sum, i) => sum + i.amount, 0);
}

/**
 * Sum of active incomes' set-aside amounts — the user's declared monthly
 * savings capacity (decision D2). A null saveAmount contributes 0, same as an
 * unset value never having been declared.
 */
export function totalSaveAside(incomes: IncomeSource[]): number {
  return activeIncomes(incomes).reduce((sum, i) => sum + (i.saveAmount ?? 0), 0);
}

/** Builds a new income source with a random id, mirroring how goals/expenses mint ids elsewhere in the app. */
export function makeIncome(input: { label: string; amount: number; saveAmount?: number | null }): IncomeSource {
  return {
    id: Math.random().toString(36).substring(7),
    label: input.label,
    amount: input.amount,
    saveAmount: input.saveAmount ?? null,
  };
}
