# Add Hungarian (hu) language support

Tracking issue: [#124](https://github.com/Koin-App-Official/pignify/issues/124)
Branch: `feat/issue-124-hungarian-i18n` (off `main`, current `HEAD`)

## Context

The app currently ships English and Polish, and issue [#122](https://github.com/Koin-App-Official/pignify/issues/122) (merged into `main`) rebuilt the i18n architecture specifically so that adding language #3 would be a **mechanical, compiler/test-enforced** change rather than a manually-audited one. That work ended with a real dry-run (scaffolding a throwaway `de` locale, breaking it 4 ways, confirming each break was caught) and a written recipe in [I18N_SCALE.md](I18N_SCALE.md) ("How to add a language", 11 steps). This plan is that recipe applied for real, to Hungarian, plus two things the recipe doesn't cover: a hardcoded `contentParity.test.ts` check that only knows about `en`/`pl` today, and adding Hungary/HUF to the separate country/currency catalogs (per decision below).

Hungarian's CLDR plural system is simpler than Polish's — just `{one, other}` (same shape as English) — so the plural-handling risk here is lower than Polish was. The bigger real risks are: (1) Hungarian's grammatical number rule (nouns after a numeral stay singular — "2 alma", not "2 almák" — so `_one`/`_other` copy will often look deceptively similar and needs care, not copy-paste), and (2) verifying number/date formatting against this app's actual Hermes build, not just Node's ICU (Phase 0 of the original Polish work found real Hermes-specific bugs V8/Node didn't have).

**Decisions:**
- Adding Hungary/HUF to the `COUNTRIES`/`CURRENCIES` catalogs is in scope (Phase 6) — language and country/currency are independent settings in this app, but a Hungarian speaker based in Hungary should be able to pick their real country too, not just the language.
- Claude drafts the full Hungarian translation for every string and catalog entry as part of this plan; the plan ends with an on-device native-speaker review pass — the same review step Polish went through (see commits `441f342`, `371a910`).

Every phase below ends in a state where `npm run typecheck && npm test` is clean — this is what makes the recipe "mechanical": an incomplete phase fails loudly, not silently.

---

## Phase 1 — Core language registration

**Files:** `src/lib/i18n/detect.ts`

- [x] Add `'hu'` to the `SupportedLanguage` union and `SUPPORTED_LANGUAGES` array
- [x] Confirm `@formatjs/intl-pluralrules/locale-data/hu.js` exists in `node_modules` — **confirmed already**, present at `node_modules/@formatjs/intl-pluralrules/locale-data/hu.js`

**Expected result:** this alone breaks the build — `resources` in `index.ts`, the plural-data map, `format.ts`'s three records, and `calendarLocale.ts`'s two records all fail to typecheck, each naming the missing `'hu'` key. That's the guardrail from #122 working as designed; Phase 2–4 below fix each one.

---

## Phase 2 — Formatting data

**Files:** `src/lib/i18n/format.ts`, `src/lib/i18n/calendarLocale.ts`

- [x] `format.ts`: add `hu: 'hu-HU'` to `LOCALE_TAG`
- [x] `format.ts`: add `hu: ' '` (real NBSP, not a lookalike space) to `GROUP_SEPARATOR` — verified via Node's `Intl.NumberFormat('hu-HU').formatToParts()`: group separator codepoint is `0xa0`, decimal separator is `,` (identical convention to Polish); byte-verified in the written file (`\xc2\xa0`)
- [x] `format.ts`: add `hu: ','` to `DECIMAL_SEPARATOR`
- [x] `calendarLocale.ts`: add `hu: 'hu-HU'` to `LOCALE_TAG`
- [x] `calendarLocale.ts`: add `hu: 'Ma'` to `TODAY_LABEL` ("today" in Hungarian)
- [ ] **Hermes verification (not compiler-enforced — do this for real, not skip it):** once the app runs with `hu` selected, confirm on-device (or in the Simulator) that `formatNumber`/`formatMoney` group correctly below 10,000 (Phase 0 of the original Polish work found `Intl.NumberFormat('pl-PL')` on this app's Hermes build silently failed to group under 10k — since `format.ts`'s number formatting is hand-rolled and doesn't call `Intl.NumberFormat` at all, this specific bug class shouldn't reoccur, but confirm rather than assume), and that `formatDate`/`formatMonthYear` (which *do* use `Intl.DateTimeFormat`) render sane Hungarian month names and the year-first date order Node's ICU shows (`"2026. augusztus 16."`)

---

## Phase 3 — Wire the `hu` resource bundle

**Files:** `src/lib/i18n/index.ts`

- [x] Import all 12 Hungarian namespace JSON files (added in Phase 4) alongside the existing `en`/`pl` imports
- [x] Add the `hu` block to `resources`, matching the `en`/`pl` shape exactly (the `satisfies Record<SupportedLanguage, Record<Namespace, unknown>>` annotation makes an incomplete block a compile error)
- [x] Add `hu: () => import('@formatjs/intl-pluralrules/locale-data/hu.js')` to `PLURAL_LOCALE_DATA`

This phase can be stubbed with placeholder content first and filled in once Phase 4's real translations exist, or done last — either order works since it's all compiler-checked.

---

## Phase 4 — Translate the 12 UI namespace files

**Files:** new `src/lib/i18n/locales/hu/*.json` (12 files, one per namespace: `auth`, `coach`, `common`, `content`, `dashboard`, `goals`, `missions`, `notifications`, `onboarding`, `plans`, `profile`, `settings`)

- [x] Translate all ~749 strings across the 11 non-`content` namespaces (`auth` 61, `coach` 21, `common` 21, `dashboard` 42, `goals` 17, `missions` 17, `notifications` 18, `onboarding` 118, `plans` 125, `profile` 26, `settings` 47), using `en/*.json` as the structural source of truth (key-for-key, not `pl` — `pl` is just a second reference for tone/plural handling)
- [x] Handle the pluralized keys correctly for Hungarian's `{one, other}` category set (not Polish's `{one, few, many}`) — e.g. `auth.json`'s `errors.incorrectPinWithAttempts_one` / `_other`, plus the other pluralized bases in `common`/`notifications`/`dashboard` (`expenseCount`, `daysLeft`, `incomeSources`, `goals`, `devices`, `aiMessages`, `emailReports`, `trialDays`, `monthsAway`, `keepBody`, `body`) — remember Hungarian keeps the noun singular after a numeral, so `_one`/`_other` forms will often differ only in the verb/number word, not the noun
- [x] Add `common.json`'s `language.hu: "Magyar"` self-name (endonym) entry — and add the same `hu: "Magyar"` key to the **existing** `en/common.json` and `pl/common.json` files too (this is how the language picker gets its own label — see `app/settings.tsx`/`app/onboarding.tsx`, which read `t(\`common:language.${code}\`)` generically off `SUPPORTED_LANGUAGES`, no other code change needed there)
- [x] Translate `content.json` — done together with the other 11 namespaces rather than deferred to Phase 6, since Phase 6 was reprioritized to just the `HU`/`HUF` catalog additions and the `contentParity.test.ts` manual fix; all missions/lessons/achievements/goalTemplates/countries/currencies/expenseCategories entries that exist in `en` today are translated
- [x] Ran `npm test -- locales.test.ts` — 53/53 passing, exact key parity confirmed for `hu` across all 12 namespaces, correct `{one, other}` plural suffixes throughout

---

## Phase 5 — Real fixture-based plural test

**Files:** `src/lib/i18n/plurals.test.ts`

- [x] Added a `hu` row to the `CASES` record (the `Record<SupportedLanguage, ...>` typing made omitting `hu` a compile error, as expected) using the real translated `hu/auth.json` fixture for `auth:errors.incorrectPinWithAttempts`: count=1/2/5/22 all resolve through `próbálkozásod van` — CLDR `hu` is just `{one, other}` and Hungarian keeps the noun singular after a numeral, so `_one`/`_other` are deliberately near-identical text, unlike `pl`'s three visibly different suffix forms. Also registered `huAuth` in the test's `beforeAll` resources. `npm run typecheck` is now fully clean (0 errors); `plurals.test.ts` 15/15 passing; full suite 329/329 passing

---

## Phase 6 — Catalog ↔ content.json parity

**Files:** `src/lib/catalogs.ts`, `src/lib/i18n/locales/*/content.json`, `src/lib/i18n/contentParity.test.ts`

- [x] Add Hungary and forint to the catalogs: `{ code: 'HU', currency: 'HUF' }` added to `COUNTRIES` in `catalogs.ts`, and `{ code: 'HUF', symbol: 'Ft', symbolAfter: true }` added to `CURRENCIES` — confirmed via Node's `Intl.NumberFormat('hu-HU', {style:'currency', currency:'HUF'})` → `"1 234 567 Ft"`, symbol after amount with a space, matching the existing `zł`/`kr` pattern already in the file
- [x] Add the matching `countries.HU` and `currencies.HUF` display-name entries to **all three** `content.json` files (`en`: "Hungary"/"Hungarian Forint", `pl`: "Węgry"/"Forint węgierski", `hu`: "Magyarország"/"Magyar forint")
- [x] `content.json` catalog entries for `hu` were already fully translated in Phase 4 (30 missions, 15 lessons, 12 achievements, 10 goal templates, 25→26 countries, 19→20 currencies, 8 expense categories)
- [x] **Manually added the `hu` entry to `contentParity.test.ts`'s hardcoded lesson `correctKey` check** (`Object.entries({ en: enContent, pl: plContent, hu: huContent })`) plus the `huContent` import — confirmed this is the one guardrail in the #122 recipe not derived automatically from `SUPPORTED_LANGUAGES`
- [x] `npm test -- contentParity.test.ts src/lib/i18n/locales.test.ts` — 71/71 passing, confirming bidirectional catalog↔translation parity for every catalog including the new `HU`/`HUF` entries
- [x] `npm run typecheck` — clean; `npx vitest run` — 329/329 passing; `npm run check:bundle-size` — 6.21 MB / 7.63 MB (+0.43 MB vs baseline), within budget

---

## Phase 7 — Native locale scaffolding

**Files:** `app.json`, new `languages/hu.json`

- [x] Add `"hu": "./languages/hu.json"` to `expo.locales`
- [x] Add `"hu"` to `expo.ios.infoPlist.CFBundleLocalizations`
- [x] Create `languages/hu.json` with the Face ID permission string translated (mirrors `languages/pl.json`'s single `ios.NSFaceIDUsageDescription` key): `"Engedélyezd a Piggy számára, hogy Face ID-val oldja fel az alkalmazást."`
- [x] Note: `android/` and `ios/` are gitignored, native-generated directories (Expo prebuild/CNG) — no manual native-project edits needed; they regenerate from `app.json` on the next `expo prebuild`. Both JSON files validated as syntactically correct; `npm run typecheck` clean; full suite 329/329

---

## Phase 8 — Recommended (not blocking): extend format/regression tests

**Files:** `src/lib/i18n/format.test.ts`, `src/lib/i18n/contributionMoneyFormatting.test.ts`, `src/lib/i18n/detect.test.ts`

These files hardcode `en`/`pl` test cases rather than deriving from `SUPPORTED_LANGUAGES` (unlike `locales.test.ts`/`plurals.test.ts`, they aren't required to pass for `hu` — nothing here blocks typecheck/test). Adding `hu` cases isn't required by the guardrails, but matches the coverage level Polish got and is worth doing for real confidence:

- [x] `format.test.ts`: added `hu` cases alongside every `pl` one — thousands grouping below 10k, NBSP codepoint check, comma decimal separator, `formatMoney` with HUF (`Ft`, symbol after), `formatMonthYear`/`formatDate` with real Hungarian month names (verified year-first convention: `"2026. augusztus"` / `"2026. augusztus 16."`)
- [x] `contributionMoneyFormatting.test.ts`: added a `hu` + HUF case at all 3 `ContributionStep` sites (`suggestionChip`, `reachGoalBy`, `needToSetAside`), using the real translated `hu/onboarding.json` copy
- [x] `detect.test.ts`: added `matchSupportedLanguage('hu')` / `'hu-HU'` assertions
- [x] `npm run typecheck` — clean; `npx vitest run` — 334/334 passing (up from 329, the 5 new `hu` cases across these 3 files)

---

## Phase 9 — Full verification and review

- [x] `npm run typecheck && npm test && npm run check:bundle-size` — all clean: 0 typecheck errors, 334/334 tests passing, bundle 6.21 MB / 7.63 MB (+0.43 MB vs baseline)
- [~] **Manual Simulator smoke test — partially completed, blocked by tooling, not by the app.** Built a fresh dev-client (`npx expo run:ios`) and connected it live to Metro. The Metro bundler log confirms the real Hermes runtime loaded `@formatjs/intl-pluralrules/locale-data/hu.js` and the polyfill cleanly at boot, with zero errors — direct runtime evidence Phase 3's wiring works outside Vitest too. Could not get further: onboarding's `dob-confirm-modal.tsx` confirmation dialog (a **pre-existing** native alert, unrelated to this i18n work) stopped responding to simulated taps across many coordinates/gesture types via the simulator automation tool, despite live/updating screenshots and no JS errors in the Metro log — this reads as an environment/tooling limitation with that specific alert presentation, not an app defect. Did not reach the language picker or see Hungarian text rendered on-screen as a result.
- [ ] **On-device review pass for text length/line wrap** — the #122 recipe calls this out explicitly as the one step nothing automates (Polish ran ~13% longer than English on average, some strings 2×+). Hungarian tends to run long too (compound words, agglutination) — check headline/button/chip text especially. **Not done** — needs a human to click through the Simulator/device past the point automation got stuck (or debug the tap issue on the dob-confirm-modal directly).
- [ ] **Native-speaker copy review — not done.** Claude drafted every Hungarian string in this plan; nothing here has been checked by a Hungarian speaker. This is the review round the plan always deferred to a human, mirroring the Polish review commits (`441f342`, `371a910`) — treat all Hungarian copy as a first draft pending this review.
- [ ] Fix anything the review surfaces, re-run verification

---

## Out of scope (flagging, not doing here)

- **n8n coach / Deep Analysis backend prompts.** `deepAnalysis.ts` and the coach chat already pass `language` through to the n8n backend (`src/lib/deepAnalysis.ts`, `src/lib/notifications.ts`'s `getFixedT` pattern), but whether the n8n `CLAUDE_coach_reply` / Deep Analysis workflows actually produce good Hungarian output is a backend-prompt question, not something this repo's code controls. The #122 plan explicitly deferred "versioning the n8n coach/Deep Analysis prompts" as its own follow-up issue, for the same reason. Once this plan ships, smoke-test a Hungarian coach conversation and Hungarian deep-analysis report for real — if the AI responses come back in English or broken Hungarian, that's a separate n8n-workflow issue, not a bug in this branch.

---

## Verification summary (end state)

- `npm run typecheck` — clean, no new errors
- `npm test` — clean, `locales.test.ts` / `plurals.test.ts` / `contentParity.test.ts` all passing for `hu` alongside `en`/`pl`
- `npm run check:bundle-size` — within budget (adding one more locale's JSON will grow the bundle; confirm it stays under the existing threshold)
- Settings and onboarding language pickers offer Hungarian with no code change beyond Phase 4's `common.json` entry (both already read `SUPPORTED_LANGUAGES` generically)
- Onboarding country/currency picker offers Hungary/HUF
- On-device/native-speaker review completed and any findings fixed
