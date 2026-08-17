/**
 * i18next bootstrap. Namespace scaffolding for #120 (Polish i18n) — most
 * namespaces are still empty stubs (`{}`); Phases 3-6 of
 * implementations/I18N_PL.md fill them in screen by screen. `settings` is
 * the one namespace with real content so far, backing the language row this
 * phase adds to app/settings.tsx.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { shouldPolyfill } from '@formatjs/intl-pluralrules/should-polyfill.js';

import { useStore } from '@/lib/store';
import { createLogger } from '@/lib/logger';
import { detectDeviceLanguage, SUPPORTED_LANGUAGES } from './detect';

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

const resources = {
  en: {
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
  },
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
} as const;

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
        await import('@formatjs/intl-pluralrules/locale-data/en.js');
        await import('@formatjs/intl-pluralrules/locale-data/pl.js');
      }

      const initialLanguage = useStore.getState().profile.language ?? detectDeviceLanguage();

      await i18n.use(initReactI18next).init({
        resources,
        lng: initialLanguage,
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
        defaultNS: 'common',
        ns: Object.keys(resources.en),
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
