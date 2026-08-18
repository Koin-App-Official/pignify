/** i18next bootstrap — see `resources` below for the locale/namespace guardrail. */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { shouldPolyfill } from '@formatjs/intl-pluralrules/should-polyfill.js';

import { useStore } from '@/lib/store';
import { createLogger } from '@/lib/logger';
import { detectDeviceLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './detect';

const log = createLogger('i18n');

import enCommon from './locales/en/common.json';
import enOnboarding from './locales/en/onboarding.json';
import enDashboard from './locales/en/dashboard.json';
import enGoals from './locales/en/goals.json';
import enMissions from './locales/en/missions.json';
import enCoach from './locales/en/coach.json';
import enProfile from './locales/en/profile.json';
import enSettings from './locales/en/settings.json';
import enAuth from './locales/en/auth.json';
import enPlans from './locales/en/plans.json';
import enNotifications from './locales/en/notifications.json';
import enContent from './locales/en/content.json';

import plCommon from './locales/pl/common.json';
import plOnboarding from './locales/pl/onboarding.json';
import plDashboard from './locales/pl/dashboard.json';
import plGoals from './locales/pl/goals.json';
import plMissions from './locales/pl/missions.json';
import plCoach from './locales/pl/coach.json';
import plProfile from './locales/pl/profile.json';
import plSettings from './locales/pl/settings.json';
import plAuth from './locales/pl/auth.json';
import plPlans from './locales/pl/plans.json';
import plNotifications from './locales/pl/notifications.json';
import plContent from './locales/pl/content.json';

import huCommon from './locales/hu/common.json';
import huOnboarding from './locales/hu/onboarding.json';
import huDashboard from './locales/hu/dashboard.json';
import huGoals from './locales/hu/goals.json';
import huMissions from './locales/hu/missions.json';
import huCoach from './locales/hu/coach.json';
import huProfile from './locales/hu/profile.json';
import huSettings from './locales/hu/settings.json';
import huAuth from './locales/hu/auth.json';
import huPlans from './locales/hu/plans.json';
import huNotifications from './locales/hu/notifications.json';
import huContent from './locales/hu/content.json';

import deCommon from './locales/de/common.json';
import deOnboarding from './locales/de/onboarding.json';
import deDashboard from './locales/de/dashboard.json';
import deGoals from './locales/de/goals.json';
import deMissions from './locales/de/missions.json';
import deCoach from './locales/de/coach.json';
import deProfile from './locales/de/profile.json';
import deSettings from './locales/de/settings.json';
import deAuth from './locales/de/auth.json';
import dePlans from './locales/de/plans.json';
import deNotifications from './locales/de/notifications.json';
import deContent from './locales/de/content.json';

/**
 * `en`'s namespace set is the one source of truth for what a locale must
 * cover — every other locale's resource bundle is checked against
 * `keyof typeof enResources` below, so a locale missing a namespace is a
 * type error, not a silent English fallback.
 */
const enResources = {
  common: enCommon,
  onboarding: enOnboarding,
  dashboard: enDashboard,
  goals: enGoals,
  missions: enMissions,
  coach: enCoach,
  profile: enProfile,
  settings: enSettings,
  auth: enAuth,
  plans: enPlans,
  notifications: enNotifications,
  content: enContent,
};

export type Namespace = keyof typeof enResources;

/**
 * `satisfies Record<SupportedLanguage, ...>` is the actual guardrail (Phase 1,
 * implementations/I18N_SCALE.md): adding a language to `SupportedLanguage`
 * without adding its resource bundle here used to compile clean and silently
 * fall back every key to English. Now it's a type error on this object.
 */
const resources = {
  en: enResources,
  pl: {
    common: plCommon,
    onboarding: plOnboarding,
    dashboard: plDashboard,
    goals: plGoals,
    missions: plMissions,
    coach: plCoach,
    profile: plProfile,
    settings: plSettings,
    auth: plAuth,
    plans: plPlans,
    notifications: plNotifications,
    content: plContent,
  },
  hu: {
    common: huCommon,
    onboarding: huOnboarding,
    dashboard: huDashboard,
    goals: huGoals,
    missions: huMissions,
    coach: huCoach,
    profile: huProfile,
    settings: huSettings,
    auth: huAuth,
    plans: huPlans,
    notifications: huNotifications,
    content: huContent,
  },
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    dashboard: deDashboard,
    goals: deGoals,
    missions: deMissions,
    coach: deCoach,
    profile: deProfile,
    settings: deSettings,
    auth: deAuth,
    plans: dePlans,
    notifications: deNotifications,
    content: deContent,
  },
} as const satisfies Record<SupportedLanguage, Record<Namespace, unknown>>;

/**
 * One entry per `SupportedLanguage` — a language added to `detect.ts` without
 * its CLDR plural-category data here is a type error (Phase 1,
 * implementations/I18N_SCALE.md), not a silent `_few`/`_many` resolution
 * failure at runtime (see Phase 0, implementations/I18N_PL.md, for what that
 * failure mode looks like without the polyfill at all).
 */
const PLURAL_LOCALE_DATA: Record<SupportedLanguage, () => Promise<unknown>> = {
  en: () => import('@formatjs/intl-pluralrules/locale-data/en.js'),
  pl: () => import('@formatjs/intl-pluralrules/locale-data/pl.js'),
  hu: () => import('@formatjs/intl-pluralrules/locale-data/hu.js'),
  de: () => import('@formatjs/intl-pluralrules/locale-data/de.js'),
};

let initPromise: Promise<typeof i18n> | null = null;

/**
 * Idempotent — safe to call from the root layout on every mount (Fast
 * Refresh, remount) without re-registering the plural-rules polyfill or
 * re-initializing i18next.
 */
export function initI18n(): Promise<typeof i18n> {
  if (!initPromise) {
    initPromise = (async () => {
      if (shouldPolyfill()) {
        // Phase 0 (implementations/I18N_PL.md) found this app's Hermes build
        // ships without Intl.PluralRules at all. Without this, i18next
        // doesn't crash — it silently falls back to English-style one/other
        // pluralization for every locale, including Polish.
        await import('@formatjs/intl-pluralrules/polyfill.js');
        await Promise.all(SUPPORTED_LANGUAGES.map((lang) => PLURAL_LOCALE_DATA[lang]()));
      }

      const initialLanguage = useStore.getState().profile.language ?? detectDeviceLanguage();

      await i18n.use(initReactI18next).init({
        resources,
        lng: initialLanguage,
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_LANGUAGES,
        defaultNS: 'common',
        ns: Object.keys(enResources),
        interpolation: { escapeValue: false },
        returnNull: false,
        // A missing key must never silently ship as a raw "namespace:key.path"
        // string to a real user (Phase 8, implementations/I18N_PL.md). In dev
        // this throws — loud and immediate, right where the bad t() call is —
        // rather than risk it being missed in a screenshot review. In
        // production it only logs: the raw key is still a broken label, but
        // crashing the app over a translation gap would be strictly worse.
        saveMissing: true,
        missingKeyHandler: (lngs, ns, key) => {
          const message = `Missing translation key: ${ns}:${key} (${lngs.join(', ')})`;
          if (__DEV__) throw new Error(`[i18n] ${message}`);
          log.error(message);
        },
      });

      // Keeps i18next in sync with the persisted profile: covers zustand's
      // persist rehydration finishing after this init ran (which reads
      // whatever was in memory at that instant), and explicit language
      // changes from Settings (a plain `updateProfile({ language })` — no
      // dedicated store action needed since this subscription reacts to it).
      useStore.subscribe((state) => {
        const lang = state.profile.language;
        if (lang && lang !== i18n.language) i18n.changeLanguage(lang);
      });
    })().then(() => i18n);
  }
  return initPromise;
}

export default i18n;
