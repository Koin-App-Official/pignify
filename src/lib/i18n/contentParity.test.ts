import { describe, it, expect } from 'vitest';
import enContent from './locales/en/content.json';
import plContent from './locales/pl/content.json';
import huContent from './locales/hu/content.json';
import enSettings from './locales/en/settings.json';
import enOnboarding from './locales/en/onboarding.json';
import enCommon from './locales/en/common.json';
import enPlans from './locales/en/plans.json';
import enMissionsNs from './locales/en/missions.json';
import { MISSION_CATALOG } from '../missions';
import { LESSONS, LESSON_OPTION_KEYS } from '../lessons';
import { DEFAULT_ACHIEVEMENTS, GOAL_TEMPLATES, COUNTRIES, CURRENCIES, EXPENSE_CATEGORIES } from '../catalogs';

/**
 * Catalog ↔ translation-file parity guardrail (Phase 3,
 * implementations/I18N_SCALE.md). ~22 call sites across the app resolve a
 * translation key built from a runtime TS id —
 * `t(\`content:missions.${slug}.title\`)`, `t(\`content:countries.${code}\`)`,
 * `t(\`autoLock.${opt.labelKey}\`)`, and similar — rather than a literal key
 * Phase 2's locale-parity test (locales.test.ts, which only ever sees keys
 * that are actually written in the JSON) or any static scan could see.
 *
 * Both directions are real bugs: a catalog id with no translation entry
 * resolves to a raw "content:x.y" string in production (missingKeyHandler
 * doesn't crash prod, only dev — see i18n/index.ts); a translation entry
 * with no catalog id is dead content nobody will ever see, silently rotting.
 *
 * Only checked against `en`. Phase 2's locale-parity test already guarantees
 * every other locale has the same keys as `en`, so catalog↔en parity here
 * plus Phase 2's en↔every-locale parity together cover catalog↔every-locale
 * transitively, without re-deriving per-locale here.
 */

function idParity(catalogIds: string[], translatedIds: string[], label: string) {
  const catalogSet = new Set(catalogIds);
  const translatedSet = new Set(translatedIds);
  const catalogOnly = [...catalogSet].filter((id) => !translatedSet.has(id)).sort();
  const translatedOnly = [...translatedSet].filter((id) => !catalogSet.has(id)).sort();
  expect(catalogOnly, `${label}: catalog ids with no translation entry`).toEqual([]);
  expect(translatedOnly, `${label}: translation entries with no catalog id`).toEqual([]);
}

/**
 * Mirrors src/lib/missions.ts's renderMissionCopy: i18next's default key
 * separator is `.`, which would otherwise mis-parse an id like
 * `save-1.5x-target` as a nested path. Lessons and achievements do *not*
 * apply this — LessonQuizModal and store.ts's achievement-copy lookup both
 * key on the raw id (see their respective `t(...)` call sites) — so this is
 * deliberately mission-specific, not a shared helper.
 */
function missionSlug(id: string): string {
  return id.replace(/\./g, '-');
}

describe('catalog ↔ content.json parity', () => {
  it('missions: every MISSION_CATALOG id has a content.json entry, and vice versa', () => {
    idParity(
      MISSION_CATALOG.map((def) => missionSlug(def.id)),
      Object.keys(enContent.missions),
      'missions'
    );
  });

  it('missions: every content.json mission has both title and description', () => {
    for (const [slug, entry] of Object.entries(enContent.missions)) {
      expect(typeof entry.title, `missions.${slug}.title`).toBe('string');
      expect(entry.title.length, `missions.${slug}.title`).toBeGreaterThan(0);
      expect(typeof entry.description, `missions.${slug}.description`).toBe('string');
      expect(entry.description.length, `missions.${slug}.description`).toBeGreaterThan(0);
    }
  });

  it('lessons: every LESSONS id has a content.json entry, and vice versa', () => {
    idParity(
      LESSONS.map((l) => l.id),
      Object.keys(enContent.lessons),
      'lessons'
    );
  });

  it('lessons: every content.json lesson has topic, question, explanation, and exactly options a/b/c', () => {
    for (const [id, entry] of Object.entries(enContent.lessons)) {
      expect(typeof entry.topic, `lessons.${id}.topic`).toBe('string');
      expect(typeof entry.question, `lessons.${id}.question`).toBe('string');
      expect(typeof entry.explanation, `lessons.${id}.explanation`).toBe('string');
      expect(Object.keys(entry.options).sort(), `lessons.${id}.options keys`).toEqual(
        [...LESSON_OPTION_KEYS].sort()
      );
      for (const key of LESSON_OPTION_KEYS) {
        expect(typeof entry.options[key], `lessons.${id}.options.${key}`).toBe('string');
        expect(entry.options[key].length, `lessons.${id}.options.${key}`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The actual answer-integrity check (Phase 4, implementations/I18N_SCALE.md):
   * `correctKey` lives in lessons.ts, shared across every locale, so it can't
   * drift *between* locales the way a positional `correctIndex` used to — but
   * it can still point at an option key a given locale's content.json
   * doesn't have (e.g. a translator restructuring one locale's `options`
   * object and dropping a key). Checked per locale, not just against `en`,
   * since this is exactly the kind of gap Phase 3's en-only shortcut
   * wouldn't catch — a structural defect in `pl` specifically.
   */
  it("lessons: every locale's correctKey names one of that locale's own option keys", () => {
    for (const lesson of LESSONS) {
      for (const [locale, content] of Object.entries({ en: enContent, pl: plContent, hu: huContent })) {
        const lessons = content.lessons as Record<string, { options?: Record<string, string> }>;
        const entry = lessons[lesson.id];
        expect(entry, `${locale}/content.json missing lessons.${lesson.id}`).toBeDefined();
        expect(
          Object.keys(entry!.options ?? {}),
          `${locale}/content.json lessons.${lesson.id}.options`
        ).toContain(lesson.correctKey);
      }
    }
  });

  it('achievements: every DEFAULT_ACHIEVEMENTS id has a content.json entry, and vice versa', () => {
    idParity(
      DEFAULT_ACHIEVEMENTS.map((a) => a.id),
      Object.keys(enContent.achievements),
      'achievements'
    );
  });

  it('achievements: every content.json achievement has both title and description', () => {
    for (const [id, entry] of Object.entries(enContent.achievements)) {
      expect(typeof entry.title, `achievements.${id}.title`).toBe('string');
      expect(entry.title.length, `achievements.${id}.title`).toBeGreaterThan(0);
      expect(typeof entry.description, `achievements.${id}.description`).toBe('string');
      expect(entry.description.length, `achievements.${id}.description`).toBeGreaterThan(0);
    }
  });

  it('goalTemplates: every GOAL_TEMPLATES id has a content.json entry, and vice versa', () => {
    idParity(
      GOAL_TEMPLATES.map((t) => t.id),
      Object.keys(enContent.goalTemplates),
      'goalTemplates'
    );
  });

  it('countries: every COUNTRIES code has a content.json entry, and vice versa', () => {
    idParity(
      COUNTRIES.map((c) => c.code),
      Object.keys(enContent.countries),
      'countries'
    );
  });

  it('currencies: every CURRENCIES code has a content.json entry, and vice versa', () => {
    idParity(
      CURRENCIES.map((c) => c.code),
      Object.keys(enContent.currencies),
      'currencies'
    );
  });

  it('expenseCategories: every EXPENSE_CATEGORIES id has a content.json entry, and vice versa', () => {
    idParity(
      EXPENSE_CATEGORIES.map((c) => c.id),
      Object.keys(enContent.expenseCategories),
      'expenseCategories'
    );
  });
});

/**
 * The smaller dynamic-key surfaces outside content.json: each resolves a
 * translation key from a static id list that lives inside a React Native
 * screen/component file (app/settings.tsx, app/onboarding.tsx,
 * src/components/ui/calendar-modal.tsx, app/welcome.tsx), none of which are
 * vitest-importable (they pull in react-native, expo-router, reanimated).
 * Unlike the seven catalogs above, these id lists can't be imported directly
 * — each is hardcoded here from its source, with a comment pointing at
 * where it actually lives. That means this half only catches "id renamed or
 * removed in the JSON without updating the source" symmetrically; it can't
 * catch "id added in the source without a matching test update" the way the
 * catalog tests above can, since there's no shared runtime value to read
 * from. Noted as a real limitation, not fixed here — extracting five
 * one-off UI arrays into importable modules for this alone isn't worth the
 * churn Phase 3 scoped in.
 */
describe('static UI id lists ↔ translation file parity', () => {
  it('settings.tsx AUTO_LOCK_OPTIONS labelKeys are all present in settings.json autoLock', () => {
    // app/settings.tsx: AUTO_LOCK_OPTIONS
    const labelKeys = ['immediately', 'oneMin', 'fiveMin', 'never'];
    const autoLockKeys = Object.keys(enSettings.autoLock);
    for (const key of labelKeys) {
      expect(autoLockKeys, `settings.json autoLock.${key}`).toContain(key);
    }
  });

  it('onboarding.tsx LEGAL_LINKS ids are all present in onboarding.json legal', () => {
    // app/onboarding.tsx: LEGAL_LINKS
    const linkIds = ['privacyPolicy', 'termsOfService', 'aiTransparency', 'services', 'aiFeatureAccess'];
    const legalKeys = Object.keys(enOnboarding.legal);
    for (const id of linkIds) {
      expect(legalKeys, `onboarding.json legal.${id}`).toContain(id);
    }
  });

  it('onboarding.tsx / goals.tsx GOAL_CHIPS ids exactly match onboarding.json goal.chips', () => {
    // app/onboarding.tsx and app/(tabs)/goals.tsx both define GOAL_CHIPS
    // (identical, deliberately duplicated — see the comment on goals.tsx's copy).
    const chipIds = ['vacation', 'newCar', 'houseDeposit', 'emergencyFund', 'somethingElse'];
    expect(Object.keys(enOnboarding.goal.chips).sort()).toEqual([...chipIds].sort());
  });

  it('welcome.tsx SLIDES ids exactly match onboarding.json welcome.slides', () => {
    // app/welcome.tsx: SLIDES, typed as `id: 'goal' | 'noBank' | 'coach'`
    const slideIds = ['goal', 'noBank', 'coach'];
    expect(Object.keys(enOnboarding.welcome.slides).sort()).toEqual([...slideIds].sort());
  });

  it('calendar-modal.tsx QUICK_JUMPS labelKeys are all present in common.json calendarModal', () => {
    // src/components/ui/calendar-modal.tsx: QUICK_JUMPS
    const jumpKeys = ['quickJump6mo', 'quickJump1yr', 'quickJump2yr', 'quickJump5yr'];
    const calendarModalKeys = Object.keys(enCommon.calendarModal);
    for (const key of jumpKeys) {
      expect(calendarModalKeys, `common.json calendarModal.${key}`).toContain(key);
    }
  });

  it('retention.ts resource ids exactly match plans.json downgradeSelection.retentionResource', () => {
    // src/lib/retention.ts: the `checks` array's literal 'goals'|'incomes'|'devices' union
    const resourceIds = ['goals', 'incomes', 'devices'];
    expect(Object.keys(enPlans.downgradeSelection.retentionResource).sort()).toEqual([...resourceIds].sort());
  });

  it('missions.ts MissionTier values (1-3) exactly match missions.json tier labels', () => {
    // src/lib/missions.ts: MissionTier = 1 | 2 | 3, read via t(`missions:tier${tier}`)
    const tiersInUse = [...new Set(MISSION_CATALOG.map((def) => def.tier))].sort((a, b) => a - b);
    const tierKeys = Object.keys(enMissionsNs)
      .filter((k) => /^tier\d+$/.test(k))
      .map((k) => Number(k.replace('tier', '')))
      .sort((a, b) => a - b);
    expect(tierKeys).toEqual(tiersInUse);
  });
});
