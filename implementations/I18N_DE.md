# Add German (de) language support

Tracking issue: [#126](https://github.com/Koin-App-Official/pignify/issues/126)
Branch (to create when implementation starts): `feat/issue-126-german-i18n` (off `main`, after `feat/issue-124-hungarian-i18n` merges — or off that branch directly if it's still open)

## Context

The app currently ships English, Polish, and Hungarian. Issue #122 rebuilt the i18n architecture specifically so adding a new language is a **mechanical, compiler/test-enforced** change, and issue #124 proved that recipe for real with Hungarian (language #3). This plan applies the same recipe — written down as an 11-step checklist in [I18N_SCALE.md](I18N_SCALE.md) and worked end-to-end in [I18N_HU.md](I18N_HU.md) — to German (language #4).

I read the current state of every guardrail file directly (`detect.ts`, `format.ts`, `calendarLocale.ts`, `index.ts`, `catalogs.ts`, `locales.test.ts`, `contentParity.test.ts`, `plurals.test.ts`, `detect.test.ts`, `app.json`, `package.json`, `.github/workflows/ci.yml`) rather than relying only on the Hungarian precedent, and verified German-specific facts directly against this app's toolchain (Node's ICU, which the ADR docs treat as ground truth before an on-device Hermes check):

- `Intl.PluralRules('de').resolvedOptions().pluralCategories` → `['one', 'other']` — same 2-category shape as English/Hungarian, simpler than Polish's 3-way system.
- `@formatjs/intl-pluralrules/locale-data/de.js` already exists in `node_modules` — no missing dependency.
- `Intl.NumberFormat('de-DE').formatToParts(1234567.89)` → group separator `.` (a real period, **not** NBSP like pl/hu), decimal separator `,`. This is a new pattern for `GROUP_SEPARATOR`/`DECIMAL_SEPARATOR` — first locale where the group separator is a plain ASCII character.
- `Intl.DateTimeFormat('de-DE', {month:'long', year:'numeric'})` → `"August 2026"`; with `day` added → `"16. August 2026"` (day-then-month, period after the day number — different order from Hungarian's year-first convention).
- **Germany/EUR already exist** in `src/lib/catalogs.ts`'s `COUNTRIES`/`CURRENCIES` and in every existing locale's `content.json` (`en.countries.DE = "Germany"`, `pl.countries.DE = "Niemcy"`, `hu.countries.DE = "Németország"`, and `currencies.EUR` similarly) — Germany was already selectable as a *country* before this language work. Unlike Hungarian (which needed new `HU`/`HUF` catalog entries), **this plan needs zero changes to `catalogs.ts`** — the new `de/content.json` just needs its own translation of the existing `DE`/`EUR` entries, same as any other catalog id.
- `src/lib/i18n/detect.test.ts` currently uses `'de'` and `'de-AT'` **as its own example of an unsupported language** (lines 32 and 39: `matchSupportedLanguage('de')` / `matchSupportedLanguage('de-AT')` both asserted to fall back to `'en'`). Once German is real, these two assertions must be swapped to a different still-unsupported code (e.g. `'it'` / `'it-IT'`) or they'll start failing.
- German grammar pluralizes nouns normally after a numeral (unlike Hungarian, which keeps the noun singular) — so `_one`/`_other` copy should look genuinely different ("1 Versuch übrig" vs. "2 Versuche übrig"), not near-duplicate text the way Hungarian's was. This is a translation-quality expectation to hold the draft to, not a guardrail.
- German is prone to long compound words and capitalized nouns — a real risk for button/chip truncation, flagged the same way Polish (~13% longer) and Hungarian were.

**Decisions carried over from the Hungarian plan, applied identically here:**
- Claude drafts the full German translation for every string and catalog entry as part of this plan; the plan ends with an on-device native-speaker review pass.
- Every phase below ends in a state where `npm run typecheck && npm test` is clean.

---

## Phase 1 — Core language registration

**Files:** `src/lib/i18n/detect.ts`

- [x] Add `'de'` to the `SupportedLanguage` union: `'en' | 'pl' | 'hu' | 'de'`
- [x] Add `'de'` to `SUPPORTED_LANGUAGES`: `['en', 'pl', 'hu', 'de']`
- [x] Confirm `@formatjs/intl-pluralrules/locale-data/de.js` exists in `node_modules` — confirmed already present

**Expected result — confirmed via `npm run typecheck`:** this alone breaks the build with 7 named errors — `calendarLocale.ts`'s two records (lines 14, 20), `format.ts`'s three records (lines 21, 32, 38), `index.ts`'s `resources` (line 110) and `PLURAL_LOCALE_DATA` (line 119), and `plurals.test.ts`'s `CASES` (line 23) — each naming the missing `'de'` key. That's the guardrail from #122 working as designed; Phases 2–5 fix each one in turn.

---

## Phase 2 — Formatting data

**Files:** `src/lib/i18n/format.ts`, `src/lib/i18n/calendarLocale.ts`

- [x] `format.ts`: add `de: 'de-DE'` to `LOCALE_TAG`
- [x] `format.ts`: add `de: '.'` to `GROUP_SEPARATOR` — a real period, verified via `Intl.NumberFormat('de-DE').formatToParts()`; first locale in this table that isn't `,`/NBSP-space
- [x] `format.ts`: add `de: ','` to `DECIMAL_SEPARATOR`
- [x] `calendarLocale.ts`: add `de: 'de-DE'` to `LOCALE_TAG`
- [x] `calendarLocale.ts`: add `de: 'Heute'` to `TODAY_LABEL` ("today" in German)
- [x] `npm run typecheck` confirms these 4 fixes clear their errors — only Phase 3/5's `index.ts`/`plurals.test.ts` errors remain, exactly as predicted
- [ ] **Hermes verification (not compiler-enforced — do this for real once the app runs with `de` selected):** confirm `formatNumber`/`formatMoney` group correctly at the `.` separator on-device, and that `formatDate`/`formatMonthYear` render the day-before-month order (`"16. August 2026"`) correctly on the actual Hermes build, not just Node's ICU — deferred to Phase 9

---

## Phase 3 — Wire the `de` resource bundle

**Files:** `src/lib/i18n/index.ts`

- [x] Import all 12 German namespace JSON files alongside the existing `en`/`pl`/`hu` imports — **stubbed as verbatim copies of `en/*.json`** for now, to be replaced with real translations in Phase 4
- [x] Add the `de` block to `resources`, matching the `en`/`pl`/`hu` shape exactly (the `satisfies Record<SupportedLanguage, Record<Namespace, unknown>>` annotation makes an incomplete block a compile error)
- [x] Add `de: () => import('@formatjs/intl-pluralrules/locale-data/de.js')` to `PLURAL_LOCALE_DATA`
- [x] `npm run typecheck` — only Phase 5's `plurals.test.ts` error remains, exactly as predicted
- [x] `npx vitest run src/lib/i18n/locales.test.ts` — 66/66 passing; the stubbed `de` directory (verbatim `en` copy) is correctly registered and key-complete

Stubbed with placeholder content now, to be filled in with real translations in Phase 4.

---

## Phase 4 — Translate the 12 UI namespace files

**Files:** new `src/lib/i18n/locales/de/*.json` (12 files: `auth`, `coach`, `common`, `content`, `dashboard`, `goals`, `missions`, `notifications`, `onboarding`, `plans`, `profile`, `settings`)

- [x] Translate all 515 strings across the 11 non-`content` namespaces (`auth` 61, `coach` 21, `common` 23, `dashboard` 42, `goals` 17, `missions` 17, `notifications` 18, `onboarding` 118, `plans` 125, `profile` 26, `settings` 47 — verified by counting leaf values, close to Hungarian's actual per-namespace counts), using `en/*.json` as the structural source of truth (key-for-key — `pl`/`hu` are secondary references for tone/plural handling, not the copy source)
- [x] Handle pluralized keys for German's `{one, other}` category set — same bases as before (`errors.incorrectPinWithAttempts`, `expenseCount`, `daysLeft`, `incomeSources`, `goals`, `devices`, `aiMessages`, `emailReports`, `trialDays`, `monthsAway`, `keepBody`, `weeklyReflection.body`) — wrote genuinely distinct `_one`/`_other` forms throughout (e.g. `"1 Versuch übrig"` vs `"{{count}} Versuche übrig"`), unlike Hungarian's near-identical forms
- [x] Added `common.json`'s `language.de: "Deutsch"` self-name (endonym) entry — **and** added the same `de: "Deutsch"` key to the three existing `en/common.json`, `pl/common.json`, `hu/common.json` files (this is how the language picker gets a label for German; `app/settings.tsx`/`app/onboarding.tsx` read `t(\`common:language.${code}\`)` generically off `SUPPORTED_LANGUAGES`, no other UI code change needed)
- [x] Translated `content.json` — all 121 catalog entries (30 missions, 15 lessons, 12 achievements, 10 goal templates, 26 countries incl. the existing `DE`, 20 currencies incl. the existing `EUR`, 8 expense categories)
- [x] `npm test -- locales.test.ts` — 66/66 passing: exact key parity for `de` across all 12 namespaces, correct `{one, other}` plural suffixes throughout, no `{{symbol}}{{amount}}` baked-in copy
- [x] `npm run typecheck` — only Phase 5's `plurals.test.ts` error remains
- [ ] **Known, expected breakage (not a Phase 4 regression):** full `npx vitest run` now shows 2 failures in `detect.test.ts` — its `'de'`/`'de-AT'` assertions were written as *examples of an unsupported language* before this plan; now that German is real they fail as predicted. This is explicitly scoped to Phase 8, not fixed here.

---

## Phase 5 — Real fixture-based plural test

**Files:** `src/lib/i18n/plurals.test.ts`

- [x] Added a `de` row to the `CASES` record using the real translated `de/auth.json` fixture for `auth:errors.incorrectPinWithAttempts` at counts 1, 2, 5, 22 — genuinely different `_one`/`_other` wording confirmed (`"Versuch übrig"` vs `"Versuche übrig"`), unlike Hungarian's near-identical forms
- [x] Registered `deAuth` in the test's `beforeAll` i18next resources
- [x] `npm run typecheck` — **fully clean, 0 errors**, exactly as predicted
- [x] `npx vitest run src/lib/i18n/plurals.test.ts` — 19/19 passing
- [x] Full `npx vitest run` — 349/351 passing; the only 2 remaining failures are the known Phase 8 `detect.test.ts` cases

---

## Phase 6 — Catalog ↔ content.json parity

**Files:** `src/lib/i18n/contentParity.test.ts`

- [x] **No `catalogs.ts` changes needed** — Germany/EUR already existed as catalog entries; German's `content.json` (from Phase 4) translated the existing `countries.DE`/`currencies.EUR` ids like any other catalog entry
- [x] Imported `deContent` and added `de: deContent` to the hardcoded `Object.entries({ en: enContent, pl: plContent, hu: huContent, de: deContent })` lesson `correctKey` check — the one guardrail in the #122 recipe not derived automatically from `SUPPORTED_LANGUAGES`
- [x] `npm run typecheck` — still fully clean
- [x] `npx vitest run src/lib/i18n/contentParity.test.ts src/lib/i18n/locales.test.ts` — 84/84 passing, confirming bidirectional catalog↔translation parity for every catalog including `de`

---

## Phase 7 — Native locale scaffolding

**Files:** `app.json`, new `languages/de.json`

- [x] Added `"de": "./languages/de.json"` to `expo.locales`
- [x] Added `"de"` to `expo.ios.infoPlist.CFBundleLocalizations`
- [x] Created `languages/de.json` with the Face ID permission string translated: `"Erlaube Piggy, die App per Face ID zu entsperren."`
- [x] `android/`/`ios/` are gitignored, native-generated (Expo prebuild) — no manual native-project edits needed
- [x] Both JSON files validated as syntactically correct; `npm run typecheck` still clean

---

## Phase 8 — Recommended (not blocking): extend format/regression tests, fix stale `de` assertions

**Files:** `src/lib/i18n/format.test.ts`, `src/lib/i18n/contributionMoneyFormatting.test.ts`, `src/lib/i18n/detect.test.ts`

- [x] `format.test.ts`: added `de` cases alongside the existing `pl`/`hu` ones — thousands grouping with the `.` separator (incl. below 10,000), comma decimal separator, `formatMoney` with EUR (`€1.000`, symbol before), `formatMonthYear`/`formatDate` with real German month names and the day-before-month convention (`"August 2026"` / `"16. August 2026"`)
- [x] `contributionMoneyFormatting.test.ts`: added a `de` + EUR case at all 3 `ContributionStep` interpolation sites, using the real translated `de/onboarding.json` copy
- [x] `detect.test.ts`: added `matchSupportedLanguage('de')` / `'de-DE'` assertions to the *supported*-language tests — **and** fixed the two stale assertions that used `'de'`/`'de-AT'` as examples of an *unsupported* language, swapping them to `'it'` / `'it-IT'`
- [x] `npm run typecheck && npx vitest run` — fully clean: 0 typecheck errors, 356/356 tests passing (up from 349/351 with 2 known failures before this phase)

---

## Phase 9 — Full verification and review

- [ ] `npm run typecheck && npm test && npm run check:bundle-size` — all clean (budget: 8,000,000 bytes iOS; Hungarian added +0.43 MB, expect a similar bump from German's ~12 new JSON files)
- [ ] Manual Simulator/on-device smoke test: confirm the Metro/Hermes runtime loads the German plural-rules locale data at boot with no errors, and that the language picker in Settings and onboarding both offer German and switch the UI correctly
- [ ] On-device review pass for text length/line wrap — German compound words and capitalized nouns are a real risk for buttons/chips/labels, check these especially
- [ ] Native-speaker copy review — treat all German copy from Phase 4 as a first draft pending this review, same as Polish (`441f342`, `371a910`) and Hungarian
- [ ] Fix anything the review surfaces, re-run verification

---

## Out of scope (flagging, not doing here)

- **n8n coach / Deep Analysis backend prompts.** Same caveat as the Hungarian plan — `language` is already passed through to the n8n backend, but whether `CLAUDE_coach_reply`/Deep Analysis actually produce good German output is a backend-prompt question for a separate follow-up, not this repo's code.
- **`README.md`'s stale "English and Polish" line** — already stale after Hungarian shipped; worth a fix but not part of this plan unless requested.

---

## Verification summary (end state)

- `npm run typecheck` — clean, no new errors
- `npm test` — clean, `locales.test.ts` / `plurals.test.ts` / `contentParity.test.ts` all passing for `de` alongside `en`/`pl`/`hu`
- `npm run check:bundle-size` — within budget
- Settings and onboarding language pickers offer German with no code change beyond Phase 4's `common.json` entries (both already read `SUPPORTED_LANGUAGES` generically)
- Onboarding country/currency picker already offers Germany/EUR (pre-existing, now with German-language display copy too)
- On-device/native-speaker review completed and any findings fixed
