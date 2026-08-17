/**
 * Piggy's language, as opposed to `country`/`currency` in the store — a
 * Polish speaker in the UK still wants `pl` copy with `GBP` amounts, so this
 * is intentionally independent of the existing localization step's picks
 * (see implementations/I18N_PL.md).
 */
export type SupportedLanguage = 'en' | 'pl';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'pl'];

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
 * module just to be unit-tested).
 */
export function detectDeviceLanguage(): SupportedLanguage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    const Localization = require('expo-localization');
    const languageCode = Localization.getLocales()[0]?.languageCode;
    return languageCode === 'pl' ? 'pl' : 'en';
  } catch {
    return 'en';
  }
}
