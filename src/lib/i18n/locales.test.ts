import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './detect';

/**
 * Key-parity guardrail (originally Phase 8, implementations/I18N_PL.md; made
 * locale-agnostic in Phase 2, implementations/I18N_SCALE.md): a key present
 * in one locale's namespace file but missing from another means either an
 * untranslated string (silently falls back to English/the raw key) or dead
 * content in one locale only. Both are bugs this suite exists to catch —
 * for every locale registered in `SUPPORTED_LANGUAGES`, not just `pl`.
 *
 * Plural-suffixed keys are a deliberate exception, not a bug: different
 * locales use different CLDR plural category sets for the exact same
 * logical key (see `requiredPluralSuffixes` below). Compared here by
 * stripping suffixes down to the shared base key, then separately asserting
 * each locale has its own correct suffix set.
 */

const LOCALES_DIR = path.join(__dirname, 'locales');
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/**
 * Covers every CLDR `pl` plural band (…, 11–14, 22, 25, 101, 112, …) within
 * two full cycles mod 100, without hardcoding the bands themselves.
 */
const REPRESENTATIVE_COUNTS = Array.from({ length: 201 }, (_, i) => i);

/**
 * The suffix set a locale must actually author, derived from
 * `Intl.PluralRules` rather than a hardcoded literal (Phase 2,
 * implementations/I18N_SCALE.md) — but over *integers only*, not
 * `resolvedOptions().pluralCategories` directly. CLDR `pl`'s `other`
 * category exists solely for non-integer counts (`Intl.PluralRules('pl').select(1.5)`
 * → `'other'`); the app never passes a fractional `count` to a pluralized
 * key (attempts, days, goals, devices, income sources, months — all
 * integers by construction), so `pl` never authors an `_other` variant.
 * This asks Intl.PluralRules which categories integers actually reach,
 * rather than assuming that invariant or re-encoding it as a literal.
 */
function requiredPluralSuffixes(locale: SupportedLanguage): string[] {
  const rules = new Intl.PluralRules(locale);
  const reached = new Set(REPRESENTATIVE_COUNTS.map((n) => rules.select(n)));
  return [...reached].sort();
}

const localeDirs = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const namespaces = fs
  .readdirSync(path.join(LOCALES_DIR, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function readNamespace(locale: string, ns: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, `${ns}.json`), 'utf8'));
}

/**
 * Descends into arrays by index (Phase 3, implementations/I18N_SCALE.md) —
 * e.g. `lessons.emergency-fund.options[0]`, `…options[1]`, `…options[2]` —
 * rather than treating an array as a single opaque leaf. Without this, a
 * locale with a 2-element `options` array where `en` has 3 still passes:
 * the key `lessons.<id>.options` "exists" in both, and nothing ever compared
 * lengths. Indexing surfaces `options[2]` as missing in exactly the same
 * "key present in en, missing in pl" shape every other parity failure uses.
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const indexed = `${full}[${i}]`;
        if (item && typeof item === 'object') {
          out.push(...collectKeys(item as Record<string, unknown>, indexed));
        } else {
          out.push(indexed);
        }
      });
    } else if (v && typeof v === 'object') {
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

/** Collects every leaf string value (through nested objects and arrays) — used by the `{{symbol}}{{amount}}` lint check below, not the key-parity checks (which use `collectKeys` instead). */
function collectStringValues(obj: unknown, path = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[path, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => collectStringValues(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      collectStringValues(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}

describe('money formatting stays a boundary, not a translation-string concern', () => {
  // Phase 5, implementations/I18N_SCALE.md: three onboarding.json keys used
  // to bake `{{symbol}}{{amount}}` directly into the copy, bypassing
  // formatMoney entirely — PLN (symbolAfter: true) rendered "zł1000" instead
  // of "1 000 zł", ungrouped, with a "." decimal separator. The fix moved
  // symbol placement into formatCurrency/formatMoney, which already handles
  // it correctly per currency; this test mechanically prevents the same
  // mistake from coming back in any namespace, any locale, not just the one
  // it happened in.
  it('no locale JSON value bakes {{symbol}} directly next to {{amount}}', () => {
    for (const locale of localeDirs) {
      for (const ns of namespaces) {
        const values = collectStringValues(readNamespace(locale, ns));
        for (const [key, value] of values) {
          expect(value, `${locale}/${ns}.json: ${key}`).not.toMatch(/\{\{symbol\}\}\{\{amount\}\}|\{\{amount\}\}\{\{symbol\}\}/);
        }
      }
    }
  });
});

describe('locale registration', () => {
  it('every locales/ directory is registered in SUPPORTED_LANGUAGES, and vice versa', () => {
    expect(localeDirs, 'locales/ directories').toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  for (const locale of localeDirs) {
    it(`${locale}: has exactly the same namespace files as en`, () => {
      const localeNamespaces = fs
        .readdirSync(path.join(LOCALES_DIR, locale))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
      expect(localeNamespaces, `locales/${locale}`).toEqual(namespaces);
    });
  }
});

describe('locale key parity (every locale vs en)', () => {
  const otherLocales = localeDirs.filter((locale) => locale !== 'en');

  for (const ns of namespaces) {
    for (const locale of otherLocales) {
      it(`${ns}: same logical keys in en and ${locale}`, () => {
        const enKeys = new Set(collectKeys(readNamespace('en', ns)).map(stripPluralSuffix));
        const localeKeys = new Set(collectKeys(readNamespace(locale, ns)).map(stripPluralSuffix));

        const enOnly = [...enKeys].filter((k) => !localeKeys.has(k)).sort();
        const localeOnly = [...localeKeys].filter((k) => !enKeys.has(k)).sort();

        expect(enOnly, `keys only in en/${ns}.json`).toEqual([]);
        expect(localeOnly, `keys only in ${locale}/${ns}.json`).toEqual([]);
      });
    }

    // Every real namespace file is genuinely complete (see the parity test
    // above), so this deliberately checks a key that doesn't exist anywhere —
    // the actual regression this guards is `saveMissing`/`missingKeyHandler`
    // silently not firing (e.g. i18next config drift), which would let a raw
    // "ns:key" string ship to a user with nothing catching it. The `__DEV__ ?
    // throw : log` branch itself lives in index.ts, which imports store.ts
    // (AsyncStorage etc, doesn't resolve under vitest — see missions.ts's doc
    // comment for the same constraint) and so can't be exercised directly
    // here; this covers the i18next-core half of the mechanism instead. It's
    // locale-independent (i18next's own resolver, not the JSON content), so
    // it only needs to run once per namespace, not once per locale.
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
      for (const locale of localeDirs) {
        const expectedSuffixes = requiredPluralSuffixes(locale as SupportedLanguage);
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
