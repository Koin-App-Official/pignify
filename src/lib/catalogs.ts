/**
 * Static reference catalogs — achievements, goal templates, countries,
 * currencies, expense categories. Extracted out of store.ts (Phase 3,
 * implementations/I18N_SCALE.md) so they're importable under vitest:
 * store.ts pulls in AsyncStorage and expo-notifications, neither of which
 * resolve under vitest (same rationale as missions.ts and lessons.ts), which
 * made these catalogs untestable against `content.json` while they lived
 * there. store.ts re-exports everything here for every existing call site
 * (`@/lib/store`'s `COUNTRIES`/`CURRENCIES`/`EXPENSE_CATEGORIES` imports)
 * to keep working unchanged.
 */

/**
 * `title`/`description` are not stored here (Phase 6,
 * implementations/I18N_SCALE.md) — they live entirely in `content.json`'s
 * `achievements.<id>`, read at render time via
 * `t(\`content:achievements.${id}.title\`)`. Persisted `achievements` state
 * carries the same trimmed shape as of the `v5 → v6` migration
 * (storeMigrations.ts) — `id`/`icon`/`unlocked`/`unlockedAt` are the only
 * fields anything actually reads off it.
 */
export interface Achievement {
  id: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', icon: '🎯', unlocked: false },
  { id: 'a2', icon: '🔥', unlocked: false },
  { id: 'a3', icon: '⚡', unlocked: false },
  { id: 'a4', icon: '🏆', unlocked: false },
  { id: 'a5', icon: '🌱', unlocked: false },
  { id: 'a6', icon: '💪', unlocked: false },
  { id: 'a7', icon: '🚀', unlocked: false },
  { id: 'a8', icon: '👑', unlocked: false },
  { id: 'a9', icon: '📊', unlocked: false },
  { id: 'a10', icon: '⭐', unlocked: false },
  { id: 'a11', icon: '💎', unlocked: false },
  { id: 'a12', icon: '🧠', unlocked: false },
];

// `name` is deliberately absent (Phase 6, implementations/I18N_SCALE.md) —
// display names live entirely in content.json's `goalTemplates.<id>`, keyed
// by `id` alone. Every UI call site already reads `t(`content:goalTemplates.${id}`)`
// or the equivalent, not `.name`.
export const GOAL_TEMPLATES = [
  { id: 'holiday', icon: '✈️', suggestedAmount: 2000 },
  { id: 'concert', icon: '🎵', suggestedAmount: 300 },
  { id: 'car', icon: '🚗', suggestedAmount: 15000 },
  { id: 'emergency', icon: '🛡️', suggestedAmount: 5000 },
  { id: 'laptop', icon: '💻', suggestedAmount: 1500 },
  { id: 'education', icon: '📚', suggestedAmount: 10000 },
  { id: 'apartment', icon: '🏠', suggestedAmount: 20000 },
  { id: 'wedding', icon: '💍', suggestedAmount: 25000 },
  { id: 'trip', icon: '🌍', suggestedAmount: 1000 },
  { id: 'purchase', icon: '🎁', suggestedAmount: 500 },
];

// `name` dropped for the same reason — see `content.json`'s `countries.<code>`.
export const COUNTRIES = [
  { code: 'US', currency: 'USD' },
  { code: 'GB', currency: 'GBP' },
  { code: 'CA', currency: 'CAD' },
  { code: 'AU', currency: 'AUD' },
  { code: 'DE', currency: 'EUR' },
  { code: 'FR', currency: 'EUR' },
  { code: 'ES', currency: 'EUR' },
  { code: 'IT', currency: 'EUR' },
  { code: 'NL', currency: 'EUR' },
  { code: 'IE', currency: 'EUR' },
  { code: 'PT', currency: 'EUR' },
  { code: 'BR', currency: 'BRL' },
  { code: 'MX', currency: 'MXN' },
  { code: 'JP', currency: 'JPY' },
  { code: 'CN', currency: 'CNY' },
  { code: 'IN', currency: 'INR' },
  { code: 'SG', currency: 'SGD' },
  { code: 'CH', currency: 'CHF' },
  { code: 'SE', currency: 'SEK' },
  { code: 'NO', currency: 'NOK' },
  { code: 'DK', currency: 'DKK' },
  { code: 'PL', currency: 'PLN' },
  { code: 'AE', currency: 'AED' },
  { code: 'ZA', currency: 'ZAR' },
  { code: 'NZ', currency: 'NZD' },
];

// `name` dropped for the same reason — see `content.json`'s `currencies.<code>`.
// `symbol`/`symbolAfter` stay: they're formatting data, not copy.
export const CURRENCIES = [
  { code: 'USD', symbol: '$',    symbolAfter: false },
  { code: 'EUR', symbol: '€',    symbolAfter: false },
  { code: 'GBP', symbol: '£',    symbolAfter: false },
  { code: 'CAD', symbol: 'CA$',  symbolAfter: false },
  { code: 'AUD', symbol: 'A$',   symbolAfter: false },
  { code: 'BRL', symbol: 'R$',   symbolAfter: false },
  { code: 'MXN', symbol: 'MX$',  symbolAfter: false },
  { code: 'JPY', symbol: '¥',    symbolAfter: false },
  { code: 'CNY', symbol: '¥',    symbolAfter: false },
  { code: 'INR', symbol: '₹',    symbolAfter: false },
  { code: 'SGD', symbol: 'S$',   symbolAfter: false },
  { code: 'CHF', symbol: 'CHF',  symbolAfter: false },
  { code: 'SEK', symbol: 'kr',   symbolAfter: true  },
  { code: 'NOK', symbol: 'kr',   symbolAfter: true  },
  { code: 'DKK', symbol: 'kr',   symbolAfter: true  },
  { code: 'PLN', symbol: 'zł',   symbolAfter: true  },
  { code: 'AED', symbol: 'د.إ',  symbolAfter: false },
  { code: 'ZAR', symbol: 'R',    symbolAfter: false },
  { code: 'NZD', symbol: 'NZ$',  symbolAfter: false },
];

/**
 * Consolidates what used to be four near-identical
 * `CURRENCIES.find((c) => c.code === code)?.symbol ?? code` helpers
 * (Phase 5, implementations/I18N_SCALE.md — onboarding.tsx, goals.tsx,
 * ContributionStep.tsx, AddExpenseModal.tsx). Returns `symbolAfter` too,
 * which the symbol-only helpers didn't expose — that's what let 4 input
 * affixes hardcode the symbol before the amount regardless of the currency's
 * actual position (PLN's `zł` renders after the number everywhere else).
 */
export function getCurrency(currencyCode: string): { symbol: string; symbolAfter: boolean } {
  const match = CURRENCIES.find((c) => c.code === currencyCode);
  return match ? { symbol: match.symbol, symbolAfter: match.symbolAfter } : { symbol: currencyCode, symbolAfter: false };
}

export function getCurrencySymbol(currencyCode: string): string {
  return getCurrency(currencyCode).symbol;
}

// `name` dropped for the same reason — see `content.json`'s `expenseCategories.<id>`.
export const EXPENSE_CATEGORIES = [
  { id: 'food', icon: '🍔' },
  { id: 'transport', icon: '🚌' },
  { id: 'entertainment', icon: '🎮' },
  { id: 'shopping', icon: '🛍️' },
  { id: 'bills', icon: '📄' },
  { id: 'health', icon: '💊' },
  { id: 'education', icon: '📖' },
  { id: 'other', icon: '📌' },
];
