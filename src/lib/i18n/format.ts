/**
 * Locale-aware number/currency/date formatting for the app's chosen
 * language. Deliberately pure — no store.ts import, no ambient fallback —
 * every caller passes `language` explicitly.
 *
 * Number/currency formatting is hand-rolled rather than built on
 * Intl.NumberFormat / Number.prototype.toLocaleString(): Phase 0
 * (implementations/I18N_PL.md) found two independent bugs on this app's
 * Hermes build — bare toLocaleString() follows the device's ambient locale
 * rather than the app's chosen language, and Intl.NumberFormat('pl-PL')
 * doesn't group thousands at all below 10,000 (`9999` stays `"9999"`).
 *
 * Date formatting has no such bug — Phase 0 confirmed Intl.DateTimeFormat
 * produces correct Polish month names — so formatDate/formatMonthYear are
 * thin Intl.DateTimeFormat wrappers that just supply the right locale tag
 * instead of `undefined` (device locale).
 */
import type { SupportedLanguage } from './detect';

/** Full BCP-47 tags for Intl.DateTimeFormat — verified against these exact tags in Phase 0. */
const LOCALE_TAG: Record<SupportedLanguage, string> = {
  en: 'en-US',
  pl: 'pl-PL',
  hu: 'hu-HU',
  de: 'de-DE',
};

/**
 * Thousands separator per language. pl-PL's and hu-HU's are both U+00A0
 * (NBSP), not a plain space — see Phase 0 (pl) and implementations/I18N_HU.md
 * Phase 2 (hu, verified via Intl.NumberFormat('hu-HU').formatToParts()). de-DE
 * uses a real period instead — verified via
 * Intl.NumberFormat('de-DE').formatToParts() (implementations/I18N_DE.md
 * Phase 2) — the first locale in this table that isn't a comma or NBSP.
 */
const GROUP_SEPARATOR: Record<SupportedLanguage, string> = {
  en: ',',
  pl: ' ',
  hu: ' ',
  de: '.',
};

const DECIMAL_SEPARATOR: Record<SupportedLanguage, string> = {
  en: '.',
  pl: ',',
  hu: ',',
  de: ',',
};

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats a number for the given language: grouped thousands, no forced
 * trailing decimal zeros (matches toLocaleString()'s default behavior —
 * `1000` stays `"1,000"`, not `"1,000.00"`).
 */
export function formatNumber(
  amount: number,
  language: SupportedLanguage,
  options: { maximumFractionDigits?: number } = {}
): string {
  const maxFractionDigits = options.maximumFractionDigits ?? 3;
  const negative = amount < 0;
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.abs(Math.round(amount * factor) / factor);
  const [integerPart, fractionPart = ''] = rounded.toFixed(maxFractionDigits).split('.');
  const trimmedFraction = fractionPart.replace(/0+$/, '');
  const groupedInteger = groupThousands(integerPart, GROUP_SEPARATOR[language]);
  const result = trimmedFraction
    ? `${groupedInteger}${DECIMAL_SEPARATOR[language]}${trimmedFraction}`
    : groupedInteger;
  return negative && rounded !== 0 ? `-${result}` : result;
}

/** Formats a money amount given a currency's symbol and its position (before/after the number). */
export function formatMoney(
  amount: number,
  currency: { symbol: string; symbolAfter: boolean },
  language: SupportedLanguage
): string {
  const formatted = formatNumber(amount, language);
  return currency.symbolAfter ? `${formatted} ${currency.symbol}` : `${currency.symbol}${formatted}`;
}

/** Thin Intl.DateTimeFormat wrapper using the app's chosen language instead of the device's. */
export function formatDate(
  date: string | Date,
  language: SupportedLanguage,
  options: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_TAG[language], options).format(d);
}

/**
 * The common "month year" phrasing used across goal deadlines/targets
 * (e.g. "August 2026" / "sierpień 2026"). Polish declines months, but the
 * standalone nominative this produces is only correct in some sentence
 * positions — phrase surrounding Polish copy around the standalone form
 * rather than fighting the formatter (see Phase 2 notes in the plan doc).
 */
export function formatMonthYear(date: string | Date, language: SupportedLanguage): string {
  return formatDate(date, language, { month: 'long', year: 'numeric' });
}
