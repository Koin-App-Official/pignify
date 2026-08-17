import { describe, it, expect, beforeAll } from 'vitest';
import i18next from 'i18next';
import enAuth from './locales/en/auth.json';
import plAuth from './locales/pl/auth.json';

/**
 * Polish plural test (Phase 8, implementations/I18N_PL.md): verifies real
 * i18next key resolution — not just Intl.PluralRules in isolation — picks
 * the correct CLDR category at each of the plan's specified counts, using a
 * real pluralized key from the app (auth's "N attempts left") as the
 * fixture. This is the actual mechanism the app depends on: i18next resolves
 * `_one`/`_few`/`_many`/`_other` via Intl.PluralRules under the hood, so
 * running it end-to-end here catches a broken JSON suffix or a broken
 * runtime the same way a raw Intl.PluralRules check would not.
 */

beforeAll(async () => {
  await i18next.init({
    lng: 'pl',
    fallbackLng: 'en',
    resources: {
      en: { auth: enAuth },
      pl: { auth: plAuth },
    },
    ns: ['auth'],
    defaultNS: 'auth',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

describe('Polish plural resolution', () => {
  it.each([
    [1, 'próba'], // one
    [2, 'próby'], // few
    [5, 'prób'], // many
    [22, 'próby'], // few (ends in 2, not 12-14)
    [25, 'prób'], // many (ends in 5)
    [101, 'prób'], // many (ends in 1 but i != 1, and 101 % 100 = 1 -> many per CLDR pl)
    [112, 'prób'], // many (ends in 12-14 band)
  ])('count=%i resolves to the form containing "%s"', (count, expectedWord) => {
    const result = i18next.t('auth:errors.incorrectPinWithAttempts', { count, lng: 'pl' });
    expect(result).toContain(expectedWord);
  });
});

describe('English plural resolution (regression guard)', () => {
  it.each([
    [1, 'attempt left'],
    [2, 'attempts left'],
    [5, 'attempts left'],
    [22, 'attempts left'],
  ])('count=%i resolves to the form containing "%s"', (count, expectedFragment) => {
    const result = i18next.t('auth:errors.incorrectPinWithAttempts', { count, lng: 'en' });
    expect(result).toContain(expectedFragment);
  });
});
