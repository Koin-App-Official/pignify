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
| 9× `a(z) {{…}}` (`dashboard`, `plans`, `notifications`, `onboarding`) | `a(z) {{goalName}} célra` | `a(z)` reads like a form letter. Plan names (`Beginner`/`Medium`/`Family`, `src/lib/entitlements.ts`) all start with a consonant, so those can simply use `a`. For user-typed goal names the sentence has to be restructured |

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

## Glossary (proposal, finalised in Phase 1)

| English | Proposed Hungarian | Replaces | Notes |
|---|---|---|---|
| goal | cél | — | keep |
| savings plan / Piggy Plan | terv / Piggy terv | — | keep; distinct from subscription plan |
| subscription plan | csomag | — | keep |
| upgrade (verb / noun) | válts nagyobb csomagra / csomagváltás | `frissíts`, `csomagfrissítés` | frees `frissít` for "update" only |
| downgrade | kisebb csomagra váltás | `visszaminősítés` | |
| update (card, goals) | frissítsd a kártyaadataidat / célok módosítása | — | |
| set aside / monthly set-aside | félretesz / havi félretétel | mixed `megtakarítás` | "savings" stays `megtakarítás` |
| savings capacity | félretehető összeg | `megtakarítási keret` | |
| deposit | befizetés | — | keep |
| income source | jövedelemforrás | — | keep |
| expense / log an expense | kiadás / rögzíts egy kiadást | — | keep |
| emergency fund | vésztartalék | `vészhelyzeti alap` | standard Hungarian finance term |
| streak | sorozat **or** széria | `sorozat`, `egymást követő napok` | **open question**, you pick |
| Coach / AI Coach | Edző / AI-edző **or** Coach | `Edző` | **open question**, you pick |
| mission / badge / achievement | küldetés / jelvény / kitüntetés | — | keep |
| tier (missions) | fokozat | `szint` | resolves the tier/level collision |
| level (XP) | szint | — | keep |
| Deep Analysis | Mélyelemzés | `Részletes kiadáselemzés` | one product name everywhere |
| email report | e-mailes jelentés | `riport` | |
| free trial | ingyenes próbaidőszak | — | keep |
| PIN / Face ID | PIN-kód / Face ID | — | keep |

---

## Phase 0: Baseline and review sheet

**Files modified:** none (the working sheet lives in the session scratchpad, outside the repo)

- [ ] Run `npm run typecheck && npm test` on the fresh branch and record the baseline (expect 0 errors, full suite green)
- [ ] Generate a flattened EN↔HU side-by-side sheet for all 810 keys (namespace, key, EN, current HU) as a working file in the scratchpad
- [ ] Auto-flag suspect strings in the sheet: suffix-after-placeholder (`}}-`), `a(z)`, `kerül`, `szüneteltetve`, `frissít`, `szint`, and strings more than 40% longer than English
- [ ] Confirm the DeepL MCP connection still responds (a single `translate-text` call)

**Phase complete when:** the baseline passes, the review sheet exists with every flagged key marked, and DeepL responds.

---

## Phase 1: Glossary and style rules sign-off

**Files modified:** `implementations/I18N_HU_QUALITY.md` (this file: the glossary table is updated to the final decisions)

- [ ] Present the glossary above with the two open questions (streak: `sorozat` vs `széria`; Coach: `Edző` vs `Coach`)
- [ ] You decide both open questions and approve or adjust any other row
- [ ] Lock the style rules: `te` form; no `… kerül` passives; no `a(z)`; no suffix on placeholders; sentence case in titles (Hungarian doesn't use Title Case); straight Hungarian quotation marks `„…"` if quotes ever appear
- [ ] Update the glossary table in this file to the final version and mark it **final**

**Phase complete when:** the glossary is marked final in this file with both open questions answered, and you have approved it.

---

## Phase 2: Fix interpolation grammar bugs

The highest-severity phase: these strings render ungrammatical output today.

**Files modified:** `src/lib/i18n/locales/hu/goals.json`, `plans.json`, `dashboard.json`, `notifications.json`, `onboarding.json`, and `src/lib/i18n/locales.test.ts` (new `hu` guard)

- [ ] `goals:detail.projectedFromCapacity`: restructure so `{{date}}` stands alone (e.g. `…ekkorra érnéd el: {{date}}`)
- [ ] `plans:downgradeSelection.pickUpTo`: remove the `-t` suffix and restructure together with `keepBody_one`/`keepBody_other`/`keepIncomeBody`, which embed `{{pickText}}`. `pickOne`/`pickUpTo` must read correctly in the object slot of those three sentences
- [ ] Replace all 9 `a(z) {{…}}` occurrences: `a {{plan}}` where the value is a plan name (all consonant-initial); restructure where it's a user-typed `{{goalName}}`/`{{name}}` (e.g. `…a célodra: {{goalName}}`)
- [ ] Check every remaining Hungarian string containing a placeholder for any suffix or article that depends on the value (full list from the Phase 0 sheet)
- [ ] Add a `hu`-only regression test to `locales.test.ts`: no Hungarian string may contain `}}-` or `a(z)`, so this bug class can't come back
- [ ] Present the before/after table and get approval, then apply
- [ ] `npm run typecheck && npm test`

**Phase complete when:** no `hu` string attaches a suffix or `a(z)` to a placeholder, the new regression test passes, and the full suite is green.

---

## Phase 3: Terminology consistency pass

Applies the final glossary across all UI namespaces.

**Files modified:** `src/lib/i18n/locales/hu/plans.json`, `dashboard.json`, `coach.json`, `common.json`, `goals.json`, `missions.json`, `onboarding.json`, `profile.json`, `settings.json`, `notifications.json`

- [ ] Upgrade vs update: every English "upgrade" uses the glossary term; `frissít…` remains only where the English says update/refresh
- [ ] Tier vs level: `missions:tier1–3` use `fokozat`; XP levels keep `szint`
- [ ] Deep Analysis: one name (`Mélyelemzés`) across `dashboard`, `plans`, `common:aiConsent`
- [ ] Email report, downgrade, savings capacity, set-aside: apply the glossary
- [ ] Streak and Coach: apply your decision from Phase 1 everywhere, including the tab label (`common:tabs.coach`) and onboarding slides
- [ ] Grep-verify that no replaced term survives (e.g. `grep -c 'frissíts' hu/plans.json` matches only update-meaning keys)
- [ ] Present the before/after table and get approval, then apply
- [ ] `npm run typecheck && npm test`

**Phase complete when:** a grep for each replaced term finds no leftover occurrences with the old meaning, and the suite is green.

---

## Phase 4: DeepL-assisted style pass, namespace by namespace

Every UI string is re-checked against English: meaning first, then naturalness. Work goes in batches, ordered by how early and how often users see them. Each batch is DeepL-translated from English, compared against the current HU, and presented as a proposal table (key | EN | current HU | DeepL | proposed). Keys where the current HU is already best are listed as "keep". Each batch is approved before it's applied.

**Files modified:** `src/lib/i18n/locales/hu/onboarding.json`, `auth.json`, `dashboard.json`, `goals.json`, `missions.json`, `plans.json`, `settings.json`, `profile.json`, `notifications.json`, `coach.json`, `common.json`

- [ ] Batch A, first run: `onboarding` (119 keys), `auth` (68). Fixes include `noBank.headline`, `pushPermission.headline`/`keepMeOnTrack`, `milestoneBody` (`céljelentése`), `income.skip`
- [ ] Batch B, daily use: `dashboard` (53), `goals` (23), `missions` (17). Fixes include `highProgress`, `analysisStartedTitle`, `saverLevel`, `welcomeBanner.body`
- [ ] Batch C, money and trust: `plans` (111). Fixes include `trialIntro.title`, `pendingBanner`, the `szüneteltetve vannak` passives, `terms.*`
- [ ] Batch D, settings: `settings` (58), `profile` (40). Fixes include `eltávolításra kerül`, the reset/delete flows
- [ ] Batch E, the rest: `notifications` (18), `coach` (17), `common` (48). Fixes include `firstGoal.body`, `aiConsent.dataShared` (`Mi kerül megosztásra`), and the accessibility hints moved to `te` form
- [ ] For every batch: placeholders, `<bold>`, `\n`, emoji and `_one`/`_other` pairs are preserved (Hungarian keeps the noun singular after a numeral, so the two plural forms may stay identical)
- [ ] For every batch: no string gets longer than its current HU where the element is a tab, chip or button
- [ ] After each applied batch: `npm run typecheck && npm test`, then one commit per batch

**Phase complete when:** all 11 UI namespaces have been reviewed key by key, every approved change is applied, no `… kerül` or `szüneteltetve` passive remains (checked by grep), and the suite is green.

---

## Phase 5: `content.json` catalogs

**Files modified:** `src/lib/i18n/locales/hu/content.json`

- [ ] `missions` (30): titles are short imperatives; single-brace `{amount}` stays intact and is never suffixed. Check `save-today`'s `Tegyél félre {amount} ma` word order
- [ ] `lessons` (15): check financial accuracy of question, options and explanation against English. Each `options.a/b/c` must stay aligned with the English `correctKey` (guarded by `contentParity.test.ts`)
- [ ] `achievements` (12), `goalTemplates` (10), `expenseCategories` (8): glossary terms (`vésztartalék`, `sorozat`/`széria`)
- [ ] `countries` (26), `currencies` (20): confirm the standard Hungarian names (e.g. `India` stays India, `Magyar forint`)
- [ ] DeepL comparison, proposal table, approval, apply
- [ ] `npm run typecheck && npm test` (including `contentParity.test.ts`)

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
