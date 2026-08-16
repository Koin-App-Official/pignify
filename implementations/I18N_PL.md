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

- [ ] Change `formatCurrency` ([store.ts:904](src/lib/store.ts:904)) to take an explicit locale
      instead of relying on the ambient device locale
- [ ] Add `src/lib/i18n/format.ts` with `formatCurrency`, `formatDate`, `formatMonthYear`, `formatNumber` —
      all taking the active app language, all pure and unit-testable
- [ ] Replace the 4 `toLocaleDateString(undefined, …)` call sites:
      [onboarding.tsx:166](app/onboarding.tsx:166), [ContributionStep.tsx:48](src/components/ContributionStep.tsx:48),
      [goals.tsx:56](app/(tabs)/goals.tsx:56), [dob-confirm-modal.tsx:15](src/components/ui/dob-confirm-modal.tsx:15),
      [plans.tsx:72](app/plans.tsx:72)
- [ ] Move `remainingLabel` and `savedThisWeekLabel` out of store state
      ([store.ts:531](src/lib/store.ts:531)) — return raw numbers, format at render
- [ ] Unit-test `formatCurrency` for `PLN`+`pl` (`1 000 zł`, symbol after, NBSP separator) and
      `USD`+`en` (`$1,000`) — assert on the actual separator codepoint, not a visually similar one
- [ ] Unit-test `formatMonthYear` for `pl` (`sierpień 2026`) and `en` (`August 2026`)
- [ ] Confirm Polish month names read correctly in every phrase that embeds them — Polish declines
      months, and standalone nominative (`sierpień`) is only right in some sentence positions. Phrase
      the Polish copy around the standalone form rather than fighting the formatter

---

## Phase 3 — Onboarding + welcome (the detection surface)

The flow the feature is actually about. Ships as a coherent unit.

- [ ] Extract [app/welcome.tsx](app/welcome.tsx) — 3 carousel slides (headline + sub) + CTAs
- [ ] Extract [app/onboarding.tsx](app/onboarding.tsx) — all 73 `<Text>` sites, 10 steps, validation
      error messages, `GOAL_CHIPS` labels, `LEGAL_LINKS` labels, `LegalLinksNote` trust copy
- [ ] Extract [src/components/ContributionStep.tsx](src/components/ContributionStep.tsx) — 20 `<Text>` sites
- [ ] Add the language row to the `Localization` step ([onboarding.tsx:1009](app/onboarding.tsx:1009)),
      pre-selected from detection, changeable via `PickerModal`
- [ ] Extend `detectLocaleCountry()` → also return the detected language; keep country/currency
      detection independent of it (a Polish speaker in the UK wants `pl` + `GBP`)
- [ ] Extract the auth gates: `LoginGate`, `LockGate`, `ConfirmPinGate`, `SetPinGate`,
      `PinCreationFlow`, `PinPad` (~33 `<Text>` sites)
- [ ] Translate all of the above to `pl`
- [ ] Verify the full cold-install flow end to end on a Polish-locale device: welcome → onboarding →
      OTP → PIN, with no English leaking through
- [ ] Verify the same flow on an English device, and with a mid-flow language switch

---

## Phase 4 — Remaining screens

- [ ] `app/(tabs)/index.tsx` — dashboard, 27 `<Text>`
- [ ] `app/(tabs)/goals.tsx` — 39 `<Text>`
- [ ] `app/(tabs)/missions.tsx` — 17 `<Text>`
- [ ] `app/(tabs)/profile.tsx` — 19 `<Text>`
- [ ] `app/(tabs)/coach.tsx` — 6 `<Text>` + the `GREETINGS` array
- [ ] `app/(tabs)/_layout.tsx` — 5 tab titles
- [ ] `app/settings.tsx`, `app/plans.tsx`, `app/change-pin.tsx`, `app/delete-account.tsx`,
      `app/downgrade-selection.tsx`, `app/enable-biometric.tsx`
- [ ] `src/components/`: `AddExpenseModal`, `UpgradeModal`, `LessonQuizModal`, `PlanGate` (21 `<Text>`),
      `calendar-modal`, `dob-confirm-modal`, `picker-modal`, `button`, `input`
- [ ] All 25 `Alert.alert` call sites
- [ ] All 16 `placeholder=` props
- [ ] Calendar month/day names in `react-native-calendars` — it has its own `LocaleConfig`, separate
      from i18next, and defaults to English
- [ ] Translate everything above to `pl`
- [ ] Check every screen for layout breakage — Polish runs ~15–20% longer than English, and the
      3xl black headings in onboarding and the dashboard are the likeliest to wrap badly

---

## Phase 5 — Content catalogs

Data, not chrome. Keys live in the `content` namespace; the catalogs keep their stable IDs and lose
their hardcoded display strings.

- [ ] `src/lib/missions.ts` — 32 defs × (title + description), preserving `{amount}` interpolation via
      the existing `renderMissionCopy` injection point ([missions.ts:842](src/lib/missions.ts:842))
- [ ] Apply Polish plural forms to the mission copy that counts things (days, expenses, deposits)
- [ ] `src/lib/lessons.ts` — 15 lessons × (topic + question + 3 options + explanation) ≈ 75 strings
- [ ] **Native financial review of the lesson translations.** These teach facts. `APY` is not `RRSO`
      (that is APR for credit); the correct Polish framing is a rate-of-return term, and `50/30/20`
      is universal but its wording is not. A mistranslation here teaches a user something false
- [ ] `GOAL_TEMPLATES` — 12 names ([store.ts:285](src/lib/store.ts:285))
- [ ] `EXPENSE_CATEGORIES` — 8 names ([store.ts:348](src/lib/store.ts:348))
- [ ] `COUNTRIES` — 25 country names ([store.ts:298](src/lib/store.ts:298))
- [ ] `CURRENCIES` — 19 currency names ([store.ts:326](src/lib/store.ts:326))
- [ ] Plan descriptions in `src/lib/entitlements.ts` (names stay in English — see Decisions)
- [ ] Verify `missions.test.ts` and `lessons.test.ts` still pass — they should assert on IDs and
      behaviour, so if they break on copy that is itself worth fixing

---

## Phase 6 — Server-side and notifications

The half of the app's language that JS bundles do not control.

- [ ] Add `language` to the coach request payload ([coach.tsx:265](app/(tabs)/coach.tsx:265))
- [ ] Update the `CLAUDE_coach_reply` n8n workflow's system prompt to reply in the requested language,
      keeping the `<!--CELEBRATE-->` marker contract and the jailbreak guard intact
- [ ] Verify streaming still parses correctly with Polish text — the NDJSON deltas are chunked by
      byte, and Polish diacritics (ą ć ę ł ń ó ś ź ż) are multi-byte in UTF-8
- [ ] Add `language` to the Deep Analysis payload ([deepAnalysis.ts:13](src/lib/deepAnalysis.ts:13)) and
      its workflow prompt
- [ ] Add `language` to the onboarding webhook payload ([onboarding.tsx:478](app/onboarding.tsx:478)) and
      persist it on the Appwrite profile, so backend-originated messages match
- [ ] Translate all notification copy in [src/lib/notifications.ts](src/lib/notifications.ts) — daily
      check-in, weekly reflection, trial-ending, milestone, first-goal
- [ ] Apply Polish plurals to the weekly reflection's expense count
      ([notifications.ts:166](src/lib/notifications.ts:166))
- [ ] **Reschedule pending notifications on language change.** They are rendered at schedule time,
      so without this a user who switches to Polish keeps receiving English notifications for days
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
