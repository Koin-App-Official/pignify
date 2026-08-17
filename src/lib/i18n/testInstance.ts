import fs from 'node:fs';
import path from 'node:path';
import i18next, { type TFunction } from 'i18next';

/**
 * Builds a real i18next instance from the shipping `en` locale JSON for a
 * single namespace — for library-level unit tests (missions.test.ts,
 * retention.test.ts, …) that need a genuine `t` now that `gateInfo`,
 * `renderMissionCopy`, and `validateRetentionSelection` all require one
 * (Phase 6, implementations/I18N_SCALE.md — the three optional-`t` escape
 * hatches existed only so these tests could skip translation; the fix is to
 * give the tests a real `t`, not to keep an English fallback in the source).
 *
 * Reads the JSON straight off disk rather than importing `./index.ts`
 * (pulls in store.ts → AsyncStorage, not vitest-importable) or the app's
 * real i18next singleton (shared mutable state across every test file) —
 * this is a throwaway instance per call, scoped to exactly one namespace.
 */
export async function createTestT<N extends string>(ns: N): Promise<TFunction<N>> {
  const filePath = path.join(__dirname, 'locales', 'en', `${ns}.json`);
  const resource = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const instance = i18next.createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { [ns]: resource } },
    ns: [ns],
    defaultNS: ns,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance.t.bind(instance) as unknown as TFunction<N>;
}
