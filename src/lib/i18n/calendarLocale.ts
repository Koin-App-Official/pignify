/**
 * react-native-calendars renders month/day names via xdate's LocaleConfig,
 * a separate locale registry from i18next — it isn't wired to the app's
 * chosen language by default, so without this the calendar always shows
 * English month/day names regardless of `profile.language` (Phase 4,
 * implementations/I18N_PL.md task 22). Names are derived from
 * Intl.DateTimeFormat rather than hand-typed, matching the approach in
 * format.ts, so there's one source of truth for what Polish months/days
 * are called.
 */
import { LocaleConfig } from 'react-native-calendars';
import type { SupportedLanguage } from './detect';

const LOCALE_TAG: Record<SupportedLanguage, string> = {
  en: 'en-US',
  pl: 'pl-PL',
  hu: 'hu-HU',
  de: 'de-DE',
};

const TODAY_LABEL: Record<SupportedLanguage, string> = {
  en: 'Today',
  pl: 'Dziś',
  hu: 'Ma',
  de: 'Heute',
};

function monthNames(tag: string, style: 'long' | 'short'): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(tag, { month: style }).format(new Date(2000, i, 1))
  );
}

// 2000-01-02 is a Sunday — react-native-calendars/xdate expects day names
// to start on Sunday regardless of the locale's actual first day of week.
function dayNames(tag: string, style: 'long' | 'short'): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(tag, { weekday: style }).format(new Date(2000, 0, 2 + i))
  );
}

let registered = false;

function registerLocales() {
  if (registered) return;
  registered = true;
  (Object.keys(LOCALE_TAG) as SupportedLanguage[]).forEach((lang) => {
    const tag = LOCALE_TAG[lang];
    LocaleConfig.locales[lang] = {
      monthNames: monthNames(tag, 'long'),
      monthNamesShort: monthNames(tag, 'short'),
      dayNames: dayNames(tag, 'long'),
      dayNamesShort: dayNames(tag, 'short'),
      today: TODAY_LABEL[lang],
    };
  });
}

/** Idempotent — safe to call on every CalendarModal render. */
export function setCalendarLocale(language: SupportedLanguage) {
  registerLocales();
  LocaleConfig.defaultLocale = language;
}
