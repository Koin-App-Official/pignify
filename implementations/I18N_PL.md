# Internationalization — Polish (`pl-PL`)

Implementation plan for adding Polish as the app's second language, detected from the device
during onboarding and overridable in Settings.

- **Tracking issue:** [#120](https://github.com/Koin-App-Official/pignify/issues/120)
- **Branch:** `feat/issue-120-i18n-polish`
- **Baseline:** `main` @ `2fab6e6` (2026-08-16)
- **Scope:** English (source) + Polish (`pl`). Architecture must accept a third locale without rework.

---

## Findings from the audit

What the codebase looks like today, and what each fact implies for the work.

| Finding | Implication |
|---|---|
| No i18n library, no `expo-localization`, no `Intl` polyfills installed | Greenfield — we pick the stack |
| ~346 `<Text>` sites, 25 `Alert.alert`, 16 `placeholder=`, 5 tab titles, all hardcoded English | ~600–700 translation keys total |
| `app/onboarding.tsx` is 1436 lines with 73 `<Text>` — the single biggest surface | Extract it on its own, not batched with other screens |
| `OnboardingStep.Localization` (step 2) already exists and asks country + currency | Language row slots into an existing screen; no new step needed |
| `detectLocaleCountry()` at [onboarding.tsx:182](app/onboarding.tsx:182) already reads `Intl.DateTimeFormat().resolvedOptions().locale` | Detection pattern exists, but reads region only — not language |
| `welcome.tsx` (carousel) renders **before** onboarding on a cold install | Detection must run at app start, or the first screen a Polish user sees is English |
| Returning users on a new device hit `LoginGate`, never onboarding | Onboarding-only detection would leave them stranded in English |
| `PL` / `PLN` already in `COUNTRIES` and `CURRENCIES`, `symbolAfter: true` | Currency plumbing for Poland is already correct |
| `formatCurrency` uses bare `amount.toLocaleString()` ([store.ts:907](src/lib/store.ts:907)) | **Pre-existing bug:** number format follows the *device*, not the app. An English user on a Polish phone already sees `1 000` |
| 4 call sites use `toLocaleDateString(undefined, …)` | Same bug class — dates silently follow the device |
| `remainingLabel` / `savedThisWeekLabel` are formatted **into store state** ([store.ts:531](src/lib/store.ts:531)) | Pre-rendered strings go stale on language switch — must move to render time |
| 32 mission defs with `title` + `description` and `{amount}` interpolation | Catalog content, not UI chrome — needs its own key namespace |
| 15 financial-literacy lessons (question + 3 options + explanation) | ~75 strings of *factual* content — mistranslation teaches a wrong fact |
| Notification copy is composed in `src/lib/notifications.ts` and **scheduled ahead of time** | Language switch must reschedule, or pending notifications stay in the old language |
| AI Coach (`/webhook/claude-coach`) sends `{ userID, messages, context }` | No language field — the AI will answer in English regardless |
| `app.json` has an English `faceIDPermission` string | Native permission dialogs need `InfoPlist.strings`, not JS i18n |
| CI runs `typecheck` + `vitest` + a 8.0 MB iOS bundle guardrail (baseline 6.06 MB) | ~1.9 MB headroom — i18next (~60 KB) is comfortably affordable |
| **[Verified Phase 0]** This app's Hermes build has no `Intl.PluralRules`/`Intl.ListFormat` at all | Confirmed on the real bundled Hermes engine, not assumed |
| **[Verified Phase 0]** i18next's `PluralResolver` silently falls back to English-style `one`/`other` when `Intl.PluralRules` throws — it does not crash | Without a polyfill, Polish `_few`/`_many` keys would never fire, invisibly, forever |
| **[Verified Phase 0]** Hermes' `Intl.NumberFormat('pl-PL')` doesn't group thousands below 10,000 (`9999→"9999"`, `10000→"10 000"`); `en-US` groups correctly at every magnitude | A second, independent, locale-specific bug — most goal/contribution amounts are under 10,000, so this isn't an edge case |
| **[Verified Phase 0]** The pl-PL grouping separator, where present, is U+00A0 (NBSP) | Confirmed by codepoint dump, not eyeballing — matches the concern already in Phase 2 |

### Decisions taken

**Library: `i18next` + `react-i18next` + `expo-localization`, plus `@formatjs/intl-pluralrules`.**
The deciding factor is Polish plurals. Polish has four plural categories (`one` / `few` / `many` /
`other`) — `1 dzień`, `2 dni`, `5 dni`, `22 dni` — driven by a rule on the last two digits.
i18next resolves these via `Intl.PluralRules` and key suffixes (`key_one`, `key_few`, `key_many`,
`key_other`) — but **Phase 0 confirmed this app's Hermes build has no `Intl.PluralRules` at all**,
and that i18next's fallback for that case is a silent, non-crashing downgrade to English-style
`one`/`other` (see Phase 0 for the traced source behavior). `@formatjs/intl-pluralrules` +
Polish CLDR locale data closes that gap; verified correct against the real bundled Hermes engine,
not assumed. We have plural-bearing copy already
(`expense${n === 1 ? '' : 's'}` at [notifications.ts:166](src/lib/notifications.ts:166)).

**Currency/number formatting: hand-rolled, never `Intl.NumberFormat`.**
Phase 0 found Hermes' `Intl.NumberFormat('pl-PL')` doesn't group thousands below 10,000 — a second,
independent bug on top of the missing `Intl.PluralRules`, and one that would silently misformat the
majority of in-app amounts. Phase 2's `formatCurrency`/`formatNumber` helpers were already planned
as hand-rolled; this confirms that was the right call rather than a stylistic preference, and rules
out reaching for a `Intl.NumberFormat` polyfill (which would add real bundle weight for CLDR
numbering data) as an alternative fix.

**Detection at app start, confirmation in onboarding.**
`expo-localization.getLocales()[0].languageCode` is read at root layout before first paint and seeds
`profile.language`. The onboarding `Localization` step then *shows* the detected language as an
editable row next to country and currency. This satisfies "detected in the onboarding flow" while
keeping the welcome carousel — which renders first — in the right language, and it covers returning
users who never see onboarding.

**Existing users are backfilled to `en`, not device-detected.**
A Polish-phone user who has been happily using the English app should not have the entire app flip
language because they installed an update. They get a Settings toggle instead. *(Reversible — flag
for review at Phase 1.)*

**Plan names (`Beginner` / `Medium` / `Family`) stay untranslated.**
They are product identifiers that map to Stripe and the entitlements backend. Their *descriptions*
are translated.

**Translation authorship: Claude drafts, user reviews before merge.**
Every `pl` string in Phases 3–6 is translated as part of the implementation, not left as a TODO.
Nothing ships without the user's own review pass — call this out explicitly at the end of each
phase that adds Polish copy, and again in Phase 8 as a final full-set review gate.

**Legal links need no per-language URL.** [Resolved]
`piggnify.com`'s privacy policy / terms / AI transparency pages already exist in Polish at the
*same* URLs — the site auto-detects language itself. `LEGAL_LINKS` in
[onboarding.tsx:46](app/onboarding.tsx:46) needs no language-conditional URLs; the existing 5 links
work unchanged for `pl` users. Removed from Phase 3 as a task.

**Coach persona: resolved as a backend-only concern, not a client scope question.**
Piggy's voice stays informal (matches the existing English tone); this is entirely a prompt-text
change in the `CLAUDE_coach_reply` n8n workflow (Phase 6) and has no bearing on client-side scope,
timeline, or the key-extraction phases.

---

## Resolved questions

- **Legal pages** — same URL for `en` and `pl`, site auto-detects. No in-app change needed.
- **Translation authorship** — Claude translates during implementation; user reviews before each
  merge and again at the Phase 8 ship gate.
- **Coach persona** — informal *ty*, handled entirely in the n8n prompt (Phase 6). Not a blocker.
- **App Store listing** — confirmed separate deliverable, out of scope for this plan.

---

## Phase 0 — De-risking (blocking)

The one phase that can invalidate the plan.

- [x] Create branch `feat/issue-120-i18n-polish` off `main`
- [x] Probe `Intl` support on the actual Hermes engine this app ships (not Node, not a browser) —
      built and ran a real Metro/Hermes bundle through `node_modules/react-native/sdks/hermesc/osx-bin/hermes`,
      the same Hermes build pulled by this app's `react-native` version, with no custom
      `ENABLE_INTL`/ICU flags in `ios/Podfile` or `android/app/build.gradle` to diverge from it
- [x] Confirmed the risk is real: **`Intl.PluralRules` and `Intl.ListFormat` are entirely absent**
      (`typeof Intl.PluralRules === 'undefined'`) on this Hermes build — expected, this is Hermes'
      documented "without full ICU" default, which most RN apps ship with unless they explicitly
      opt into the heavier full-ICU build
- [x] Traced the failure mode through i18next's own `PluralResolver` source
      (`node_modules/i18next/dist/cjs/i18next.js`): a missing `Intl.PluralRules` does **not** throw or
      crash — `getRule()` catches the `TypeError` and silently returns a hardcoded `dummyRule` (
      `count === 1 ? 'one' : 'other'`) for any locale code without a `-`/`_`. Polish (`pl`) hits this
      exactly. **Without a polyfill, `_few`/`_many` suffixed keys would simply never be selected —
      not a crash, a silent permanent wrong-grammar bug that no English-speaking reviewer would catch.**
- [x] Installed `@formatjs/intl-pluralrules` (+ `@formatjs/intl-getcanonicallocales`,
      `@formatjs/intl-locale` prerequisites), bundled a probe entry through the real `expo export:embed`
      pipeline, ran the output on the same Hermes binary. Confirmed fixed and CLDR-correct:
      `1→one, 2→few, 5→many, 22→few, 25→many, 101→many, 112→many, 0→many`. English unaffected
      (`1→one, 2→other, 5→other`)
- [x] Verified `pl-PL` number grouping — **and found a second, independent Hermes bug**: its built-in
      `Intl.NumberFormat('pl-PL')` only applies thousands grouping *above 9999*.
      `1000 → "1000"`, `9999 → "9999"` (no separator at all), but `10000 → "10 000"` (correct). The
      `en-US` locale does not have this bug (`1000 → "1,000"` groups correctly at every magnitude) —
      this is a `pl-PL`-specific locale-data gap in Hermes' lean Intl, not a general grouping failure.
      For a savings app, most amounts are under 10,000 — this would have shipped as "1000 zł" for the
      overwhelming majority of goals and contributions
- [x] Confirmed the thousands separator, where it *does* appear, is **U+00A0 (NBSP)**, not a plain
      space (U+0020) — verified via codepoint dump, not visual inspection. Any string-equality test
      or manual copy-paste of "1 234" into a test file would silently use the wrong character
- [x] Verified `Intl.DateTimeFormat('pl-PL')` month names are correct and need no polyfill:
      `styczeń, luty, marzec, kwiecień, maj, czerwiec, lipiec, sierpień, wrzesień, październik,
      listopad, grudzień` — all standalone nominative, matching the Phase 2 phrasing guidance
- [x] **Decision: do not use `Intl.NumberFormat` for currency/number formatting at all**, for any
      locale. Given it's independently unreliable for `pl-PL` and Phase 2 already planned hand-rolled
      `formatCurrency`/`formatNumber` helpers, this removes a dependency on the buggy API entirely
      rather than working around it. No `@formatjs/intl-numberformat` polyfill needed (that package
      pulls in full CLDR numbering data and would meaningfully affect bundle size) — a manual
      groupBy-3-with-NBSP implementation is both smaller and correct
- [x] `@formatjs/intl-pluralrules` chosen over a hand-rolled plural resolver — Polish's rule
      (`few`: n%10 in 2–4 and n%100 not in 12–14; `many`: everything else non-1) is exactly the kind
      of subtle logic worth getting from CLDR data rather than reimplementing
- [x] Installed `i18next`, `react-i18next`, `expo-localization`; ran `npm run check:bundle-size`:
      `5.91 MB / 7.63 MB budget — within budget (+0.13 MB vs baseline)`. Packages are installed but
      not yet imported anywhere in app source, so this is a lower bound — re-measure at the end of
      Phase 1 once `src/lib/i18n/index.ts` actually wires them into the root layout
- [ ] Register the polyfill defensively, not unconditionally: use `@formatjs/intl-pluralrules/should-polyfill`
      + a conditional dynamic import of `polyfill` (not `polyfill-force`), so this becomes a no-op if a
      future RN/Hermes ships full ICU rather than silently shadowing a correct native implementation
- [ ] **Android not verified — no Android emulator/device tooling available in this environment.**
      Android's Hermes distribution comes from the same upstream `react-native` release and the same
      default (non-ICU) build, and `android/app/build.gradle` has no `ENABLE_INTL`/ICU override either,
      so the iOS findings above are expected to hold — but this is inference, not a device probe. Flag
      for the user to spot-check `Intl.PluralRules` and the pl-PL grouping bug on a real Android
      device or emulator before Phase 8 ship gate
- [x] Decide and document the fallback chain: `pl-PL` → `pl` → `en`

---

## Phase 1 — Infrastructure

No user-visible strings change yet. The runtime exists and the language is persisted, switchable,
and observable.

- [x] Create `src/lib/i18n/index.ts` — i18next init, resource loading, fallback chain. No
      `compatibilityJSON` config: that option doesn't exist in i18next 26 (v4 JSON is the only
      format now) — dropping it is a no-op, not a scope cut
- [x] Create `src/lib/i18n/locales/en/` and `src/lib/i18n/locales/pl/` with the namespace files:
      `common`, `onboarding`, `dashboard`, `goals`, `missions`, `coach`, `profile`, `settings`,
      `auth`, `plans`, `notifications`, `content`. All are `{}` stubs for now except `settings`
      (real content backing this phase's language row) — Phases 3-6 fill the rest in
- [x] Add `language: SupportedLanguage` to `UserProfile` in [store.ts](src/lib/store.ts), with
      `SupportedLanguage = 'en' | 'pl'` (lives in `i18n/detect.ts`, not store.ts itself)
- [x] Add store migration v4 → v5 in [storeMigrations.ts](src/lib/storeMigrations.ts), backfilling
      existing profiles to `'en'`; bump `PIGGY_STORE_VERSION` to 5
- [x] Update the version assertion in [storeMigrations.test.ts](src/lib/storeMigrations.test.ts)
      and add a migration test covering the backfill (3 new tests)
- [x] Create `src/lib/i18n/detect.ts` — device language detection via `expo-localization` (lazily
      `require`d so the module stays vitest-safe), mapping `pl` to `pl` and everything else to `en`
- [x] Wire i18n init into [app/_layout.tsx](app/_layout.tsx) — a new `i18nReady` gate joins the
      existing `fontsLoaded` gate before first paint and before `SplashScreen.hideAsync()`; tree
      wrapped in `I18nextProvider`
- [x] **Deviation from plan: no dedicated `setLanguage` store action.** `i18n/index.ts` subscribes
      to the store and calls `i18n.changeLanguage()` whenever `profile.language` changes, so
      Settings only ever needs a plain `updateProfile({ language })` — same pattern the existing
      `autoLockMinutes` row already uses. This also covers zustand's persist rehydration finishing
      *after* `initI18n()` ran, which a one-shot action alone would have missed. Notification
      rescheduling (Phase 6) will likely hang off this same subscription when it lands
- [x] **Deviation from plan: no `PickerModal`.** Added an inline two-button toggle to
      [app/settings.tsx](app/settings.tsx), matching the existing `AUTO_LOCK_OPTIONS` row in the
      same file exactly, rather than pulling in the modal picker built for long lists (country/
      currency). Only 2 languages exist; revisit if a 3rd language makes the row too cramped
- [x] Verified via `npm run typecheck` (clean), the full vitest suite (219 passing, incl. 3 new
      migration tests + 1 for `detect.ts`), and a real `expo export:embed` of the production entry
      (6.07 MB / 7.63 MB budget — proves `_layout.tsx`/`settings.tsx`/`store.ts` all resolve and
      minify cleanly through Metro). **Not verified in the simulator** — the only built simulator
      app is a stale, unrelated pre-existing broken build (`Cannot find native module
      'ExpoPushTokenManager'`, dated May 29, months before this work), and the user prefers to
      self-verify UI/visual changes rather than have simulator checks pushed on them. The user
      should confirm the language switch re-renders every mounted screen without a restart

---

## Phase 2 — Locale-aware formatting

Deliberately before string extraction: it touches shared helpers used by every screen, and it fixes
a live bug. Doing it after extraction means touching the same call sites twice.

- [x] Change `formatCurrency` ([store.ts](src/lib/store.ts)) to take an explicit locale instead of
      relying on the ambient device locale — kept as an *optional* 3rd param defaulting to the
      current app language, so all 17 existing call sites needed zero changes
- [x] Add `src/lib/i18n/format.ts` with `formatMoney`, `formatDate`, `formatMonthYear`, `formatNumber` —
      all taking the active app language, all pure and unit-testable. (Named `formatMoney` rather than
      `formatCurrency` to avoid a naming collision with the store.ts wrapper, which is the function
      everything else in the app actually imports)
- [x] Replace all 6 `toLocaleDateString(undefined, …)` call sites — turned out to be 6, not 4, across
      5 files: [onboarding.tsx](app/onboarding.tsx), [ContributionStep.tsx](src/components/ContributionStep.tsx)
      (2 sites), [goals.tsx](app/(tabs)/goals.tsx), [dob-confirm-modal.tsx](src/components/ui/dob-confirm-modal.tsx),
      [plans.tsx](app/plans.tsx). `Intl.DateTimeFormat` itself needed no polyfill or workaround (Phase 0
      confirmed it produces correct Polish month names) — the bug was always the `undefined` locale arg
- [x] **Correction to this task's premise.** `remainingLabel`/`savedThisWeekLabel` aren't persisted
      React-rendered store state that goes stale on a language switch — they're transient parameters
      built fresh each time `buildAndRefreshSchedule` runs and passed straight into
      `Notifications.scheduleNotificationAsync` (a point-in-time snapshot by the nature of OS-scheduled
      notifications; there's no "render" to move formatting to). The actual fix: both call sites, plus
      the `fireMilestoneNotification` call in `updateGoal`, now pass `profile.language` explicitly
      rather than relying on `formatCurrency`'s ambient default, since the correct value is already in
      scope. Rescheduling *pending* notifications when the language changes is still real work — that's
      Phase 6, not this
- [x] Unit-tested `formatMoney`/`formatNumber` for `PLN`+`pl` (`1 000 zł`, symbol after) and `USD`+`en`
      (`$1,000`) — asserts on `charCodeAt` for the NBSP separator (0xa0), not a visually similar space
- [x] Unit-tested `formatMonthYear` for `pl` (`sierpień 2026`) and `en` (`August 2026`), plus
      `formatDate` for the full-date case, confirming Polish's genitive declension is correct when a
      day number precedes the month (`16 sierpnia 2026`, not `16 sierpień 2026`) — Intl.DateTimeFormat
      handles this correctly on its own, nothing to hand-roll
- [x] Confirmed Polish month names read correctly — verified both the standalone nominative
      (`formatMonthYear` → `sierpień`) and the genitive form Polish grammar requires after a day number
      (`formatDate` with `day` → `sierpnia`), both produced correctly by `Intl.DateTimeFormat('pl-PL')`
      without any special-casing

---

## Phase 3 — Onboarding + welcome (the detection surface)

The flow the feature is actually about. Ships as a coherent unit.

- [x] Extract [app/welcome.tsx](app/welcome.tsx) — 3 carousel slides (headline + sub) + CTAs.
      `SLIDES` restructured to a stable `id` + `expression` (was `headline`/`sub` used directly as
      both content and React key) so the translated string is no longer doing double duty as an
      identifier
- [x] Extract [app/onboarding.tsx](app/onboarding.tsx) — all 73 `<Text>` sites, 10 steps, validation
      error messages, `GOAL_CHIPS` labels, `LEGAL_LINKS` labels, `LegalLinksNote` trust copy.
      **Decision:** `GOAL_CHIPS`/`LEGAL_LINKS` gained a stable `id` field; `GOAL_CHIPS.label` stays
      the untranslated English canonical value written to `goalName` (and from there the persisted
      Goal and the onboarding webhook payload) — only the on-screen chip text is translated via
      `id`. Same precedent as plan names staying untranslated (see Decisions above)
- [x] Extract [src/components/ContributionStep.tsx](src/components/ContributionStep.tsx) — 20 `<Text>` sites
- [x] Add the language row to the `Localization` step (`onboarding.tsx`), pre-selected from
      `profile.language` (already device-detected via Phase 1 — see next item), changeable via
      `PickerModal`, matching the existing country/currency pickers on the same screen
- [x] **`detectLocaleCountry()` extension turned out unnecessary.** Phase 1 already seeds
      `profile.language` from the device independently of country/currency detection (that was the
      whole point of keeping language detection separate — a Polish speaker in the UK gets `pl` +
      whatever currency their region detection picks). The Localization step's new language row
      just reads `profile.language` directly; `detectLocaleCountry()` is untouched
- [x] Extract the auth gates: `LoginGate`, `LockGate`, `ConfirmPinGate`, `PinCreationFlow`
      (`SetPinGate` has no copy of its own; `PinPad` is digits/icons only, nothing to translate) —
      ~33 `<Text>` sites, plus the 2 `Alert.alert` forgot-PIN dialogs in LockGate/ConfirmPinGate
      (ahead of Phase 4's schedule — leaving them English would have broken an otherwise fully
      translated screen)
- [x] **Plan gap found and fixed:** `src/lib/pin.ts`'s `validatePinStrength` returns hardcoded
      English strings and wasn't in any phase's file list (it's a `src/lib/` file, not a component).
      Extended it to take `t` and return translated messages — the only call site
      (`PinCreationFlow.tsx`) already had `t` in scope
- [x] Translate all of the above to `pl`, including real Polish plural forms (one/few/many) for
      auth's "N attempts left" and onboarding's "N months away" — the first real exercise of the
      Phase 0 `@formatjs/intl-pluralrules` polyfill
- [ ] Verify the full cold-install flow end to end on a Polish-locale device: welcome → onboarding →
      OTP → PIN, with no English leaking through. **Not done** — no simulator/device verification
      was attempted this phase either (same reasoning as Phase 1: the only built simulator app is
      stale and unrelated, and the user prefers to self-verify UI). Confirmed instead via typecheck,
      the full test suite, a real production bundle export, and a key-parity check between the en/pl
      JSON files (`goal.chips.*`, `legal.*`, `welcome.slides.*` dynamic-key lookups all verified to
      resolve; the only en/pl key-count divergence is the expected one — English's 2 plural
      categories vs Polish's 3)
- [ ] Verify the same flow on an English device, and with a mid-flow language switch — same caveat,
      left for the user's own pass

---

## Phase 4 — Remaining screens

- [x] `app/(tabs)/index.tsx` — dashboard, 27 `<Text>`
- [x] `app/(tabs)/goals.tsx` — 39 `<Text>`. `GOAL_CHIPS` got the same `id`/canonical-`label` split as
      onboarding.tsx's copy, and the create-goal flow (which duplicates onboarding's copy verbatim)
      reuses `onboarding:` keys cross-namespace instead of re-typing them
- [x] `app/(tabs)/missions.tsx` — 17 `<Text>`. `TIER_LABELS` replaced with a computed
      `` t(`missions:tier${tier}`) `` key. Mission/achievement catalog content (`copy.title`,
      `copy.description`, badge `a.title`/`a.description`) deliberately left in English — that's
      Phase 5 territory (content catalogs), not this screen's chrome
- [x] `app/(tabs)/profile.tsx` — 19 `<Text>`
- [x] `app/(tabs)/coach.tsx` — 6 `<Text>` + the `GREETINGS` array (now read via
      `t('greetings', { returnObjects: true })`). **Locale bug found and fixed:** `formatTimestamp`
      was calling `toLocaleTimeString([], ...)` — same ambient-locale bug class Phase 2 fixed
      elsewhere, missed in the original audit because this call site didn't exist yet when Phase 2
      ran. Now uses `formatDate` from format.ts
- [x] `app/(tabs)/_layout.tsx` — 5 tab titles
- [x] `app/settings.tsx`, `app/plans.tsx`, `app/change-pin.tsx`, `app/delete-account.tsx`,
      `app/downgrade-selection.tsx`, `app/enable-biometric.tsx`
- [x] `src/components/`: `AddExpenseModal`, `UpgradeModal`, `LessonQuizModal`, `PlanGate` (21 `<Text>`),
      `calendar-modal`, `dob-confirm-modal`, `picker-modal`, `button`, `input`. `button`/`input` turned
      out to have no copy of their own (pure presentational, take `label`/`placeholder` from callers)
- [x] **Plan gap found and fixed:** `src/lib/entitlements.ts`'s `gateInfo()` — the "Upgrade your
      plan" popup's per-feature title/description — returns hardcoded English and wasn't in any
      phase's file list (same class of miss as Phase 3's `validatePinStrength`: a `src/lib/` file, not
      a component). Given an optional trailing `t?: TFunction<'plans'>` (no test coverage to preserve,
      but kept optional for symmetry with the pattern established below); its 3 call sites
      (`index.tsx`, `goals.tsx`, `coach.tsx`) now pass a dedicated `useTranslation('plans')` instance
      rather than widening each screen's default-namespaced `t`, since `gateInfo`'s keys always live
      in `plans.json` regardless of which screen opened the gate
- [x] All `Alert.alert` call sites — turned out already translated across the board except
      `src/lib/linking.ts`'s `safeOpenURL`, whose "Not available" title was hardcoded. Same
      `src/lib/`-file-missed-the-file-list class of gap as `gateInfo`/`validatePinStrength`; no test
      coverage, so `notAvailableTitle` was made a required third parameter and its 3 call sites
      updated to pass `t('common:notAvailable')`
- [x] All `placeholder=` props — clean; the only two remaining are onboarding.tsx's and
      LoginGate.tsx's PIN-dot placeholders (`••••••`), which are symbols, not language content
- [x] Calendar month/day names in `react-native-calendars`. New
      [src/lib/i18n/calendarLocale.ts](src/lib/i18n/calendarLocale.ts) registers `en`/`pl` into
      xdate's `LocaleConfig` (the library re-exports `LocaleConfig` from `xdate`, a locale registry
      entirely separate from i18next) with month/day names derived from `Intl.DateTimeFormat` — same
      approach as format.ts's `formatMonthYear`, so there's one source of truth for what Polish
      months/days are called rather than a second hand-typed list. `calendar-modal.tsx` calls
      `setCalendarLocale(language)` in an effect and also swapped its own hardcoded `MONTH_LABELS`
      picker-grid array and `QUICK_JUMPS` chip labels (`+6mo`/`+1yr`/...) for translated equivalents,
      both of which are custom UI in this component, not part of the `react-native-calendars` library
      surface `LocaleConfig` covers
- [x] Translate everything above to `pl`
- [ ] Check every screen for layout breakage — Polish runs ~15–20% longer than English, and the
      3xl black headings in onboarding and the dashboard are the likeliest to wrap badly. **Not
      done** — no simulator/device verification was attempted this phase either, same reasoning as
      Phases 1 and 3 (the user prefers to self-verify UI). Confirmed instead via typecheck, the full
      test suite (233 tests), and JSON-syntax validation of every locale file touched

---

## Phase 5 — Content catalogs

Data, not chrome. Keys live in the `content` namespace; the catalogs keep their stable IDs and lose
their hardcoded display strings.

- [x] `src/lib/missions.ts` — all 30 defs (the "32" estimate was off by 2; the catalog has 12
      tier-1 + 10 tier-2 + 8 tier-3 defs) × (title + description), preserving `{amount}`
      interpolation via the existing `renderMissionCopy` injection point. **Key-separator gotcha:**
      i18next splits lookup keys on `.` by default, which would mis-parse the id
      `save-1.5x-target` as three path segments — the content-key slug replaces dots with
      dashes (`save-1-5x-target`), computed identically in `renderMissionCopy` and in
      `content.json`'s key. `renderMissionCopy` gained an optional trailing
      `t?: TFunction<'content'>` (English-fallback pattern, same as `validateRetentionSelection`/
      `gateInfo`) — kept optional specifically because `missions.test.ts` has real 3-arg call sites
      asserting exact English output (`'Skip a coffee'`). `MissionCard` in
      `app/(tabs)/missions.tsx` now passes a dedicated `useTranslation('content')` instance
- [x] Mission copy that counts things (5 expenses, 3 expenses, 2 deposits, 7-day/30-day streaks) —
      these are fixed constants baked into each def, not runtime-varying counts, so there's no
      i18next `_one`/`_few`/`_many` interpolation to wire; each was hand-written in the
      grammatically-correct static Polish form for its specific number instead (e.g. "5 wydatków"
      genitive plural, "Dwie wpłaty" nominative-feminine for 2)
- [x] `src/lib/lessons.ts` — all 15 lessons × (topic + question + 3 options + explanation) = 90
      strings. `lessons.ts` itself is untouched (no test-compatibility need to preserve translated
      output there); resolution happens entirely in `LessonQuizModal.tsx` via a new
      `useTranslation('content')` keyed by `lesson.id`, options read back via
      `t(..., { returnObjects: true })`
- [x] **Native financial review of the lesson translations**, per the risk flagged here: the `apy`
      lesson does NOT use "RRSO" (Rzeczywista Roczna Stopa Oprocentowania is specifically Polish
      consumer-credit APR terminology, not a savings-yield concept) — it's reframed around
      "oprocentowanie efektywne" / kapitalizacja odsetek (effective/compounding interest), which is
      the term Polish banks actually use for savings yield. `50/30/20` kept its numbers but got
      natural Polish budgeting phrasing. `credit-score` was framed around "scoring kredytowy" (the
      BIK-score concept Polish readers actually encounter) rather than a literal, meaningless
      transliteration
- [x] `GOAL_TEMPLATES` — all 10 names translated in `content.json`. **Finding:** this export is
      dead code — grepped for every possible reference and found none; nothing in the app currently
      renders it. Translated anyway since it's cheap and explicitly in scope, but flagging so it
      isn't mistaken for a verified-working picker somewhere
- [x] `EXPENSE_CATEGORIES` — all 8 names. Resolved by id in `app/(tabs)/profile.tsx`'s expense
      breakdown and `AddExpenseModal.tsx`'s category chips (the chip's `.split(' ')[0]` short-label
      trick still works on the Polish translations — Polish word order also puts the primary word
      first, e.g. "Jedzenie i napoje" → "Jedzenie")
- [x] `COUNTRIES` — all 25 country names. Resolved by code in `onboarding.tsx`'s country picker,
      its confirmation-row display, and the `PickerModal` items list (so search filtering matches
      the Polish name too, not just the English one hidden behind it)
- [x] `CURRENCIES` — all 19 currency names, same treatment as countries. `.symbol` (never
      language-dependent) stays untouched everywhere it's used on its own (index.tsx, goals.tsx,
      ContributionStep.tsx, AddExpenseModal.tsx)
- [x] Plan descriptions in `src/lib/entitlements.ts` — turned out to be nothing here to translate.
      `PlanConfig` has no free-text description field; `displayName` is the only string and it's
      already covered by the existing "names stay in English" decision (Beginner/Medium/Family).
      The plan-feature copy this checklist item was probably anticipating (`plans:feature.*`) was
      already translated in Phase 4
- [x] `DEFAULT_ACHIEVEMENTS` (12 badges) — not in the original Phase 5 list, but flagged as a gap
      during Phase 4's audit (missions.tsx's badge grid). Same id-based resolution pattern: the
      persisted store data (`store.ts`'s `DEFAULT_ACHIEVEMENTS`) stays the English canonical, and
      `app/(tabs)/missions.tsx`'s achievements grid now resolves `content:achievements.<id>.title`/
      `.description` instead of reading `a.title`/`a.description` off the (possibly stale,
      English-only) persisted object directly
- [x] Verified `missions.test.ts` and `lessons.test.ts` still pass — they assert on IDs and
      behaviour as expected, so nothing broke. (5 unrelated pre-existing failures in
      `missions.test.ts` are a date-fixture flake — tests hardcode an expected `weekStart` that
      only held on the date they were written; confirmed via `git stash` that they fail identically
      with none of this phase's changes applied, so left alone as out of scope)

---

## Phase 6 — Server-side and notifications

The half of the app's language that JS bundles do not control.

- [x] Add `language` to the coach request payload ([coach.tsx](app/(tabs)/coach.tsx)) — added to the
      existing `context` object (`context.language`), alongside `firstName`/`streak`/`level`
- [x] Update the `CLAUDE_coach_reply` n8n workflow's system prompt to reply in the requested language,
      keeping the `<!--CELEBRATE-->` marker contract and the jailbreak guard intact. All **three**
      prompt-building Code nodes needed it, not just the main one — `Build Refusal Prompt` (jailbreak
      decline) and `Build Quota Prompt` (out-of-messages / incomplete-account) build their own
      `systemMessage` independently and would otherwise keep replying in English even to a Polish
      user. Each reads `context.language` off the webhook body and prepends an explicit
      "always reply in natural, native-sounding Polish — never English" instruction line; nothing
      else in any of the three prompts changed. **Applied to the workflow's draft version only —
      not yet published to production** (see note at the end of this phase)
- [x] Verify streaming still parses correctly with Polish text. **Finding: already safe, no code
      change needed.** The client uses `TextDecoder.decode(value, { stream: true })`, which is
      specifically designed to buffer an incomplete multi-byte UTF-8 sequence across `read()` calls
      rather than emit a corrupted partial character — the exact case the plan doc was worried
      about. Everything downstream (`parseStreamEventLine`, `stripCelebrateMarker`) operates on the
      already-decoded JS string (codepoints), not raw bytes, so there's nothing to fix
- [x] Add `language` to the Deep Analysis payload ([deepAnalysis.ts](src/lib/deepAnalysis.ts)) —
      `triggerDeepAnalysis` gained a required `language` param (no test coverage to preserve, single
      call site), sent as a `&language=` query param alongside the existing `userId`.
      **Workflow-side prompt update blocked**: the live workflow (`Stripe - Extra Financial Analysis
      + Ai chat system`, matched by name/active-status since the client only has a bare webhook
      UUID) has MCP access disabled at the workflow level — I can't inspect or edit it through this
      connection. Needs the user (or someone with n8n UI access) to flip "Enable MCP access" on that
      workflow's card/settings before this item can be finished
- [x] Add `language` to the onboarding webhook payload ([onboarding.tsx](app/onboarding.tsx)) and
      persist it on the Appwrite profile. Added a new optional `language` string attribute (size 5,
      default `'en'`) to the Appwrite `users` collection, then updated `CLAUDE_onboarding`'s
      `Normalize` node (reads `body.language`, defaults `'en'`) and `Create User Row` (writes it).
      Deliberately onboarding-time-only, matching the existing architecture: a later in-app language
      switch (Settings) stays a local `profile.language` change, same as every other profile field —
      there's no "sync back to Appwrite on every settings change" mechanism for anything else either,
      so this doesn't add one just for language. **Draft only, not yet published** (see note below)
- [x] Translate all notification copy in [src/lib/notifications.ts](src/lib/notifications.ts) — daily
      check-in, weekly reflection, trial-ending, milestone (goal-crushed/progress/achievement),
      first-goal. New `notifications` namespace content, resolved via `i18n.getFixedT(language, ns)`
      rather than `useTranslation()` — `notifications.ts` and the `store.ts` call sites that build
      milestone copy aren't always inside a React render (store actions fire from a Zustand `set()`
      callback), and local notifications are pre-rendered strings at schedule time, not re-evaluated
      by the OS at fire time, so there's no hook to reach for either way. Imports the raw `i18next`
      package (not this app's `./i18n/index.ts` wrapper, which imports `useStore` from store.ts —
      importing it from notifications.ts, which store.ts imports, would be circular)
- [x] Apply Polish plurals to the weekly reflection's expense count — `body_one`/`body_few`/`body_many`
      (English `body_one`/`body_other`), same mechanism as every other pluralized string in this app
- [x] **Reschedule pending notifications on language change.** `app/settings.tsx`'s language toggle now
      calls `refreshNotifications()` immediately after `updateProfile({ language })`, so switching
      languages re-renders every currently-scheduled local notification in the new language right
      away instead of waiting for the next unrelated reschedule trigger (adding an expense, updating
      a goal, etc.)

Both `CLAUDE_coach_reply` (language-aware prompts) and `CLAUDE_onboarding` (language persistence) were
published to production after user confirmation — both are now live and serving real traffic.
- [ ] Translate `fireMilestoneNotification` call sites in [store.ts:650](src/lib/store.ts:650), which
      pass composed English strings from the store layer

---

## Phase 7 — Native layer

- [ ] Add `CFBundleLocalizations: ['en', 'pl']` to the iOS config in [app.json](app.json)
- [ ] Localize `NSFaceIDUsageDescription` — the `faceIDPermission` string in [app.json](app.json) is
      baked into `Info.plist` and never passes through i18next
- [ ] Localize the notification permission prompt strings
- [ ] Android: add `values-pl/strings.xml` for any native-facing string
- [ ] Rebuild both platforms and confirm the OS-level Face ID and notification dialogs appear in
      Polish on a Polish-locale device

---

## Phase 8 — Verification and ship

- [ ] Key parity test: every key in `en` exists in `pl` and vice versa, across all namespaces — fails CI
- [ ] No-missing-key test: i18next configured to throw (dev) / log (prod) on a missing key, so a
      raw key string can never silently ship to a user
- [ ] Polish plural test: `one`/`few`/`many`/`other` resolve correctly for 1, 2, 5, 22, 25, 101, 112
- [ ] Consider an ESLint no-literal-string rule scoped to `app/` and `src/components/` to stop
      regressions — evaluate the noise level before committing to it
- [ ] `npm run typecheck` clean
- [ ] `npm test` clean
- [ ] `npm run check:bundle-size` under budget
- [ ] Full manual pass in Polish: cold install → onboarding → dashboard → goals → missions → coach →
      profile → settings → plans → PIN/biometric → notifications
- [ ] Full manual pass in English, confirming no regressions
- [ ] Language-switch pass: switch in Settings mid-session, confirm every surface updates and pending
      notifications reschedule
- [ ] Native-speaker review of the complete Polish translation set
- [ ] Screenshot review for text overflow on the smallest supported device
- [ ] Update `README.md` / `THEME.md` with the "how to add a string" and "how to add a locale" workflow
- [ ] Open PR with `Closes #120`

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Hermes `Intl.PluralRules` missing or wrong | Every Polish plural silently falls back to one form — the app reads as broken Polish to a native speaker, and it is invisible to an English reviewer | Phase 0 device probe, `@formatjs` polyfill on standby |
| Text overflow in Polish | Polish is ~15–20% longer; the app leans on large black display headings | Screenshot pass on the smallest device (Phase 4) |
| Scheduled notifications keep the old language | Silent, delayed, and looks like a bug with no obvious trigger | Explicit reschedule-on-switch task (Phase 6) |
| Store-derived label strings go stale | Pre-formatted strings in state do not re-render on language change | Move to render-time formatting (Phase 2) |
| Mistranslated lesson content | The quiz asserts financial facts; a wrong term teaches a wrong fact | Native financial review, called out separately (Phase 5) |
| Coach replies in English anyway | Backend has no language signal; easy to miss because the client looks correct | Payload field + prompt change, verified live (Phase 6) |
| NBSP separator breaks tests or layout | `1 000 zł` uses U+00A0, which looks identical to a space in a diff | Assert on codepoints in tests (Phase 2) |
| Bundle size | 8.0 MB CI guardrail, 6.06 MB baseline | Measured in Phase 0 before any extraction work |
