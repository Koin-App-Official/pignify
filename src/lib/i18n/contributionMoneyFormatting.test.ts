import { describe, it, expect, beforeAll } from 'vitest';
import i18next from 'i18next';
import enOnboarding from './locales/en/onboarding.json';
import plOnboarding from './locales/pl/onboarding.json';
import huOnboarding from './locales/hu/onboarding.json';
import { formatMoney } from './format';

const NBSP = ' ';

/**
 * Verifies the actual fix from Phase 5 (implementations/I18N_SCALE.md) at
 * the 3 sites that had it wrong: ContributionStep.tsx's suggestionChip,
 * reachGoalBy, and needToSetAside (originally amountPerMonth — merged into
 * needToSetAside's single assembled-sentence key by Phase 8; see that key's
 * `<bold>{{amount}}</bold>` placeholder, rendered via <Trans> at the real
 * call site). Those keys no longer carry `{{symbol}}` — this exercises the
 * real i18next interpolation of the shipped `pl`/`en` copy with a
 * `formatMoney`-produced `{{amount}}`, the same composition
 * ContributionStep.tsx performs at render time, so a regression that
 * reintroduces a raw number or the wrong symbol position would fail here,
 * not just in format.test.ts's isolated formatMoney checks. `date` is a
 * fixed placeholder string here rather than a real formatted date — date
 * formatting itself is format.test.ts's concern, not this file's.
 */
beforeAll(async () => {
  await i18next.init({
    lng: 'pl',
    fallbackLng: 'en',
    resources: {
      en: { onboarding: enOnboarding },
      pl: { onboarding: plOnboarding },
      hu: { onboarding: huOnboarding },
    },
    ns: ['onboarding'],
    defaultNS: 'onboarding',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

const PLN = { symbol: 'zł', symbolAfter: true } as const;

describe('pl + PLN money interpolation at the 3 fixed ContributionStep sites', () => {
  it('suggestionChip: symbol after the amount, NBSP-grouped', () => {
    const amount = formatMoney(1000, PLN, 'pl');
    const result = i18next.t('onboarding:contribution.suggestionChip', { pct: 10, amount, lng: 'pl' });
    expect(result).toBe(`10% · 1${NBSP}000 zł`);
  });

  it('reachGoalBy: symbol after the amount, NBSP-grouped', () => {
    const amount = formatMoney(1000, PLN, 'pl');
    const result = i18next.t('onboarding:contribution.reachGoalBy', { amount, lng: 'pl' });
    expect(result).toBe(`Przy 1${NBSP}000 zł/mies. osiągniesz cel do`);
  });

  it('needToSetAside: symbol after the amount, comma decimal separator', () => {
    const amount = formatMoney(1234.56, PLN, 'pl');
    const result = i18next.t('onboarding:contribution.needToSetAside', { amount, date: 'TEST_DATE', lng: 'pl' });
    expect(result).toBe(`Musisz odkładać <bold>1${NBSP}234,56 zł/mies.</bold> aby zdążyć do TEST_DATE.`);
  });

  it('hu + HUF: symbol after the amount, NBSP-grouped, comma decimal separator', () => {
    const HUF = { symbol: 'Ft', symbolAfter: true } as const;
    expect(
      i18next.t('onboarding:contribution.suggestionChip', { pct: 10, amount: formatMoney(1000, HUF, 'hu'), lng: 'hu' })
    ).toBe(`10% · 1${NBSP}000 Ft`);
    expect(
      i18next.t('onboarding:contribution.reachGoalBy', { amount: formatMoney(1000, HUF, 'hu'), lng: 'hu' })
    ).toBe(`1${NBSP}000 Ft/hó mellett ekkorra éred el a célodat:`);
    expect(
      i18next.t('onboarding:contribution.needToSetAside', {
        amount: formatMoney(1234.56, HUF, 'hu'),
        date: 'TEST_DATE',
        lng: 'hu',
      })
    ).toBe(`<bold>1${NBSP}234,56 Ft/hó</bold> összeget kell félretenned, hogy elérd ezt eddig: TEST_DATE.`);
  });

  it('regression guard: the same 3 sites for en + USD still read naturally', () => {
    const USD = { symbol: '$', symbolAfter: false } as const;
    expect(
      i18next.t('onboarding:contribution.suggestionChip', { pct: 10, amount: formatMoney(1000, USD, 'en'), lng: 'en' })
    ).toBe('10% · $1,000');
    expect(
      i18next.t('onboarding:contribution.reachGoalBy', { amount: formatMoney(1000, USD, 'en'), lng: 'en' })
    ).toBe("At $1,000/month you'll reach your goal by");
    expect(
      i18next.t('onboarding:contribution.needToSetAside', { amount: formatMoney(1234.56, USD, 'en'), date: 'TEST_DATE', lng: 'en' })
    ).toBe("You'll need to set aside <bold>$1,234.56/month</bold> to hit this by TEST_DATE.");
  });
});
