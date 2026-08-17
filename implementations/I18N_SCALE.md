# Internationalization — scalability hardening

Follow-up to [I18N_PL.md](I18N_PL.md). That plan added Polish and got the *architecture* right.
This one fixes the **guardrails**, which were built to verify that one migration rather than to
constrain the next one.

- **Tracking issue:** [#122](https://github.com/Koin-App-Official/pignify/issues/122)
- **Branch:** `refactor/issue-122-i18n-scale-hardening` (off `main`, after `feat/issue-120-i18n-polish` merges)
- **Baseline:** `feat/issue-120-i18n-polish` @ `3c30bbc` — 281 tests passing, 12 namespaces, `en` + `pl`
- **Goal:** adding language #3 must be a *mechanical* change where every omission is caught by
  `npm run typecheck` or `npm test`, never by a user.

---

## The problem being solved

From the audit of the current branch, ranked by how badly each one fails:

| # | Finding | Fails how? |
|---|---|---|
| 1 | `resources` in [i18n/index.ts:44](../src/lib/i18n/index.ts:44) is an unannotated `as const`, never cross-checked against `SupportedLanguage` | **Silent.** Add `'de'` to `SUPPORTED_LANGUAGES` → picker gains a button, every key falls back to `en`, `missingKeyHandler` never fires, typecheck + CI pass |
| 2 | [locales.test.ts](../src/lib/i18n/locales.test.ts) hardcodes `'en'`/`'pl'`, `EN_SUFFIXES`/`PL_SUFFIXES`, and `expect(namespaces.length).toBe(12)` | **Silent.** A `locales/de/` directory is entirely unchecked |
| 3 | 22 dynamic-key sites (`missions.${slug}`, `countries.${code}`, `achievements.${id}`…) resolve IDs from TS catalogs; nothing tests catalog ↔ `content.json` parity | Dev throw / prod raw key label. Currently in sync by care, not enforcement |
| 4 | Lesson `options` is a `returnObjects` array; `correctIndex` lives in [lessons.ts](../src/lib/lessons.ts). Parity test treats arrays as leaves — length and order unchecked | **Silent + wrong answers** in a financial-literacy quiz |
| 5 | 3 keys bake `{{symbol}}{{amount}}` order into copy and pass raw numbers; 5 more sites hardcode the symbol as an input prefix | **Live bug today:** PLN users see `zł1000/mies.`, ungrouped, `.` decimal separator |
| 6 | Dead English duplicated in `MISSION_CATALOG`, `LESSONS`, `DEFAULT_ACHIEVEMENTS`, `COUNTRIES`, `CURRENCIES`, `GOAL_TEMPLATES`, `EXPENSE_CATEGORIES`, and 9 `gateInfo` branches | Two sources of truth; reviewers can't tell which is live |
| 7 | `detectDeviceLanguage` and [onboarding.tsx:1411](../app/onboarding.tsx:1411) are `=== 'pl' ? … : …` ternaries; Settings switcher is a row of `flex-1` buttons | Needs rewriting, not extending. UI breaks past ~3 languages |

### Explicitly out of scope

- **RTL** (`I18nManager`, logical margins/padding). Zero usage today. Real work, but only pays off
  when Arabic/Hebrew is an actual product decision — don't pre-build it.
- **Versioning the n8n coach / Deep Analysis prompts in-repo.** Each new language carries an
  unversioned backend prompt change CI can't see. Worth fixing; belongs to the n8n workflow set,
  not this branch. Recorded in Phase 8's handoff notes instead.
- **Adding an actual third language.** This plan makes it *safe*; it does not ship one.

---

## Phase 0 — Setup

- [x] Create the tracking GitHub issue (per `GITHUB_ISSUES_GUIDE.md`) and record its number above — [#122](https://github.com/Koin-App-Official/pignify/issues/122)
- [x] Branch `refactor/issue-122-i18n-scale-hardening` off `main`, once `feat/issue-120-i18n-polish` (#120) has merged
- [x] Confirm green baseline: `npm run typecheck && npm test` (expect 281 passing) — clean, 281/281

---

## Phase 1 — Make locale completeness a compile error

The single highest-value change. Everything after this is cheaper because the compiler starts
carrying the load.

**Files:** `src/lib/i18n/index.ts`, `src/lib/i18n/detect.ts`

- [x] Export `Namespace` as `keyof typeof enResources` from `index.ts` (not `detect.ts` as
      originally sketched — `detect.ts` has no resource bundle to derive it from, and importing one
      from `index.ts` would be circular since `index.ts` already imports `detect.ts` for
      `SupportedLanguage`/`SUPPORTED_LANGUAGES`. `Namespace` is exported from `index.ts` instead,
      still a single source of truth, just not the file originally named)
- [x] Annotate `resources` in `index.ts` as
      `as const satisfies Record<SupportedLanguage, Record<Namespace, unknown>>` so a missing
      locale is a type error
- [x] Replace `supportedLngs: SUPPORTED_LANGUAGES as unknown as string[]` with a properly typed
      spread — the `as unknown as` cast is what let the mismatch hide (turned out to be
      unnecessary: `readonly SupportedLanguage[]` is directly assignable to i18next's
      `readonly string[]`, no cast needed at all)
- [x] Move the `@formatjs/intl-pluralrules/locale-data/*` imports behind a
      `Record<SupportedLanguage, () => Promise<unknown>>` map so a new language cannot be added
      without its CLDR plural data (currently two loose `await import()` lines)

**Verification**

- [x] Temporarily add `'de'` to `SUPPORTED_LANGUAGES`; `npm run typecheck` must fail on
      `resources`, the plural-data map, `format.ts`'s three records, and `calendarLocale.ts`'s two
      — 6 distinct errors, none silent. Revert. — **confirmed**: exactly those 6 errors, each naming
      the missing `'de'` key and the file/line. Reverted; `typecheck` + `test` (281/281) clean again.

---

## Phase 2 — Make the test net locale-agnostic

**Files:** `src/lib/i18n/locales.test.ts`, `src/lib/i18n/plurals.test.ts`

- [x] Derive the locale list from `readdirSync(LOCALES_DIR, { withFileTypes: true })` and assert it
      equals `[...SUPPORTED_LANGUAGES].sort()` (catches both "folder with no registration" and
      "registration with no folder")
- [x] Replace the hardcoded `expect(namespaces.length).toBe(12)` with a per-locale cross-check
      (`${locale}: has exactly the same namespace files as en`) against the same sorted namespace
      list `en`'s directory produces
- [x] Compare every locale against `en` (the source locale) in a loop over `localeDirs`, not `en`
      vs `pl` literally
- [x] Derive expected plural suffixes per locale from `Intl.PluralRules` — **not** directly from
      `resolvedOptions().pluralCategories`, see the next line for why — replacing the `EN_SUFFIXES`
      / `PL_SUFFIXES` literals with `requiredPluralSuffixes(locale)`, which unions
      `Intl.PluralRules(locale).select(n)` over `n = 0..200` (covers every CLDR `pl` band —
      11-14, 22, 25, 101, 112 — without hardcoding the bands)
- [x] Resolved the `other`-for-fractions question, as a comment rather than a runtime assertion:
      `resolvedOptions().pluralCategories` for `pl` includes `other`, but verified
      (`Intl.PluralRules('pl').select(1.5)` → `'other'`, `.select(0.5)` → `'other'`) that CLDR `pl`'s
      `other` fires **only** for non-integer counts. Grepped every pluralized `pl` key
      (`incorrectPinWithAttempts`, `expenseCount`, `daysLeft`, `body`, `incomeSources`, `goals`,
      `devices`, `aiMessages`, `emailReports`, `trialDays`, `monthsAway`, `keepBody`) and confirmed
      none authors an `_other` variant today — consistent with the app only ever pluralizing on
      integer counts (attempts, days, goals, devices, months…). `requiredPluralSuffixes` derives
      this by unioning `.select(n)` over integers only, so it reproduces exactly `{one, few, many}`
      for `pl` and `{one, other}` for `en` without hardcoding either — no separate runtime assertion
      needed beyond that. A hard runtime guarantee that no caller ever passes a fractional `count`
      isn't practical to assert statically; documented as an invariant enforced by convention, not
      by a check
- [x] Generalized `plurals.test.ts`: `CASES` is now `Record<SupportedLanguage, Array<[count,
      expectedFragment]>>` with `describe.each`/`it.each` replacing the two copy-pasted `describe`
      blocks — a locale added to `detect.ts` without a `CASES` entry is a type error, the same
      exhaustiveness shape as Phase 1's `resources`

**Verification**

- [x] Create a throwaway `locales/de/` with a single namespace file; the suite must fail with a
      clear "missing namespaces" message rather than passing. Delete it. — **confirmed**: scaffolded
      `locales/de/common.json` only. First failure was
      `locale registration > every locales/ directory is registered…` —
      `expected [ 'de', 'en', 'pl' ] to deeply equal [ 'en', 'pl' ]`; second was
      `de: has exactly the same namespace files as en` — `expected [ 'common' ] to deeply equal
      [ 'auth', 'coach', … ]`. 25 of 52 tests in the file failed, each naming the exact gap. Deleted
      the scratch directory; `typecheck` + `test` (283/283 — 2 more than Phase 1's 281, from the new
      per-locale registration tests) clean again.

---

## Phase 3 — Guard the dynamic-key surface

The 22 dynamic-key sites are invisible to both the compiler and the parity test.

**Files:** new `src/lib/catalogs.ts`, new `src/lib/i18n/contentParity.test.ts`, `src/lib/i18n/locales.test.ts`,
`src/lib/store.ts`

- [x] **Extraction, as preferred:** moved `Achievement`, `DEFAULT_ACHIEVEMENTS`, `GOAL_TEMPLATES`,
      `COUNTRIES`, `CURRENCIES`, `EXPENSE_CATEGORIES` out of `store.ts` into a new
      `src/lib/catalogs.ts` — no AsyncStorage/native imports, vitest-importable directly.
      `store.ts` now imports them and re-exports `Achievement` (type), `GOAL_TEMPLATES`,
      `COUNTRIES`, `CURRENCIES`, `EXPENSE_CATEGORIES` unchanged, so every existing `@/lib/store`
      call site (`app/onboarding.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/goals.tsx`,
      `app/(tabs)/profile.tsx`, `ContributionStep.tsx`, `AddExpenseModal.tsx`) needed zero edits.
      `DEFAULT_ACHIEVEMENTS` stays store-internal (was never externally exported before either).
      `store.ts` shrank by ~90 lines
- [x] New test ([contentParity.test.ts](../src/lib/i18n/contentParity.test.ts)) asserting every
      catalog ID has a `content.json` entry, and vice versa, for all seven catalogs:
      `MISSION_CATALOG`, `LESSONS`, `DEFAULT_ACHIEVEMENTS`, `GOAL_TEMPLATES`, `COUNTRIES`,
      `CURRENCIES`, `EXPENSE_CATEGORIES` — confirmed 30 / 15 / 12 / 10 / 25 / 19 / 8, all in sync.
      Checked against `en` only, since Phase 2's locale-parity test already covers en↔every-locale
      transitively (documented in the test file's header comment). Added lightweight shape checks
      alongside parity (missions/achievements have non-empty title+description; lessons have
      topic/question/explanation + exactly 3 non-empty options) — deeper lesson-answer-integrity
      checks are Phase 4's job, not duplicated here
- [x] Applied the `id.replace(/\./g, '-')` slug rule for missions only (matching
      `renderMissionCopy`'s actual behavior) — confirmed lessons and achievements deliberately do
      **not** slugify (`LessonQuizModal.tsx` and `store.ts`'s achievement-copy lookup both key on
      the raw id), so applying the mission rule to those would have been wrong, not just redundant
- [x] Covered the other dynamic namespaces (`autoLock.*`, `legal.*`, `goal.chips.*`,
      `welcome.slides.*`, `missions:tier*`, `downgradeSelection.retentionResource.*`,
      `calendarModal.*`) in a second `describe` block in the same test file — **with a caveat,
      documented in the file**: unlike the seven catalogs, these id lists live inside React Native
      screen/component files (`settings.tsx`, `onboarding.tsx`, `calendar-modal.tsx`, `welcome.tsx`,
      `retention.ts`'s local `checks` array) that either aren't vitest-importable or don't export
      the list, so each is hardcoded in the test from its source with a comment pointing at the
      real array. That means this half catches "JSON key renamed/removed without updating the
      source" but **not** "id added at the source without updating this test" — a real, accepted
      gap, not fixed here (extracting five one-off UI arrays into importable modules wasn't judged
      worth the churn for this phase)
- [x] Extended `collectKeys` in `locales.test.ts` to descend into arrays by index
      (`lessons.<id>.options[0]`, `…[1]`, `…[2]`) instead of treating an array as one opaque leaf —
      **verified live**: truncated `pl/content.json`'s `emergency-fund` lesson to 2 options, reran
      the suite, got `keys only in en/content.json: [ 'lessons.emergency-fund.options[2]' ]` — the
      same failure shape as every other parity gap. Reverted the scratch edit

---

## Phase 4 — Lesson answer integrity

Wrong answers marked correct is the worst failure mode in this list, and it gets one fresh chance to
happen per language.

**Files:** `src/lib/lessons.ts`, `src/components/LessonQuizModal.tsx`, `src/lib/lessons.test.ts`,
`src/lib/i18n/contentParity.test.ts`, both locales' `content.json`

- [x] `content.json`'s `lessons.<id>.options` converted from a positional 3-element array to a
      keyed object (`{ "a": ..., "b": ..., "c": ... }`) in **both** `en` and `pl` — done as a
      surgical line-level rewrite (regex-matched exactly the 15 `"options": [...]` lines per file),
      not a full `JSON.stringify` re-serialization, which would have reformatted the entire
      280-line file and buried a 15-line semantic change in a 486-line diff. Verified both files
      still parse and the escaped-quote case (`index-funds`'s `\"winning\"`) survived intact
- [x] Replaced `correctIndex: 0 | 1 | 2` with `correctKey: LessonOptionKey` (`'a' | 'b' | 'c'`) in
      `lessons.ts`; `Lesson.options` is now `Record<LessonOptionKey, string>` to match. Added
      `LESSON_OPTION_KEYS: readonly LessonOptionKey[] = ['a', 'b', 'c']` as the one fixed render
      order — the point being that display order must never be derived from
      `Object.keys()`/`Object.values()` on a *translated* options object, whose serialized key
      order in a JSON file carries no runtime meaning and shouldn't be trusted to carry any
- [x] `LessonQuizModal.tsx`: `selected` state is now `LessonOptionKey | null`; the options row maps
      over `LESSON_OPTION_KEYS` (not the translated object's own iteration order) and indexes into
      the fetched `Record<LessonOptionKey, string>` by key; `isCorrect`/`isAnswer` compare against
      `lesson.correctKey` instead of a numeric index
- [x] Updated `lessons.test.ts`: options check now asserts the key set is exactly `{a,b,c}} sorted,
      each non-empty; the old "correctIndex is a valid index" test became "correctKey names one of
      the lesson's own options" (trivially true by the type, kept as a regression guard)
- [x] Assert the answer key exists in every locale's option set — new test in
      `contentParity.test.ts`, **checked per locale** (`en` and `pl` both, not just `en`): for every
      `LESSONS` entry, `Object.keys(content.lessons[id].options)` must contain `lesson.correctKey`.
      This is deliberately not folded into the en-only shortcut the other catalog tests use, since a
      `pl`-only structural gap (a locale's `options` object missing the correctKey) is exactly the
      failure this check exists to catch

**Verification**

- [x] Manually reorder one `pl` lesson's options in a scratch edit; the suite must fail. Revert. —
      **first attempt was the wrong test and taught something real**: swapping the *values* under
      keys `a`/`c` in `pl`'s `emergency-fund` passed cleanly (18/18). That's correct, not a gap —
      keyed lookup is order-independent by construction, so no automated check can catch "the
      translator wrote the wrong text under the right key" any more than the old positional array
      could catch "the translator put the wrong text at the right index"; that failure mode was
      never fixable by structure, only by human review. What Phase 4 actually eliminates is
      *incidental* reordering — a JSON formatter, a merge conflict, cut-and-paste — silently
      flipping which answer counts as correct, which a keyed object structurally cannot do. Redid
      the scratch edit as the failure Phase 4's tests are actually built for: renamed `pl`'s
      `emergency-fund.options.a` key to `.x`. That failed **two** tests independently — Phase 2's
      general key-parity test (`keys only in en/content.json: [ 'lessons.emergency-fund.options.a' ]`)
      and the new correctKey-integrity test (`pl/content.json lessons.emergency-fund.options:
      expected [ 'b', 'c', 'x' ] to include 'a'`) — both naming the exact lesson and key. Reverted;
      `typecheck` + `test` (301/301) clean again

---

## Phase 5 — Make money formatting an enforced boundary

Fixes the one finding that is a **live user-visible bug**, and closes the hole that let it happen.

**Files:** `src/components/ContributionStep.tsx`, `app/onboarding.tsx`, `app/(tabs)/goals.tsx`,
`src/components/AddExpenseModal.tsx`, new `src/components/ui/currency-amount-input.tsx`,
`src/lib/catalogs.ts`, `src/lib/store.ts`, `src/lib/i18n/locales/{en,pl}/onboarding.json`,
new `src/lib/i18n/contributionMoneyFormatting.test.ts`, `src/lib/i18n/locales.test.ts`

- [x] Removed `{{symbol}}` from `contribution.suggestionChip`, `contribution.reachGoalBy`, and
      `contribution.amountPerMonth` in **both** locale files; each now interpolates a single
      preformatted `{{amount}}`
- [x] Routed `ContributionStep.tsx`'s suggestionChip/reachGoalBy/amountPerMonth through
      `formatCurrency(n, currency, language)` — previously `contributionNumber` and
      `requiredMonthly.toFixed(2)` went in raw, so PLN got no thousands grouping and a `.` decimal
      separator instead of `,`
- [x] Fixed the symbol-as-prefix input affixes — **4 sites**, not 5: `ContributionStep.tsx`,
      `onboarding.tsx` (target amount + income), `goals.tsx` (create-goal target amount). The
      original audit's "5" was an overcount — `AddExpenseModal.tsx`'s currency mention is a field
      *label* (`"Amount (zł)"`), not a positional prefix character, and doesn't have the bug (see
      the `amountLabel` bullet below). Extracted the shared
      [`CurrencyAmountInput`](../src/components/ui/currency-amount-input.tsx): one component
      instead of 4 copies, rendering the symbol on whichever side `symbolAfter` says it belongs.
      Centralized the `v.replace(/[^0-9.]/g, '')` numeric sanitization inside it too — all 4 sites
      had that exact regex duplicated inline
- [x] Consolidated the 4 duplicated currency-symbol lookups (`ContributionStep.tsx`,
      `onboarding.tsx`, `goals.tsx`'s inline expression, `AddExpenseModal.tsx`) into
      `getCurrency`/`getCurrencySymbol` in [catalogs.ts](../src/lib/catalogs.ts) (natural home,
      since `CURRENCIES` already lives there post-Phase-3), re-exported from `store.ts` for the
      existing `@/lib/store` import pattern every call site already used. `getCurrency` returns
      `symbolAfter` too, which the old symbol-only helpers didn't expose — that's what let 4 input
      affixes hardcode symbol-before regardless of the currency
- [x] Consolidated the two identical `formatTargetDate` wrappers (`onboarding.tsx`, `goals.tsx`) by
      deleting them outright and calling `formatMonthYear` directly at both call sites — they were a
      literal one-line passthrough, so there was nothing to "extract," only to remove
- [x] Added the `{{symbol}}{{amount}}`/`{{amount}}{{symbol}}` lint-style test in `locales.test.ts`,
      scanning every string leaf (through nested objects and arrays) across every locale × namespace
- [x] Verified `dashboard.json`'s `amountLabel: "Amount ({{symbol}})"` / `"Kwota ({{symbol}})"` —
      confirmed it's a standalone field label above a separate numeric input (no adjacent
      `{{amount}}` in the same string), the same idiomatic "Amount ($)" pattern used regardless of
      `symbolAfter` in the source language too. Correctly left alone, as was
      `onboarding.json`'s `currencyDisplay: "{{symbol}} — {{name}}"` (currency picker row, no amount
      involved at all)

**Verification**

- [x] Unit-tested `pl` + `PLN` renders `1 000 zł` (NBSP U+00A0) and `1 234,56 zł` at each of the 3
      fixed sites — new
      [contributionMoneyFormatting.test.ts](../src/lib/i18n/contributionMoneyFormatting.test.ts)
      exercises the *real* i18next interpolation of the shipped `pl` copy with a
      `formatMoney`-produced `{{amount}}` (the same composition `ContributionStep.tsx` performs at
      render time), plus an `en`/USD regression guard. All 4 pass. Full suite: **306/306** passing
      (up from 301), `typecheck` clean, `check:bundle-size` still within budget
      (6.17 MB / 7.63 MB, +0.39 MB vs. baseline)
- [ ] On-device check of the contribution step with `pl` + `PLN` — **left to the user's own review
      pass**, not pushed to simulator/browser verification here

---

## Phase 6 — Delete the duplicate English

Every dead fallback is a second source of truth that drifts. All three optional-`t` signatures exist
only so tests can skip `t`; the fix is to give the tests a real `t`, not to keep English in two
places.

**Files:** `src/lib/entitlements.ts`, `src/lib/missions.ts`, `src/lib/lessons.ts`,
`src/lib/retention.ts`, `src/lib/pin.ts`, `src/lib/catalogs.ts`, `src/lib/storeMigrations.ts`,
plus their `.test.ts` files, new `src/lib/i18n/testInstance.ts`

- [x] Added `createTestT(ns)` in [testInstance.ts](../src/lib/i18n/testInstance.ts) — a shared
      vitest helper building a real `i18next` instance from the shipping `en` locale JSON (read off
      disk, not imported, so it has zero coupling to `store.ts`/AsyncStorage). Named `createTestT`
      rather than the sketched `createTestI18n`, since it hands back the `t` function callers
      actually need, not an i18next instance to unwrap
- [x] Made `t` **required** in `gateInfo` and deleted all 9 English fallback pairs; all 3 real call
      sites already passed `tPlans`. No test called `gateInfo` directly (no `entitlements.test.ts`
      exists), so no test updates needed there
- [x] Made `t` required in `renderMissionCopy`; updated the two 3-arg calls in `missions.test.ts` to
      pass a `tContent` built via `createTestT('content')`
- [x] Made `t` required in `validateRetentionSelection`; updated all 4 call sites in
      `retention.test.ts` to pass a `tPlans` built via `createTestT('plans')` — the exact-wording
      assertions (`errors.some((e) => e.includes('goals'))`) still pass unchanged, since `plans.json`'s
      `retentionResource.goals` is literally `"goals"` in English
- [x] Dropped `title` / `description` from `MissionDef` and all 30 catalog entries. Also updated the
      `compliance: no mission requires spending money` test (`missions.test.ts`) — it used to read
      `def.title`/`def.description` directly; now reads `content.json`'s `en` copy by slug, since
      that's genuinely where the English text lives and the banned-word regex is English-specific
      (checking translated `pl` copy against it would be meaningless)
- [x] Dropped `topic` / `question` / `options` / `explanation` from `Lesson` and all 15 entries,
      keeping only `id` + `correctKey` from Phase 4. `lessons.test.ts`'s now-meaningless
      copy-shape/non-empty checks were removed outright (that coverage already exists in
      `contentParity.test.ts`, which is the actual source of truth for that copy)
- [x] Dropped `name` from `GOAL_TEMPLATES`, `COUNTRIES`, `CURRENCIES`, `EXPENSE_CATEGORIES` in
      `catalogs.ts` (kept `code` / `currency` / `symbol` / `symbolAfter` / `icon` /
      `suggestedAmount`) — confirmed via grep first that no live call site read `.name` off any of
      the four (every display already went through `t()`/`tContent()`)
- [x] Dropped `title` / `description` from `Achievement` and `DEFAULT_ACHIEVEMENTS`. Added the
      `v5 → v6` migration in [storeMigrations.ts](../src/lib/storeMigrations.ts) stripping both
      fields from every persisted achievement (`id`/`icon`/`unlocked`/`unlockedAt` are the only
      fields any real read site touches), following the v4→v5 pattern exactly, plus 3 new migration
      tests. This also required updating 2 pre-existing `storeMigrations.test.ts` assertions that
      ran the full v0→current chain and asserted on the now-stripped shape
      (`PIGGY_STORE_VERSION` literal, and the v0 payload's `achievements` equality check)
- [x] Confirmed `src/lib/pin.ts`'s `validatePinStrength(pin, t: TFunction<'auth'>)` already has the
      required-`t` signature with no fallback branch — the pattern every other function above was
      brought in line with. Left unchanged, as expected

**Tradeoff accepted knowingly, confirmed in practice:** the catalogs are no longer readable in
isolation — `missions.ts`'s 30 defs, `lessons.ts`'s 15 entries, and `catalogs.ts`'s reference data
now read as bare structural/logic objects, with every reader needing `content.json` open alongside
to know what a mission or lesson actually *says*. Phase 3's parity test is what makes this safe:
`typecheck` and all 307 tests (up from 281 at the start of this plan) stayed green through every
deletion in this phase specifically because a missing or mismatched `content.json` entry would have
failed loudly, not silently.

**Verification:** `npm run typecheck && npm test && npm run check:bundle-size` — clean, 307/307,
6.16 MB / 7.63 MB (+0.38 MB vs. baseline).

---

## Phase 7 — Language-count-agnostic UI and detection

**Files:** `src/lib/i18n/detect.ts`, `src/lib/i18n/detect.test.ts`, `app/settings.tsx`,
`app/onboarding.tsx`, `src/lib/i18n/locales/{en,pl}/{common,settings,onboarding}.json`

- [x] Rewrote `detectDeviceLanguage` from `=== 'pl' ? 'pl' : 'en'` to a lookup against
      `SUPPORTED_LANGUAGES` — extracted as a separate pure `matchSupportedLanguage(languageCode)`
      function rather than inlining the lookup, since `expo-localization` itself never resolves
      under vitest at all (throws immediately, always hitting the `catch → 'en'` branch), so the
      matching logic needed to be reachable independently of the native module to be testable.
      Confirmed via `expo-localization`'s own type definitions that its `languageCode` already
      excludes the region (`'de-AT'` → `languageCode: 'de'`, region lives in `languageTag`
      instead) — the `.split('-')[0]` in `matchSupportedLanguage` is accordingly defensive against
      a caller ever passing a full tag, not compensating for a real gap in that API today
- [x] Extended `detect.test.ts` with `matchSupportedLanguage` cases: bare supported code, region
      suffix stripped (`pl-PL` → `pl`), unsupported code, a region tag whose base is unsupported
      (`de-AT` → `en`, the exact case named above), and null/undefined/empty-string
- [x] Replaced both `code === 'pl' ? … : …` ternaries in `onboarding.tsx` (the inline
      `languageName` and the language `PickerModal`'s `items`) with `t(\`common:language.${code}\`)`
      — **moved to `common.json`, not left as bare `language.*`** as the plan sketched, since after
      the move neither `onboarding.json` nor `settings.json` owns that key group any more; `common`
      is the one namespace already loaded everywhere, reachable via the `namespace:key` prefix
      without adding it to either screen's `useTranslation()` call (confirmed this cross-namespace
      lookup already works elsewhere unprefixed — `missions.tsx` calls `content:achievements....`
      from a hook that never lists `'content'`)
- [x] Replaced the `flex-1` button row in `settings.tsx` with the existing `PickerModal` — added an
      optional `value` slot to the file's own `Row` component (shown before the chevron) so the
      language row reads "Language · English ›" like every other settings row, backward-compatible
      with every other `Row` call site since the prop is optional
- [x] Named each language in its own language — **found this already correct for `en` viewers**
      (`en/settings.json` had `"pl": "Polski"`, not "Polish") **but silently wrong for `pl`
      viewers**: `pl/settings.json` had `"en": "Angielski"` (Polish for "English"), not the
      endonym. Fixed by centralizing both names once, identically, in `common.json`'s new
      `language: {en, pl}` block in **both** locale files — same values in each, since a language's
      own name doesn't change with the viewing language. This is the actual fix, not just a
      re-statement of already-correct behavior: it removes the one asymmetric translated name that
      existed

**Verification:** `npm run typecheck && npm test && npm run check:bundle-size` — clean, **312/312**
passing (up from 307), 6.16 MB / 7.63 MB bundle. Grepped for `languageEn`/`languagePl` and any
stray `language.en`/`language.pl` references across `app/`/`src/` afterward — none remain outside
the new `common:language.*` path.

---

## Phase 8 — Copy-structure hygiene and the proof gate

**Files:** locale JSON files, `src/components/ContributionStep.tsx`, `app/welcome.tsx`,
`src/components/auth/PlanGate.tsx`, `implementations/I18N_SCALE.md`

- [x] **`CustomTypeOptions` — attempted, then explicitly skipped, with evidence.** Wrote
      `src/types/i18next.d.ts` with a full `CustomTypeOptions.resources` typing against the `en`
      bundle and ran `typecheck`: 36 errors. Categorized all 36 rather than assuming — most were the
      anticipated dynamic-key sites (template-literal keys built from a catalog id), but a second,
      larger category surfaced: **any cross-namespace `t('otherNs:key')` call fails type-checking
      whenever the calling `useTranslation()` hook doesn't declare that namespace — even for a
      genuinely static, existing key.** Proved this directly: a throwaway component with
      `useTranslation('onboarding')` calling the literal, real key `t('common:cancel')` failed with
      the identical error shape. Traced the root cause into i18next's own type source
      (`node_modules/i18next/typescript/t.d.ts`'s `ParseKeysByNamespaces`): cross-namespace key
      types are generated only for namespaces in the hook's own declared `Ns`, never globally. This
      codebase relies on this pattern pervasively and legitimately — 42+ static `t('otherNs:key')`
      call sites app-wide (`goals.tsx` → `onboarding:`, `missions.tsx` → `content:`, `PlanGate.tsx` →
      `common:`, this plan's own Phase 7 additions → `common:language.*`) — so making this compile
      would mean either auditing and widening every `useTranslation()` call to declare every
      namespace it ever cross-references (unbounded, easy to miss one), or wrapping 40+ call sites
      in an escape hatch, most of them static and exactly the kind of call typed keys are supposed
      to protect. That crosses the line the task itself drew: **skipped**, per the pre-authorized
      exit. Reverted the `.d.ts` file; confirmed `typecheck` clean again at 0 errors before moving on
- [x] Converted the three-key assembled sentence (`needToSetAside` + `amountPerMonth` +
      `hitDeadlineBy`) into one `needToSetAside` key with an embedded `<bold>{{amount}}</bold>`
      placeholder, rendered via `<Trans>` in `ContributionStep.tsx`. Updated
      `contributionMoneyFormatting.test.ts`'s `amountPerMonth` case to the merged key (the old key no
      longer exists standalone)
- [x] Audited all 12 `\n` values (11 in `onboarding.json`, 1 in `plans.json`). Checked each render
      site's actual layout before deciding, rather than applying one rule everywhere: the 8
      onboarding-screen headlines (`name`/`ageGate`/`localization`/`targetAmount`/`income`/
      `pushPermission`/`contribution.monthlyHeadline`/`contribution.deadlineHeadline`) are plain
      flowing `<Text>` with no fixed height or `numberOfLines` — **removed** their `\n`, since a
      longer natural wrap just pushes the next element down, no overlap risk. The 3 `welcome.tsx`
      slide headlines and `plans.json`'s `trialIntro.title` are deliberate copywriting (e.g. "No bank
      login.\nEver." depends on "Ever." landing alone for its punch, not just visual balance) —
      **kept**, and commented at their render sites (`welcome.tsx`, `PlanGate.tsx`) rather than in the
      JSON itself, since JSON has no comment syntax
- [x] **Proof gate — dry-run language #3, done for real, not as a thought experiment.** Scaffolded
      `de` end to end as working-tree changes (not a git commit — consistent with how every other
      phase's scratch verification in this plan was done): `SupportedLanguage`/`SUPPORTED_LANGUAGES`,
      `locales/de/*.json` (all 12, copied from `en`, not translated — sufficient for a structural
      proof), `resources`/`PLURAL_LOCALE_DATA` in `index.ts`, `LOCALE_TAG`/`GROUP_SEPARATOR`/
      `DECIMAL_SEPARATOR` in `format.ts`, `LOCALE_TAG`/`TODAY_LABEL` in `calendarLocale.ts`, a `CASES`
      row in `plurals.test.ts`, `app.json`'s `locales`/`CFBundleLocalizations`, `languages/de.json`.
      **Completing the scaffold was itself informative**: `format.ts`/`calendarLocale.ts`/
      `plurals.test.ts` all refused to compile until filled in — confirms Phase 1/2's guardrails hold
      for a genuinely new language, not just for `de` as a stand-in. With the scaffold complete,
      `typecheck` and `test` were clean (326/328 — the only 2 failures were `detect.test.ts` cases
      that use `'de'` as an example of an *unsupported* language, a self-inflicted collision from
      reusing `de` as this dry run's demo code, not a real defect). Then broke it 4 ways, one at a
      time, reverting between each:
      1. **Omitted `resources.de`** → `typecheck` failed immediately: `Property 'de' is missing in
         type '{ en: ...; pl: ... }' but required in type 'Record<SupportedLanguage, ...>'`
      2. **Deleted `common.json`'s `notAvailable` key from `de`** → `locales.test.ts` failed:
         `common: same logical keys in en and de` — `keys only in en/common.json: [ 'notAvailable' ]`
      3. **Deleted option `c` from a `de` lesson** (`lessons.emergency-fund.options`) → caught by the
         *same general* `locales.test.ts` key-parity test, not a special array-length check — because
         Phase 4 turned `options` from a positional array into a keyed object, the pre-existing
         generic recursive key comparison already covers it. A concrete case of one phase's fix
         strengthening an earlier phase's guardrail for free
      4. **Added a `COUNTRIES` entry (`'XX'`) with no `content.json` translation** →
         `contentParity.test.ts` failed: `countries: catalog ids with no translation entry: [ 'XX' ]`

      All 4 caught cleanly, each naming the exact file/key/locale. Reverted the entire scaffold by
      hand (not `git checkout`, since the touched files carried real Phase 1–7 work too) —
      `git status` confirms no residue, `typecheck`/`test` back to exactly 312/312,
      `check:bundle-size` unaffected (6.16 MB / 7.63 MB)
- [x] Wrote the "how to add a language" section below from this dry-run's actual evidence
- [x] `npm run typecheck && npm test && npm run check:bundle-size` — clean, 312/312, within budget
- [ ] Hand off the two out-of-scope items (RTL, versioning the n8n coach/Deep-Analysis prompts) as
      their own tracked issues — **left for the user**, since it needs their GitHub access/judgment
      on issue scope, not something to do unilaterally

---

## How to add a language

Written from Phase 8's dry-run, not from intent — every step below was actually exercised, and each
compiler/test failure cited was actually seen, not predicted.

1. Add the code to `SupportedLanguage` and `SUPPORTED_LANGUAGES` in
   [detect.ts](../src/lib/i18n/detect.ts).
2. Create `src/lib/i18n/locales/<code>/` with all 12 namespace files, translated — not copied. (The
   dry-run copied `en` verbatim, which is enough to prove the *guardrails*, but ships nothing real.)
3. Confirm `@formatjs/intl-pluralrules/locale-data/<code>.js` exists in `node_modules` — it covers
   most CLDR locales already; if not, that's a blocker, not a workaround.
4. Wire [i18n/index.ts](../src/lib/i18n/index.ts): import all 12 files, add the locale's block to
   `resources`, add one line to `PLURAL_LOCALE_DATA`. Skipping either is a compile error, not a
   runtime surprise — confirmed directly in this dry-run.
5. Fill in [format.ts](../src/lib/i18n/format.ts)'s `LOCALE_TAG`/`GROUP_SEPARATOR`/
   `DECIMAL_SEPARATOR` and [calendarLocale.ts](../src/lib/i18n/calendarLocale.ts)'s `LOCALE_TAG`/
   `TODAY_LABEL` — the compiler will refuse to build without these; it doesn't know if the values are
   *correct*, only that they exist.
6. **Do a real Phase-0-style Intl verification pass on the actual Hermes build** for the new
   language — number grouping below 10,000, the exact grouping-separator codepoint, plural category
   resolution at real counts. This dry-run reused `en`'s already-verified values for `de` as a
   placeholder; it did **not** re-run Phase 0's Hermes probe for a new locale, and nothing here does
   that automatically. This is the one step in this list that isn't compiler/test-enforced —
   treat it as a hard requirement anyway, not optional polish.
7. Add a `CASES` row in [plurals.test.ts](../src/lib/i18n/plurals.test.ts) with real fixture words at
   representative counts for the new language's plural categories (derive the category set from
   `new Intl.PluralRules('<code>').resolvedOptions().pluralCategories`, same as Phase 2's
   `requiredPluralSuffixes`).
8. Add the code to `app.json`'s `expo.locales` and `ios.infoPlist.CFBundleLocalizations`, and create
   `languages/<code>.json` for native permission-dialog strings (Face ID, etc.).
9. Translate every `content.json` catalog entry (missions, lessons, achievements, goal templates,
   countries, currencies, expense categories) — `contentParity.test.ts` will name any catalog id left
   untranslated, in either direction.
10. Run `npm run typecheck && npm test && npm run check:bundle-size`. If every step above was done
    correctly, this is clean. If not, the failure names the exact file, key, or locale — that's the
    entire point of this plan.
11. On-device review pass for text length and line wrap. Polish already runs ~13% longer than English
    on average, with some strings 2×+ ("Auto-lock" → "Automatyczna blokada") — a new language may be
    worse. This is a real, necessary step this plan does not and cannot automate.

---

## Sequencing notes

Phases 1 → 2 → 3 are the backbone and should land in order; each makes the next cheaper to verify.
Phase 4 and Phase 5 are independent of each other and of the backbone — Phase 5 fixes a bug users
hit **today**, so pull it forward if this branch will be open for a while. Phase 6 depends on Phase 3
(the parity test is what makes deleting the fallbacks safe) and Phase 4 (the lesson answer-key
change lands first). Phase 7 is independent. Phase 8's proof gate must be last.
