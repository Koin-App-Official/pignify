# Improve Hungarian (hu) translation quality

Tracking issue: [#197](https://github.com/Koin-App-Official/pignify/issues/197)
Branch: `fix/issue-197-hungarian-translation-quality` (off `main` @ `7490169`)
Follow-up to: [#124](https://github.com/Koin-App-Official/pignify/issues/124) (added `hu`, see [I18N_HU.md](I18N_HU.md)). That plan ended with the native-speaker review step still open, and this plan is that step.

## Context

[#124](https://github.com/Koin-App-Official/pignify/issues/124) shipped a complete Hungarian bundle, drafted by an AI and never reviewed by a native speaker. The structure is fine: all 810 keys across 12 namespaces exist with exact parity to `en`, the plurals are correct, and nothing falls back to English. The problem is the **copy**. The analysis below found four classes of defect, in decreasing order of severity.

### Source of truth

**English (`src/lib/i18n/locales/en/*.json`) is the only source of truth** for meaning, keys, placeholders and plural shape. `pl`/`de` are not consulted. Every Hungarian string is re-checked against its English original, not against the current Hungarian.

### Findings from the analysis

**1. Grammar broken by interpolation (actual bugs, wrong output at runtime)**

Hungarian attaches case suffixes to words, and the right suffix depends on the word's sound. A suffix hardcoded after a `{{placeholder}}` is therefore wrong for some values:

| Key | Current | Problem |
|---|---|---|
| `goals:detail.projectedFromCapacity` | `…{{date}}-ra érnéd el ezt` | `formatDate` renders `2026. augusztus 16.`, which gives `2026. augusztus 16.-ra` (ungrammatical). A deadline also needs `-ig`, not `-ra` |
| `plans:downgradeSelection.pickUpTo` | `legfeljebb {{count}}-t` | The accusative ending varies with the number: `2-t`, `3-at`, `5-öt`, `10-et`. Only `2` is right |
| 14× `a(z) {{…}}` (`dashboard`, `plans`, `notifications`, `onboarding`) | `a(z) {{goalName}} célra` | `a(z)` reads like a form letter. Plan names (`Beginner`/`Medium`/`Family`, `src/lib/entitlements.ts`) all start with a consonant, so those can simply use `a`. For user-typed goal names the sentence has to be restructured |
| `onboarding:account.subOtpSent` | `Add meg az e-mailben kapott 6 jegyű kódot…` | **Drops `{{email}}` entirely**, so Hungarian users never see which address the code went to. Found in Phase 0; no existing test checks placeholder parity |

**2. Terminology collisions (one Hungarian word, several meanings)**

| English | Current Hungarian | Collision |
|---|---|---|
| upgrade / update / refresh | `frissít…` (21 occurrences) | "Upgrade your plan", "Update your card" and "Update goals" all use the same verb, so an upgrade prompt reads like "refresh your plan" |
| Tier (missions) / Level (profile, dashboard) | both `szint` | The missions tab shows `1. szint` for Tier 1 while the profile shows `{{level}}. szint` for XP level |
| Deep Analysis | `Mélyelemzés` / `Részletes kiadáselemzés` | The same feature has two names in `dashboard` and `plans` |
| email report | `riport` / `jelentés` | Mixed between `plans` and `common:aiConsent` |
| downgrade | `visszaminősítés` | Bureaucratic ("demotion") |

**3. Calques and officialese (grammatical, but reads as translated)**

- 23× the passive `… kerül` construction (`Mi kerül megosztásra`, `eltávolításra kerül`) and 3× `szüneteltetve vannak`. Both are English/German passive structures that a native writer wouldn't use in an app.
- Literal idioms: `Félúton túli hős` (Halfway hero), `Szeretnél egy lökést` (Want a nudge), `{{days}} nap {{plan}} a mi költségünkön` (on us), `Banki bejelentkezés soha.`, `Tartsatok a helyes úton` (addresses the app in the plural).
- Wrong words: `notifications`/`onboarding` `céljelentése` ("goal report", meaningless), `firstGoal.body` `egymást követő napok gyűjtése` (a literal rendering of "streak").
- Missing articles in titles: `Elemzés elindult` should be `Az elemzés elindult`.

**4. Tone**

The bundles already use informal `te` almost everywhere, which matches the decision below. The remaining work is the accessibility hints (`common:aiConsent.allowHint`/`notNowHint`) that switch to a third-person impersonal voice, and making the tone consistently friendly rather than stiff.

`content.json` (238 keys: missions, lessons, achievements, templates, categories, countries, currencies) is noticeably better than the UI namespaces. It needs the terminology pass (e.g. `Vészhelyzeti alap` should be the standard term `vésztartalék`) more than a rewrite.

### DeepL MCP: what it can and can't do here

Tested live on this account:

- ✅ `translate-text` EN→HU works. It's the plain-translation reference for every string.
- ❌ `formality`, `context`, `customInstructions`, `glossaryId`, `styleId` are **DeepL Pro only**. The Free plan rejects them, so tone and terminology can't be enforced through DeepL.
- ❌ `rephrase-text` (DeepL Write) does not support Hungarian.
- ⚠️ DeepL on its own reproduces defect class 2. It translated "Upgrade your plan" as `Frissítsd a csomagodat`.

**How it's used:** for each English string, DeepL gives an independent translation. I then compare three candidates: the current HU, DeepL's HU, and a corrected version that applies the glossary and style rules below. The proposal is whichever is best, adjusted to the glossary. DeepL output is never pasted in unreviewed. DeepL is called in batches of one namespace, with `sourceLang: "EN"`, `targetLangs: ["HU"]` and no Pro-only parameters.

### Decisions

- **Informal `te` form everywhere** (decided 2026-09-26). This includes accessibility hints, which become second person or neutral noun phrases.
- **English is the source of truth.** No key is added, removed or renamed, and `en` is not touched. Key parity is guarded by `locales.test.ts`.
- **Placeholders are immutable.** Every `{{x}}`, `{x}` (single-brace, `content.json` missions, resolved in `src/lib/missions.ts`), `<bold>…</bold>`, `\n` and emoji in the English original must survive. No case suffix is ever attached to a placeholder; sentences get restructured instead.
- **Length constraints from [#175](https://github.com/Koin-App-Official/pignify/issues/175) are kept.** `dashboard:quickAddExpense`/`quickAddSavings` stay single short nouns (`Kiadás`/`Megtakarítás`), and tab labels, chips and buttons may not get longer than their current Hungarian.
- **Every change goes through a review gate.** Each phase produces a before/after table, and nothing is written to a locale file until you approve that table.

---

## Glossary (FINAL, approved 2026-10-04)

Decided by you in Phase 1. Where a row differs from my original proposal, it's your decision and it overrides the earlier analysis.

| English | Hungarian | Notes |
|---|---|---|
| goal | cél | |
| savings plan / Piggy Plan | megtakarítási terv / Piggy terv | |
| subscription plan | előfizetési csomag | may shorten to `csomag` in tight UI where context is clear |
| upgrade (plan) | fejlesztési terv | noun phrase; in verb contexts ("Upgrade to unlock") sentences are built around it |
| downgrade (plan) | visszaminősítési terv | noun phrase, same rule as upgrade |
| update (goal) | cél frissítése | `frissít` now means update only |
| set (money) aside | pénzt félretenni | verb `félretesz`; monthly set-aside: `havi félretétel` |
| savings capacity | megtakarítási képesség | replaces `megtakarítási keret` |
| emergency fund | vésztartalék | replaces `vészhelyzeti alap` |
| tier (missions) | szint | same word as XP level, by your decision |
| level (XP) | szint | |
| Deep Analysis | Mélyreható elemzés | one name everywhere; replaces `Mélyelemzés` / `Részletes kiadáselemzés` |
| email report | e-mailes jelentés | replaces `riport` |
| mission | küldetés | |
| badge | jelvény | |
| achievement | teljesítmény | replaces `kitüntetés` |
| deposit | betét | replaces `befizetés` |
| income source | jövedelemforrás | |
| expense | költség | replaces `kiadás`; Quick Add label stays one short noun (#175) |
| free trial | ingyenes próba | replaces `ingyenes próbaidőszak` |
| streak | sorozat | replaces `egymást követő napok` |
| Coach / AI Coach | Coach / AI Coach | replaces `Edző` / `AI edző`, including the tab label |
| PIN / Face ID | PIN-kód / Face ID | unchanged |

**Style rules (locked):** informal `te` form everywhere; no `… kerül` passives; no `a(z)`; no case suffix on placeholders; sentence case in titles (Hungarian doesn't use Title Case); Hungarian quotation marks `„…"` if quotes ever appear.

---

## Phase 0: Baseline and review sheet

**Files modified:** none (the working sheet lives in the session scratchpad, outside the repo)

- [x] Run `npm run typecheck && npm test` on the fresh branch and record the baseline: **typecheck 0 errors, 465/465 tests passing (22 files)** @ `5a6a2e9`
- [x] Generate a flattened EN↔HU side-by-side sheet for all 810 keys (namespace, key, EN, current HU, length ratio, flags) as `hu_review_sheet.tsv` in the session scratchpad
- [x] Auto-flag suspect strings in the sheet: suffix-after-placeholder (`}}-`), `a(z)`, `kerül`, `szüneteltetve`, `frissít`, `szint`, and strings more than 40% longer than English. Also flagged: glossary terms and placeholder mismatches against English. **Result: 233 of 810 keys flagged.** Counts: longer than 140% of English 143, `kerül` 23, `frissít` 21, streak terms 17, `a(z)` 14, coach 11, Deep Analysis 10, `szint` 8, `riport` 5, `vészhelyzeti` 4, `szüneteltetve` 3, suffix on placeholder 2, placeholder mismatch 1, `céljelentés` 1, `visszaminősít` 1
- [x] Confirm the DeepL MCP connection still responds (a single `translate-text` call): responds, Free plan

**Phase 0 finding:** `onboarding:account.subOtpSent` is missing its `{{email}}` placeholder (added to the findings table under Context and to Phase 2).

**Phase complete when:** the baseline passes, the review sheet exists with every flagged key marked, and DeepL responds.

---

## Phase 1: Glossary and style rules sign-off

**Files modified:** `implementations/I18N_HU_QUALITY.md` (this file: the glossary table is updated to the final decisions)

- [x] Present the glossary above with the two open questions (streak: `sorozat` vs `széria`; Coach: `Edző` vs `Coach`)
- [x] You decide both open questions and approve or adjust any other row: **streak = `sorozat`, Coach = `Coach`**; you replaced 13 rows (upgrade, downgrade, update, set aside, savings capacity, tier, Deep Analysis, achievement, savings plan, subscription plan, deposit, expense, free trial)
- [x] Lock the style rules: `te` form; no `… kerül` passives; no `a(z)`; no suffix on placeholders; sentence case in titles (Hungarian doesn't use Title Case); Hungarian quotation marks `„…"` if quotes ever appear
- [x] Update the glossary table in this file to the final version and mark it **final**

**Phase complete when:** the glossary is marked final in this file with both open questions answered, and you have approved it.

---

## Phase 2: Fix interpolation grammar bugs

The highest-severity phase: these strings render ungrammatical output today.

**Files modified:** `src/lib/i18n/locales/hu/goals.json`, `plans.json`, `dashboard.json`, `notifications.json`, `onboarding.json`, `content.json`, and `src/lib/i18n/locales.test.ts` (new `hu` guards)

- [x] `goals:detail.projectedFromCapacity`: restructure so `{{date}}` stands alone (e.g. `…ekkorra érnéd el: {{date}}`)
- [x] `plans:downgradeSelection.pickUpTo`: remove the `-t` suffix and restructure together with `keepBody_one`/`keepBody_other`/`keepIncomeBody`, which embed `{{pickText}}`. `pickOne`/`pickUpTo` must read correctly in the object slot of those three sentences
- [x] `onboarding:account.subOtpSent`: restore the missing `{{email}}` placeholder
- [x] Replace all 14 `a(z) {{…}}` occurrences: `a {{plan}}` where the value is a plan name (all consonant-initial); restructure where it's a user-typed `{{goalName}}`/`{{name}}` (e.g. `…a célodra: {{goalName}}`)
- [x] Check every remaining Hungarian string containing a placeholder for any suffix or article that depends on the value (full list from the Phase 0 sheet). Found 3 more: money amounts missing the accusative `összeget` in `onboarding:pushPermission.sub` and `content:missions.save-today.title` / `save-this-week.title`; fixed in this phase. `%-kal`/`%-nál`/`%-a` endings are safe because `%` is always read as `százalék`
- [x] Add a `hu`-only regression test to `locales.test.ts`: no Hungarian string may contain `}}-` or `a(z)`, so this bug class can't come back
- [x] Add a placeholder-parity test to `locales.test.ts`: every `hu` string must contain exactly the same `{{…}}`/`{…}`/`<bold>` tokens as its English original (this would have caught `subOtpSent`)
- [x] Present the before/after table and get approval, then apply: 21 strings, all approved 2026-10-07
- [x] `npm run typecheck && npm test`: typecheck clean, **489/489 passing** (465 baseline + 24 new `hu` checks). Both new tests failed on the old copy at exactly the target strings before the fix was applied

**Phase complete when:** no `hu` string attaches a suffix or `a(z)` to a placeholder, the new regression test passes, and the full suite is green.

---

## Phase 3: Terminology consistency pass

Applies the final glossary across all UI namespaces.

**Files modified:** `src/lib/i18n/locales/hu/plans.json`, `dashboard.json`, `coach.json`, `common.json`, `goals.json`, `missions.json`, `onboarding.json`, `profile.json`, `settings.json`, `notifications.json`

- [x] Upgrade/downgrade vs update: every English "upgrade"/"downgrade" uses `fejlesztési terv` / `visszaminősítési terv`; `frissít…` remains only where the English says update/refresh
- [x] Deep Analysis: one name (`Mélyreható elemzés`) across `dashboard`, `plans`, `common:aiConsent`
- [x] Apply the replaced terms: email report → `e-mailes jelentés`, savings capacity → `megtakarítási képesség`, achievement → `teljesítmény`, deposit → `betét`, expense → `költség`, free trial → `ingyenes próba`, subscription plan → `előfizetési csomag`, savings plan → `megtakarítási terv`
- [x] Streak and Coach: `sorozat` everywhere (no `egymást követő napok`); `Coach` / `AI Coach` everywhere, including the tab label (`common:tabs.coach`) and onboarding slides
- [x] Grep-verify that no replaced term survives (done: zero hits in UI namespaces; the only `visszaminősít` hit is the approved `visszaminősítési terv`) (`Edző`, `edző`, `riport`, `Mélyelemzés`, `kiadáselemzés`, `kitüntetés`, `befizetés`, `próbaidőszak`, `megtakarítási keret`, `visszaminősítés`, and `frissít` with an upgrade meaning)
- [x] Present the before/after table and get approval, then apply: 64 replacements across 9 files, approved 2026-10-07. Kept on purpose: "spending" stays `kiadás` (only "expense" → `költség`); `csomag` stays in short labels and on the Plans screen, `előfizetési csomag` in explanatory sentences; the `Önerő házra` chip (down payment, not `betét`); `frissít` for card/goals/currency updates
- [x] `npm run typecheck && npm test`: typecheck clean, 489/489 passing

**Phase complete when:** a grep for each replaced term finds no leftover occurrences with the old meaning, and the suite is green.

---

## Phase 4: DeepL-assisted style pass, namespace by namespace

Every UI string is re-checked against English: meaning first, then naturalness. Work goes in batches, ordered by how early and how often users see them. Each batch is DeepL-translated from English, compared against the current HU, and presented as a proposal table (key | EN | current HU | DeepL | proposed). Keys where the current HU is already best are listed as "keep". Each batch is approved before it's applied.

**Files modified:** `src/lib/i18n/locales/hu/onboarding.json`, `auth.json`, `dashboard.json`, `goals.json`, `missions.json`, `plans.json`, `settings.json`, `profile.json`, `notifications.json`, `coach.json`, `common.json`

- [x] Batch A, first run: `onboarding` (119 keys), `auth` (68). Fixes include `noBank.headline`, `pushPermission.headline`/`keepMeOnTrack`, `milestoneBody` (`céljelentése`), `income.skip`. **Done 2026-10-10:** 38 strings changed (auth 8, onboarding 30), 144 kept; DeepL defaulted to formal `Ön` and mangled placeholders, so it was used as a reference only. Phase 7 length watch: `auth:pinCreation.securing`, `onboarding:pushPermission.headline`, buttons `blueprint.createAccount` and `pushPermission.keepMeOnTrack`
- [x] Batch B, daily use: `dashboard` (53), `goals` (23), `missions` (17). Fixes include `highProgress`, `analysisStartedTitle`, `saverLevel`, `welcomeBanner.body`. **Done 2026-10-10:** 21 strings changed (dashboard 15, goals 4, missions 2), 72 kept. Also fixed: `Minden forint számít` assumed HUF (now `Minden fillér számít`), and `detail.settingAside` used past tense for a future date. Phase 7 length watch: `dashboard:deepAnalysis.remainingOfLimit`
- [x] Batch C, money and trust: `plans` (111). Fixes include `trialIntro.title`, `pendingBanner`, the `szüneteltetve vannak` passives, `terms.*`. **Done 2026-10-10:** 30 strings changed (plans 24, plus 6 matching strings in `dashboard`, `settings`, `onboarding`), 87 plans strings kept. Found and fixed a bug: `{{date}}` in `pendingBanner` can be the `endOfBillingPeriod` fragment (`app/plans.tsx` `formatPeriodEnd`), which rendered `…időszak vége napon`. Cross-file decisions: `Hiba történt`, `Írj az ügyfélszolgálatnak`, `Adatvédelmi tájékoztató`. No `szüneteltetve` left anywhere
- [x] Batch D, settings: `settings` (58), `profile` (40). Fixes include `eltávolításra kerül`, the reset/delete flows. **Done 2026-10-10:** 24 strings changed (settings 10, profile 14), 74 kept. Reset flow now uses `nullázás` (`visszaállítás` alone reads as "restore"); `currencyConvertModal.unavailableNote` no longer claims amounts keep their *value* across currencies
- [x] Batch E, the rest: `notifications` (18), `coach` (17), `common` (48). Fixes include `firstGoal.body`, `aiConsent.dataShared` (`Mi kerül megosztásra`), and the accessibility hints moved to `te` form. **Done 2026-10-10:** 16 strings changed (notifications 7, coach 2, common 7), 67 kept. Also fixed: "check-in" was translated as `bejelentkezés` (log-in) in 3 notification strings; `Face ID-vel` → `Face ID-val` to match auth
- [x] For every batch: placeholders, `<bold>`, `\n`, emoji and `_one`/`_other` pairs are preserved (Hungarian keeps the noun singular after a numeral, so the two plural forms may stay identical)
- [x] For every batch: no string gets longer than its current HU where the element is a tab, chip or button
- [x] After each applied batch: `npm run typecheck && npm test`, then one commit per batch

**Result:** 129 strings rewritten across 11 UI namespaces in 5 approved batches (A 38, B 21, C 30, D 24, E 16); grep confirms no `… kerül` passive or `szüneteltetve` left in UI namespaces; typecheck clean, 489/489 tests passing after every batch.

**Phase complete when:** all 11 UI namespaces have been reviewed key by key, every approved change is applied, no `… kerül` or `szüneteltetve` passive remains (checked by grep), and the suite is green.

---

## Phase 5: `content.json` catalogs

**Files modified:** `src/lib/i18n/locales/hu/content.json`

- [x] `missions` (30): titles are short imperatives; single-brace `{amount}` stays intact and is never suffixed. Check `save-today`'s `Tegyél félre {amount} ma` word order
- [x] `lessons` (15): check financial accuracy of question, options and explanation against English. Each `options.a/b/c` must stay aligned with the English `correctKey` (guarded by `contentParity.test.ts`)
- [x] `achievements` (12), `goalTemplates` (10), `expenseCategories` (8): glossary terms (`vésztartalék`, `sorozat`, `teljesítmény`, `költség`)
- [x] `countries` (26), `currencies` (20): confirm the standard Hungarian names (e.g. `India` stays India, `Magyar forint`)
- [x] DeepL comparison, proposal table, approval, apply: 37 strings changed, 201 kept, approved 2026-10-10. Fixed a reversed meaning in `missions.beat-last-week.title` (`Múld felül…` = "exceed"; DeepL got it wrong too); daily "target" now `célösszeg` instead of `cél`; currency-neutral `opportunity-cost.explanation`; credit-score options corrected
- [x] `npm run typecheck && npm test` (including `contentParity.test.ts`): typecheck clean, 489/489 passing

**Phase complete when:** all 238 content keys have been reviewed, lesson answer keys still pass the parity test, and the suite is green.

---

## Phase 6: Native strings and length check

**Files modified:** `languages/hu.json`

- [ ] `ios.NSFaceIDUsageDescription`: re-check against English (current: `Engedélyezd a Piggy számára, hogy Face ID-val oldja fel az alkalmazást.`)
- [ ] Length audit: list every changed string that got longer than its previous HU version and is used in a constrained UI element (tabs, chips, buttons, headlines with `\n`), and shorten any that exceed their old length
- [ ] `npm run typecheck && npm test && npm run check:bundle-size`

**Phase complete when:** the native string has been reviewed, no constrained-UI string got longer, and all three commands pass.

---

## Phase 7: Layout check in the running app

Tests catch wrong keys and placeholders, but not text that's cut off or overlapping. Hungarian runs long: compound words like `jövedelemforrás` and `próbaidőszak` are long, and React Native doesn't hyphenate Hungarian, so one long word can overflow a narrow container. This phase checks every screen visually with the app set to Hungarian.

**Files modified:** `src/lib/i18n/locales/hu/*.json` (only if a string has to be shortened to fit)

**Known risk areas from the code:**
- `src/components/ui/button.tsx` renders labels with `numberOfLines={1}`, so a button label that's too long gets cut off with `…` instead of wrapping. Every button is a risk.
- Other files that cap line count: `app/(tabs)/index.tsx`, `goals.tsx`, `missions.tsx`, `profile.tsx`, `app/settings.tsx`, `app/downgrade-selection.tsx`, `src/components/AddExpenseModal.tsx`, `AddSavingsModal.tsx`, `CapacityApplyModal.tsx`.
- Fixed-width elements: the tab bar labels, onboarding chips (`goal.chips.*`, `suggestionChip`), Quick Add labels (constrained since [#175](https://github.com/Koin-App-Official/pignify/issues/175)), plan cards and the `currentPlanChip`, and headlines with a manual `\n` break.

**Setup:**
- [ ] Run the dev build in the iOS Simulator with the app language set to Hungarian, on a **small screen** (iPhone SE, 375 pt wide, the worst case) and a standard one (e.g. iPhone 17)
- [ ] Repeat on an Android emulator if one is available, since Android font metrics differ and have caused layout bugs before ([#193](https://github.com/Koin-App-Official/pignify/issues/193))
- [ ] One pass with the largest standard system text size (iOS Dynamic Type / Android font scale), on the screens with the most text

**What counts as a defect:**
- Text cut off with `…` or clipped at a container edge
- Text overlapping other text, icons or buttons
- Text overflowing its card, chip, modal or the screen edge
- A word broken mid-word or split awkwardly across lines
- A headline wrapping onto more lines than intended, pushing content off-screen
- Push-notification titles cut off on the lock screen (checked with a test notification)
- Watch item from Phase 3: `dashboard:deepAnalysis.upgradeToUnlock` grew from `Frissíts a feloldáshoz` to `Feloldás fejlesztési tervvel` and buttons cut off at one line

**Screens to check (every state a user can reach):**
- [ ] Onboarding: the 3 welcome slides, name, date of birth plus its confirm modal, country/currency/language, goal plus chips, target amount, income, contribution (monthly and deadline modes, including warnings), blueprint, notification permission, account/code entry, legal footer
- [ ] Auth: PIN creation and confirmation, lock screen including the lockout message, forgot-PIN alert, login with email/code/password, biometric enrolment
- [ ] Home tab: greeting, welcome banner, past-due warning, income tip, motivation banners, Deep Analysis card and confirm modal, spending/savings stats, Quick Add buttons and both Add modals, goal cards
- [ ] Goals tab and goal detail: empty state, the set-aside/projection lines, shortfall warning, milestones, deposit history, review screen warnings, capacity-apply modal
- [ ] Missions tab: tier headers, daily/weekly lists, progress text, the badges tab, quiz claim/try-again buttons
- [ ] Coach tab: greeting, online status, usage/limit line, input placeholder, upgrade gate
- [ ] Profile tab: level, stats, income list plus add/remove, notification toggles, the reset confirmation
- [ ] Plans and paywall: plan cards and quota lists, trial banners, pending-change banner, upgrade modal, every feature gate, downgrade selection, plan-gate lock screen, trial intro, billing terms
- [ ] Settings: all sections, plan status lines, currency convert modal, biometric/auto-lock options, delete-account flow

**Process:**
- [ ] I drive the Simulator and capture a screenshot of each screen and state above, and flag every defect I find. You make the final call on each screen (per your preference to judge visual changes yourself). A known blocker from [#124](https://github.com/Koin-App-Official/pignify/issues/124): automated taps stopped working on the date-of-birth confirm alert, so you may need to tap past it by hand
- [ ] For each defect, shorten the Hungarian copy first (proposal table, your approval). Must keep the meaning and the glossary terms
- [ ] If a string can't be shortened without losing meaning, don't change code in this branch: open a separate issue for the layout fix and link it from #197
- [ ] Re-check every screen touched by a fix
- [ ] `npm run typecheck && npm test` after any copy change

**Phase complete when:** every screen and state in the list has been checked on the small and standard screen sizes, no truncation or overlap remains (or each remaining case has its own linked issue), and you have signed off.

---

## Phase 8: Verification and close-out

**Files modified:** `implementations/I18N_HU_QUALITY.md` (tick boxes), `implementations/I18N_HU.md` (mark the native-review item as handed over to [#197](https://github.com/Koin-App-Official/pignify/issues/197))

- [ ] Final `npm run typecheck && npm test && npm run check:bundle-size`
- [ ] Native-speaker read-through (if available) of the proposal tables or the running app
- [ ] Fix anything the review surfaces, then re-run the verification
- [ ] Tick every checkbox in [#197](https://github.com/Koin-App-Official/pignify/issues/197), close it with a completion comment, open the PR (`fix(#197): Improve Hungarian translation quality`, body `Closes #197`)

**Phase complete when:** all checks pass, the on-device review is done with its findings fixed, and the PR is open and linked to #197.

---

## Commit plan

One commit per phase, and one per batch in Phase 4, all in the format `[#197] <imperative description>`, for example:

- `[#197] Fix Hungarian grammar around interpolated values`
- `[#197] Apply Hungarian glossary terms across UI namespaces`
- `[#197] Rewrite Hungarian onboarding and auth copy`
- `[#197] Shorten Hungarian labels that truncate on small screens`

## Out of scope

- **`en`, `pl`, `de` locale files.** English is read-only here, and other languages are untouched.
- **AI-generated Hungarian from the n8n backend** (`CLAUDE_coach_reply`, Deep Analysis emails). That copy is produced by prompts in n8n, not by this repo. Tracked separately if Hungarian coach output is also poor.
- **Code changes.** The only non-JSON file changed is `locales.test.ts` (Phase 2 regression guard). No component, layout or i18n-infrastructure changes.
- **DeepL Pro features** (glossary, formality, context). The plan works within the Free plan. If you upgrade, Phase 4 could pass the glossary to DeepL directly, but that isn't required.
