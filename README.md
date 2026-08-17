# Welcome to Piggy

A modern personal finance tracker and savings motivator.

## Internationalization

The app ships in English and Polish (`en`/`pl`), detected from the device during onboarding and
overridable any time in Settings. Built on `i18next` + `react-i18next`, with translations split into
namespaces under `src/lib/i18n/locales/{en,pl}/*.json` — one file per screen/area (`dashboard`,
`goals`, `settings`, …), plus two cross-cutting ones: `common` (shared chrome like Cancel/Confirm)
and `content` (catalog data — missions, lessons, achievements, countries, currencies, expense
categories — keyed by each item's stable id, not by screen).

Full background and the phase-by-phase implementation history live in
[implementations/I18N_PL.md](implementations/I18N_PL.md).

### Adding a new translated string

1. Add the key to **both** `src/lib/i18n/locales/en/<namespace>.json` and the matching `pl/` file —
   a key present in one locale and not the other fails the key-parity test
   (`src/lib/i18n/locales.test.ts`).
2. In a component, pull it via `useTranslation('<namespace>')` and call `t('key.path')`. To reference
   a key from a different namespace than the component's default, prefix it: `t('common:cancel')`.
3. In a pure `src/lib/*.ts` module (no React), don't use `useTranslation` — accept a `t` (or
   `language`) parameter from the caller instead, following the pattern in `entitlements.ts`'s
   `gateInfo()` or `notifications.ts`. Keep an English-literal fallback for any function with existing
   test coverage that calls it without `t`, so tests don't need to change.
4. **Countable strings need real plural forms, not just `_other`.** i18next resolves
   `key_one`/`key_few`/`key_many`/`key_other` (English only ever needs `_one`/`_other`; Polish needs
   all three of `_one`/`_few`/`_many` — never `_other` for an integer count). See any existing
   `_one`/`_few`/`_many` triplet (e.g. `auth.json`'s `errors.incorrectPinWithAttempts`) for the
   pattern, and `src/lib/i18n/plurals.test.ts` for how it's verified.
5. A missing key throws in dev (`src/lib/i18n/index.ts`'s `missingKeyHandler`) — you'll find out
   immediately, not from a screenshot review later.
6. Never hand-write locale-aware number/currency/date formatting — use
   `src/lib/i18n/format.ts` (`formatNumber`/`formatMoney`/`formatDate`/`formatMonthYear`). Hermes has
   real bugs in both `Intl.NumberFormat` and ambient-locale `toLocaleString()` that these work around
   (see format.ts's doc comment and Phase 0 of the plan doc).

### Adding a new locale

There's no single switch — each of these needs the new language added:

- `src/lib/i18n/detect.ts`: add the language code to `SupportedLanguage` and `SUPPORTED_LANGUAGES`.
- `src/lib/i18n/index.ts`: import and register the new locale's JSON files in `resources`.
- Create `src/lib/i18n/locales/<code>/*.json` for every namespace (copy the `en/` set as a starting
  structure) and `content.json`'s catalog translations.
- `src/lib/i18n/format.ts`: add the new locale to `LOCALE_TAG`, `GROUP_SEPARATOR`, `DECIMAL_SEPARATOR`.
- `src/lib/i18n/calendarLocale.ts`: add the new locale to `LOCALE_TAG` and `TODAY_LABEL` so
  `react-native-calendars` picks up month/day names — it has its own locale registry (`xdate`'s
  `LocaleConfig`), entirely separate from i18next.
- `src/lib/storeMigrations.ts`: existing installs' persisted `profile.language` needs a migration path
  if the new locale changes what "no value set" should default to.
- `app.json`'s `locales` field (`languages/<code>.json`) for native-layer strings i18next never
  touches — currently just `NSFaceIDUsageDescription` on iOS.
- `src/lib/i18n/locales.test.ts` and `plurals.test.ts` currently hardcode the `en`/`pl` pair — extend
  them to cover the new locale too rather than leaving it unchecked.
