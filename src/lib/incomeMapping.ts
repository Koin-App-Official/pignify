/**
 * Pure client-row <-> server-row mapping for income sources (#191 Phase 5).
 *
 * Kept separate from incomeSync.ts (which does the actual Appwrite I/O) for
 * the same reason storeMigrations.ts is split from store.ts: incomeSync.ts
 * transitively pulls in react-native (via appwrite.ts -> react-native-appwrite),
 * which fails to parse under vitest ("Flow is not supported" on
 * node_modules/react-native/index.js), so anything worth unit-testing has to
 * live somewhere that doesn't import it. `Models` is imported type-only —
 * erased at compile time, so it doesn't drag react-native-appwrite's runtime
 * in either (verified: a type-only import of it loads fine under vitest,
 * unlike a value import of anything from that package).
 *
 * Money as integer cents server-side, floats client-side (schema.mjs) —
 * conversion happens here, at the sync boundary, both ways. Same rounding
 * convention as currencyConversion.ts's callers: amounts are already rounded
 * client-side (the currency input, or Math.round in the store), so plain
 * Math.round here is just a defensive rounding of whatever floating-point
 * noise multiplication introduces, not a meaningful business rounding rule.
 */
import type { Models } from 'react-native-appwrite';
import type { IncomeSource } from './income';

/** A row as the `incomes` table returns it (schema.mjs / Phase 3's save_amount_cents). */
export type ServerIncomeRow = Models.DefaultRow & {
  label?: string | null;
  amount_cents: number;
  save_amount_cents?: number | null;
  archived?: boolean;
};

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** Maps a server `incomes` row to the client's IncomeSource shape. */
export function toClientIncome(row: ServerIncomeRow): IncomeSource {
  return {
    id: row.$id,
    label: row.label ?? '',
    amount: centsToAmount(row.amount_cents),
    saveAmount: row.save_amount_cents != null ? centsToAmount(row.save_amount_cents) : null,
    archived: row.archived ?? false,
  };
}

/**
 * Maps a client IncomeSource to the `incomes` table's write shape. Excludes
 * `created_at` and row permissions — those are incomeSync.ts's job (creation
 * time and ownership aren't derivable from an IncomeSource alone).
 */
export function toServerIncomeData(userId: string, income: IncomeSource) {
  return {
    user_id: userId,
    label: income.label,
    amount_cents: amountToCents(income.amount),
    save_amount_cents: income.saveAmount != null ? amountToCents(income.saveAmount) : null,
    archived: income.archived ?? false,
  };
}
