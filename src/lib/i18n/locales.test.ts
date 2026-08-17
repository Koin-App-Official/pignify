import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';

/**
 * Key-parity guardrail (Phase 8, implementations/I18N_PL.md): a key present
 * in one locale's namespace file but missing from the other means either an
 * untranslated string (silently falls back to English/the raw key) or dead
 * content in one locale only. Both are bugs this suite exists to catch.
 *
 * Plural-suffixed keys are a deliberate exception, not a bug: en uses CLDR's
 * `one`/`other` categories, pl uses `one`/`few`/`many` — a different SUFFIX
 * SET is correct and expected for the exact same logical key. Compared here
 * by stripping suffixes down to the shared base key, then separately
 * asserting each locale has its own correct suffix set.
 */

const LOCALES_DIR = path.join(__dirname, 'locales');
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const EN_SUFFIXES = ['one', 'other'];
const PL_SUFFIXES = ['few', 'many', 'one'];

const namespaces = fs
  .readdirSync(path.join(LOCALES_DIR, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function readNamespace(locale: string, ns: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, `${ns}.json`), 'utf8'));
}

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...collectKeys(v as Record<string, unknown>, full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function pluralSuffixOf(key: string): string | null {
  const match = PLURAL_SUFFIXES.find((s) => key.endsWith(`_${s}`));
  return match ?? null;
}

function stripPluralSuffix(key: string): string {
  const suffix = pluralSuffixOf(key);
  return suffix ? key.slice(0, -(suffix.length + 1)) : key;
}

describe('locale key parity (en vs pl)', () => {
  it('covers all 12 namespaces', () => {
    expect(namespaces.length).toBe(12);
  });

  for (const ns of namespaces) {
    it(`${ns}: same logical keys in en and pl`, () => {
      const enKeys = new Set(collectKeys(readNamespace('en', ns)).map(stripPluralSuffix));
      const plKeys = new Set(collectKeys(readNamespace('pl', ns)).map(stripPluralSuffix));

      const enOnly = [...enKeys].filter((k) => !plKeys.has(k)).sort();
      const plOnly = [...plKeys].filter((k) => !enKeys.has(k)).sort();

      expect(enOnly, `keys only in en/${ns}.json`).toEqual([]);
      expect(plOnly, `keys only in pl/${ns}.json`).toEqual([]);
    });

    // Every real namespace file is genuinely complete (see the parity test
    // above), so this deliberately checks a key that doesn't exist anywhere —
    // the actual regression this guards is `saveMissing`/`missingKeyHandler`
    // silently not firing (e.g. i18next config drift), which would let a raw
    // "ns:key" string ship to a user with nothing catching it. The `__DEV__ ?
    // throw : log` branch itself lives in index.ts, which imports store.ts
    // (AsyncStorage etc, doesn't resolve under vitest — see missions.ts's doc
    // comment for the same constraint) and so can't be exercised directly
    // here; this covers the i18next-core half of the mechanism instead.
    it(`${ns}: fires missingKeyHandler for a genuinely absent key`, async () => {
      const instance = i18next.createInstance();
      const missing: Array<{ lngs: readonly string[]; ns: string; key: string }> = [];
      await instance.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: { en: { [ns]: readNamespace('en', ns) } },
        ns: [ns],
        defaultNS: ns,
        saveMissing: true,
        missingKeyHandler: (lngs, missingNs, key) => {
          missing.push({ lngs, ns: missingNs, key });
        },
      });

      instance.t('__this_key_does_not_exist__');

      expect(missing).toHaveLength(1);
      expect(missing[0].key).toBe('__this_key_does_not_exist__');
    });

    it(`${ns}: pluralized keys use the correct CLDR suffix set per locale`, () => {
      for (const [locale, expectedSuffixes] of [
        ['en', EN_SUFFIXES],
        ['pl', PL_SUFFIXES],
      ] as const) {
        const keys = collectKeys(readNamespace(locale, ns));
        const bases = new Set(keys.filter((k) => pluralSuffixOf(k)).map(stripPluralSuffix));
        for (const base of bases) {
          const suffixes = keys
            .filter((k) => k.startsWith(`${base}_`) && pluralSuffixOf(k))
            .map((k) => pluralSuffixOf(k)!)
            .sort();
          expect(suffixes, `${locale}/${ns}.json: ${base}`).toEqual(expectedSuffixes);
        }
      }
    });
  }
});
