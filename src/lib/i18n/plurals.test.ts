import { describe, it, expect, beforeAll } from 'vitest';
import i18next from 'i18next';
import enAuth from './locales/en/auth.json';
import plAuth from './locales/pl/auth.json';
import huAuth from './locales/hu/auth.json';
import deAuth from './locales/de/auth.json';
import type { SupportedLanguage } from './detect';

/**
 * Real i18next plural resolution (originally Phase 8, implementations/I18N_PL.md;
 * table-driven per locale in Phase 2, implementations/I18N_SCALE.md) — not
 * just Intl.PluralRules in isolation — using a real pluralized key from the
 * app (auth's "N attempts left") as the fixture. This is the actual
 * mechanism the app depends on: i18next resolves `_one`/`_few`/`_many`/`_other`
 * via Intl.PluralRules under the hood, so running it end-to-end here catches
 * a broken JSON suffix or a broken runtime the same way a raw
 * Intl.PluralRules check would not.
 *
 * `CASES` is keyed by `SupportedLanguage`, so a locale added to `detect.ts`
 * without a fixture row here is a type error — the same guardrail shape as
 * Phase 1's `resources`/`PLURAL_LOCALE_DATA`, applied to this test instead of
 * being a copy-pasted `describe` block per locale.
 */
const CASES: Record<SupportedLanguage, Array<[count: number, expectedFragment: string]>> = {
  en: [
    [1, 'attempt left'],
    [2, 'attempts left'],
    [5, 'attempts left'],
    [22, 'attempts left'],
  ],
  pl: [
    [1, 'próba'], // one
    [2, 'próby'], // few
    [5, 'prób'], // many
    [22, 'próby'], // few (ends in 2, not 12-14)
    [25, 'prób'], // many (ends in 5)
    [101, 'prób'], // many (ends in 1 but i != 1, and 101 % 100 = 1 -> many per CLDR pl)
    [112, 'prób'], // many (ends in 12-14 band)
  ],
  // CLDR hu has just {one, other} (one: n=1; other: everything else) — and
  // Hungarian keeps the noun singular after a numeral, so unlike pl's three
  // visibly different suffix forms, hu's _one/_other copy is deliberately
  // near-identical text (see hu/auth.json). The fixture still exercises the
  // real i18next/Intl.PluralRules resolution end to end, same as every other
  // locale here — it just doesn't happen to change the wording much.
  hu: [
    [1, 'próbálkozásod van'], // one
    [2, 'próbálkozásod van'], // other
    [5, 'próbálkozásod van'], // other
    [22, 'próbálkozásod van'], // other
  ],
  // CLDR de is also just {one, other}, but unlike hu, German pluralizes the
  // noun normally after a numeral — "1 Versuch" vs "2/5/22 Versuche" — so
  // the _one/_other forms are genuinely distinct text, not near-identical
  // like hu's (see de/auth.json).
  de: [
    [1, 'Versuch übrig'], // one
    [2, 'Versuche übrig'], // other
    [5, 'Versuche übrig'], // other
    [22, 'Versuche übrig'], // other
  ],
};

beforeAll(async () => {
  await i18next.init({
    lng: 'pl',
    fallbackLng: 'en',
    resources: {
      en: { auth: enAuth },
      pl: { auth: plAuth },
      hu: { auth: huAuth },
      de: { auth: deAuth },
    },
    ns: ['auth'],
    defaultNS: 'auth',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

describe.each(Object.entries(CASES) as [SupportedLanguage, Array<[number, string]>][])(
  '%s plural resolution (auth:errors.incorrectPinWithAttempts)',
  (locale, cases) => {
    it.each(cases)('count=%i resolves to the form containing "%s"', (count, expectedFragment) => {
      const result = i18next.t('auth:errors.incorrectPinWithAttempts', { count, lng: locale });
      expect(result).toContain(expectedFragment);
    });
  }
);
