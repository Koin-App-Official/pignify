/**
 * Piggy's language, as opposed to `country`/`currency` in the store — a
 * Polish speaker in the UK still wants `pl` copy with `GBP` amounts, so this
 * is intentionally independent of the existing localization step's picks
 * (see implementations/I18N_PL.md).
 */
export type SupportedLanguage = 'en' | 'pl';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'pl'];

/**
 * Matches a raw device language code against `SUPPORTED_LANGUAGES` — a
 * lookup, not a hardcoded `=== 'pl'` ternary (Phase 7,
 * implementations/I18N_SCALE.md), so a language added to
 * `SUPPORTED_LANGUAGES` is picked up here automatically. Extracted as its
 * own pure function so it's directly unit-testable: `expo-localization`
 * itself isn't available under vitest at all (see `detectDeviceLanguage`
 * below), so exercising regional-tag/unsupported-code handling requires
 * something that doesn't need the native module to be loaded.
 *
 * expo-localization's own `languageCode` is already documented to exclude
 * the region (`'de-AT'`'s `languageCode` is `'de'`, not `'de-AT'` —
 * `languageTag` carries the region instead), so the `.split('-')[0]` below
 * is defensive rather than load-bearing against that one API today — it's
 * what keeps this correct if a caller ever passes a full tag instead.
 */
export function matchSupportedLanguage(languageCode: string | null | undefined): SupportedLanguage {
  const base = languageCode?.split('-')[0];
  const supported = SUPPORTED_LANGUAGES as readonly string[];
  return base && supported.includes(base) ? (base as SupportedLanguage) : 'en';
}

/**
 * Maps the device's primary locale to one of the languages Piggy ships.
 * Only consulted for brand-new profiles (`DEFAULT_PROFILE`, store.ts) —
 * existing installs are backfilled to 'en' by the v4→v5 migration instead of
 * device-detected, so an app update never silently changes a returning
 * user's language (see implementations/I18N_PL.md's Decisions).
 *
 * Lazily requires expo-localization rather than importing it at module scope:
 * this function is called from store.ts's DEFAULT_PROFILE, which is
 * evaluated at import time under vitest too (store.ts itself isn't
 * vitest-importable, but this module is, and shouldn't drag in a native
 * module just to be unit-tested). `expo-localization` genuinely doesn't
 * resolve under vitest at all — there's no native module registry — so this
 * whole function always falls through to `catch` in tests; `matchSupportedLanguage`
 * above is what's actually exercised there.
 */
export function detectDeviceLanguage(): SupportedLanguage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    const Localization = require('expo-localization');
    return matchSupportedLanguage(Localization.getLocales()[0]?.languageCode);
  } catch {
    return 'en';
  }
}
