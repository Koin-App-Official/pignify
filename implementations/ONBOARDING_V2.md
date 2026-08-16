# Onboarding v2 — Implementation Plan

Derived from the onboarding pattern-library report + the audit of `app/onboarding.tsx`.
Status: **in progress** — A–G done. H and I (payment + lockout) are specced and unblocked; the rail is decided. E–H rewritten 2026-08-16 after the RevenueCat plan was dropped.

## Progress

| Issue | Scope | Status |
|---|---|---|
| A | Onboarding structure fixes | ✅ merged ([#56](https://github.com/Koin-App-Official/pignify/pull/56)) — device check pending |
| B | Pre-signup carousel | ✅ merged ([#58](https://github.com/Koin-App-Official/pignify/pull/58)) — copy + visuals pending review |
| C | Trust & consent copy pass | ✅ merged ([#60](https://github.com/Koin-App-Official/pignify/pull/60)) — "email me this plan" deferred |
| D | Push pre-permission step | ✅ merged ([#62](https://github.com/Koin-App-Official/pignify/pull/62)) — device check pending |
| E | Trial entitlement machinery (no payment) | ✅ merged ([#81](https://github.com/Koin-App-Official/pignify/pull/81)) — verified live 2026-08-16 |
| F | App-side trial state | ✅ merged ([#84](https://github.com/Koin-App-Official/pignify/pull/84)) — device check pending |
| G | Trial gate + day-15 lockout | ☑ implemented ([#86](https://github.com/Koin-App-Official/pignify/issues/86)) — device check pending |
| H | Stripe checkout + full lockout | ☐ ready to start |
| I | Downgrade selection (what to keep) | ☐ blocked on H |

## Decisions

Locked 2026-08-14, **revised 2026-08-16** where marked.

| # | Decision |
|---|---|
| D1 | **REVISED.** 14-day free trial on every plan, **no card required**. Was: card-up-front via store IAP. |
| D2 | **REVISED twice.** RevenueCat is dropped; **Stripe is the rail on every platform** (decided 2026-08-16). The existing Stripe workflows are the implementation, not a fallback. |
| D3 | **REVISED.** The trial always runs its full 14 days, whenever the user cancels. After expiry without a subscription: full lockout. Was: immediate cutoff on cancel. |
| D12 | **NEW.** Full lockout means **no app access** — `PlanGate` is the only reachable screen. Not read-only, not degraded. |
| D13 | **NEW.** At lockout the user picks a plan **first**, then chooses which records to keep if the chosen plan holds fewer than they have. |
| D14 | **NEW.** Over-limit records are **archived, never deleted** (constraint C4) — but the UI tells the user they are *removed*. See the copy caveat under issue I. |
| D15 | **NEW.** Every tier including Beginner is offered at lockout, so a user with five goals may choose Beginner and archive four. |
| D4 | Age gate (DOB) moves early. ✅ done in A |
| D5 | Plan selection before PIN creation, after account creation. |
| D6 | "No bank connection" is a lead marketing message. ✅ done in B/C |
| D7 | Verified email stays at the end of onboarding; push is the drop-off recovery channel. ✅ done in D |
| D8 | Ship as separate issues/branches, not one PR. |
| D9 | **NEW.** No Apple Developer Program access. Nothing may depend on it — no App Store, no TestFlight, no iOS device builds, no Apple IAP. **Temporary**, so keep seams open rather than designing Apple out permanently. |
| D10 | **NEW.** Android / Google Play is the near-term release target. Mobile only — no web build. |
| D11 | **NEW.** Payment collection is deferred. The trial ships with **no payment rail at all**; the rail is chosen and built before the first cohort reaches day 15. |

## Why the trial can ship before the payment rail

This is the whole reason E–G are unblocked, so it's worth stating plainly.

A no-card trial involves **no transaction**. No store products, no checkout, no card entry, no receipt validation. It is an entitlement this app grants itself and expires on a timer. Nothing in E, F, or G touches the Apple Developer Program, Google Play Billing, Stripe, or RevenueCat.

Two useful consequences:

- **Google Play's billing policy does not apply yet.** It governs how digital goods are *paid for* in a Play-distributed app. With nothing sold in-app, there is nothing to govern. It becomes live the moment H lands, which is exactly when the rail decision has to be settled.
- **The deadline is real but not immediate.** Day 15 of the first real user is when H must exist. That is a schedule, not a blocker.

The risk to name: if H slips past that date, the first cohort hits a lockout screen with no way to pay. See the open decision on day-15 fallback.

## Target flow

```
Carousel (3 slides)                          ✅ B
  → Name
  → Age gate (DOB wheel + confirm)           ✅ A
  → Localization
  → Goal
  → Target amount
  → Income (skippable)
  → Contribution
  → Blueprint Review
  → Push pre-permission                      ✅ D
  → Email + OTP  → account created
  → Start 14-day trial — one tap, no card    ← G (was: paywall)
  → PIN creation
  → Success + confetti
  → App
```

Draft state persists across app kills at every step up to account creation. ✅ A

## Open decisions

- [ ] **Day-15 safety, now mandatory.** D12 removes the escape hatch, so a lapsed user with no working checkout is genuinely stuck. Either ship H before anyone's day 15, or push `trial_ends_at` out (one column update) until it is ready. **As of 2026-08-16 no user is on a trial** — zero `entitlements` rows have a `trial_ends_at` — so the clock starts with the first new signup, not today.
- [ ] **Play policy posture** (accepted risk, but pick the shape). Selling subscriptions in a Play-distributed app outside Play Billing is the specific case the policy targets, and the consequence is removal rather than a warning. Two shapes: a Subscribe button that links out from inside the app, or purchase handled entirely on the website with the app never containing a purchase flow (the day-12 reminder already being a notification makes this viable). Same Stripe rail either way; the second is a materially smaller target.

**Closed 2026-08-16:** the payment rail is Stripe everywhere (D2).

**Closed by the rewrite:** mid-trial upgrade behaviour (no payment, so nothing to prorate), paywall-failure escape hatch (no payment at the gate), account-deletion copy (Stripe rail retained, so `CLAUDE_account_delete` can still cancel server-side — the store-cancellation regression was a RevenueCat problem and is gone).

---

# Issue A — Onboarding structure fixes ✅

**Branch:** `feat/issue-55-onboarding-structure` ([#55](https://github.com/Koin-App-Official/pignify/issues/55)) · **Merged:** [#56](https://github.com/Koin-App-Official/pignify/pull/56)

- [x] **Move the age gate to position 2.** Extract the DOB block into its own `OnboardingStep.AgeGate = 1`. `AccountFinalization` keeps only email/OTP.
- [x] **Honest progress.** `TOTAL_STEPS` derives from the enum instead of a hardcoded 6 that told users "Step 6 of 6" with three screens to go.
- [x] **Draft persistence.** `src/lib/onboardingDraft.ts` — debounced AsyncStorage writes, hydrate on mount, clear on completion.
- [x] Never persist `code`, `pendingSession`, or `otpUserId`.
- [x] On resume show a one-line "Picking up where you left off, {name}".
- [x] **Webhook retry.** A provisioning failure after a *successful* OTP now offers a real Retry against the idempotent webhook, not a Resend of a spent code.

**Done when:**
- [ ] Cold-kill at any pre-account step resumes with all answers intact. *(draft module unit-tested; not yet exercised on a device)*
- [x] An under-18 user is blocked on screen 2, not screen 8.
- [x] The progress bar never overruns.
- [x] `npm run typecheck` and `npm test` clean.

---

# Issue B — Pre-signup carousel ✅

**Branch:** `feat/issue-57-welcome-carousel` ([#57](https://github.com/Koin-App-Official/pignify/issues/57)) · **Merged:** [#58](https://github.com/Koin-App-Official/pignify/pull/58)

- [x] Build `app/welcome.tsx` — three swipeable slides, mascot-led.
- [x] Persisted `welcomeSeen` flag; route cold installs here before `/onboarding`.
- [x] Review + finalise the draft copy below.

| Slide | Headline | Sub |
|---|---|---|
| 1 | Every goal starts with a number | Tell Piggy what you're saving for. We'll turn it into a month-by-month plan you can actually keep. |
| 2 | No bank login. Ever. | Piggy never connects to your accounts. There's nothing to link, and nothing for anyone to steal. |
| 3 | A coach in your pocket | Streaks, missions, and an AI coach that knows your plan — so month three feels as good as day one. |

**Open risk to watch:** leading with "no bank connection" invites *"so it's a spreadsheet?"* — slide 3 is the counterweight and must not be dropped.

---

# Issue C — Trust & consent copy pass ✅

**Branch:** `feat/issue-59-onboarding-trust-copy` ([#59](https://github.com/Koin-App-Official/pignify/issues/59)) · **Merged:** [#60](https://github.com/Koin-App-Official/pignify/pull/60)

- [x] **Replace the legal wall.** Five underlined links under the email field became one trust line — *"We're asking for your email. Not your bank."* — plus an expander holding all five, unchanged.
- [x] **Trust copy at the DOB step** — legal 18+ requirement, not profiling.
- [ ] **"Email me this plan"** — **DEFERRED, blocked:** the n8n backend has no email-sending workflow or provider credential (no SMTP/SendGrid/Resend). Also blocks the paid tiers' `emailReports` feature, which is likewise unimplemented.
- [ ] Supporting n8n send-blueprint webhook. **DEFERRED** with the item above.

---

# Issue D — Push pre-permission step ✅

**Branch:** `feat/issue-61-push-preprompt` ([#61](https://github.com/Koin-App-Official/pignify/issues/61)) · **Merged:** [#62](https://github.com/Koin-App-Official/pignify/pull/62)

- [x] New step between Blueprint Review and the email step: custom priming screen.
- [x] Fire the native prompt via `requestNotificationPermission()`; declining is non-blocking.
- [x] Wire the result into `profile.notificationPrefs` so Settings reflects reality.
- [x] Bump `DRAFT_VERSION` — inserting a step shifts the persisted indices.

**Note:** `plugins/withoutPushEntitlement` strips `aps-environment` on purpose — local notifications only.

---

# Issue E — Trial entitlement machinery (no payment rail)

**Branch:** `feat/issue-80-trial-entitlements` ([#80](https://github.com/Koin-App-Official/pignify/issues/80)) · **Depends on:** nothing · **Blocks:** F, G · **Files:** n8n workflows, Appwrite schema

> **Rewritten.** Was "RevenueCat backend & product configuration". No store, no RC, no Stripe changes. Nothing here needs the Apple Developer Program.

- [x] **Add `trial_ends_at`** to the `entitlements` table (and `trial_started_at` for analytics). Both live and `available`.
- [x] **`CLAUDE_onboarding` grants the trial.** `Build Beginner Entitlements` renamed to `Build Trial Entitlements`; stamps `status: trialing`, `trial_started_at`, `trial_ends_at`.
- [x] **Expire lazily on read, not on a cron.** Plus a write-back to Appwrite, so `CLAUDE_coach_reply` (which reads the row directly) can't keep spending a Family allowance against a lapsed trial. Write-back is `neverError` so a failed reconcile degrades to a stale row rather than 500ing a plan read.
- [x] **Return `trialEndsAt`, `status` and `locked`** from `CLAUDE_entitlements_get`. Additive — the existing `plan`/quota fields are unchanged, so older clients keep working.
- [x] **Which plan does the trial grant?** **Family.** `TRIAL_PLAN_ID` in the `Build Trial Entitlements` node is the single place to change it.
- [x] **Left the Stripe workflows alone.** `CLAUDE_billing_checkout`, `billing_addon`, `stripe_webhook`, `billing_sync` untouched.
- [x] **Did not touch `CLAUDE_account_delete`.**
- [x] Added an `expired` element to the `status` enum, so a lapsed trial is distinguishable from a cancelled paid subscription (issue G's win-back copy needs that).
- [x] Logic verified with pinned-data tests on both branches: lapsed trial → `expired`/`locked`/quota 0 + write-back fired; live trial → `trialing`/quota intact + write-back correctly skipped.
- [x] **Live end-to-end verified** (2026-08-16, after the Appwrite API key was rotated — see #82):
  - fresh signup → `status: trialing`, `effective_plan_id: family`, `trial_ends_at` exactly 14 days out, full Family quotas
  - backdated `trial_ends_at` → next read returned `expired` / `locked` / quota 0 **and** rewrote the Appwrite row (every quota zeroed, every feature false)
  - a second read returned the same result without writing again (`$updatedAt` unchanged) — the write-back is idempotent
  - replaying the onboarding webhook did not resurrect the expired trial, and created no duplicate goal or income rows
  - all test rows deleted afterwards

### Operational notes from the 2026-08-16 outage

- **`neverError` reads can misdiagnose an outage as "not found".** `Get User` and `Get Entitlements` in `CLAUDE_onboarding` both use `neverError: true`, so a 401 arrives as a response body with no `$id` and the `!!$json.$id` test reads false — the workflow concludes the record is missing and routes to the create branch. During the outage this is exactly what happened. It is contained rather than dangerous: `Create Entitlements Row` is a POST with an explicit `documentId`, which Appwrite rejects with 409 instead of overwriting, so a bad read produces a failed run rather than a silently re-granted trial — and issue A's Retry button covers the user-facing half. Worth distinguishing "missing" from "unreachable" if these are ever hardened.
- **Pre-trial accounts never receive a trial.** Accounts that existed before this change have `status: active`, `effective_plan_id: beginner`, `trial_ends_at: null`, and onboarding only seeds entitlements when the row is absent — so they keep working (`locked: false`) but will never show trial UI. Deliberately left alone; to be handled separately.

---

# Issue F — App-side trial state

**Branch:** `feat/issue-83-trial-client` ([#83](https://github.com/Koin-App-Official/pignify/issues/83)) · **Depends on:** E (merged) · **Files:** `src/lib/store.ts`, `src/lib/storeMigrations.ts`, `src/lib/entitlements.ts`, `src/lib/entitlementsSync.ts`, `app/plans.tsx`, `app/settings.tsx`, `app/(tabs)/_layout.tsx`

> **Rewritten.** Was "App-side billing swap" (RevenueCat SDK). No SDK, no new dependency, no dev-build requirement.

- [x] **Rename `plan: 'free'` → `'beginner'`.** Closes a live client/server mismatch — the backend has always used `beginner`. Also fixes a latent bug: `billing.ts` sent `plan: 'free'` to `CLAUDE_billing_checkout`, which resolves prices from a `plans` table keyed on `beginner`, so it could never have matched.
- [x] Zustand `persist` migration v3 → v4 for `plan` **and** `pendingPlan` (a stale `free` downgrade target would be applied verbatim at the next cycle). 5 new tests.
- [x] **Add `trialEndsAt`** to the profile; extend `PlanStatus` with `expired`.
- [x] **`trialDays` → 14 across all three plans** (was 0/0/7); now descriptive only, since the trial is granted server-side.
- [x] **`entitlementsSync.ts` reads `trialEndsAt`, `status` and `locked`**, and normalises `free`/`beginner` on the way in so the client doesn't depend on the n8n mapping being removed in lockstep.
- [x] `(tabs)/_layout.tsx` persists the synced `status` / `trialEndsAt` to the profile.
- [x] **`plans.tsx` is trial-aware** — a days-remaining banner while trialing, an "ended, nothing deleted" banner once expired. No payment CTA, since the rail is deferred to H.
- [x] `settings.tsx` and the plan cards distinguish `trialing` / `expired` from `canceled`.
- [x] **Fixed a bug this surfaced:** `scheduleTrialEnding` read `profile.currentPeriodEnd`, which only the checkout-return path ever writes — so for a trial user it was null and the reminder would never have been scheduled. It now prefers `trialEndsAt`.
- [x] `npm run typecheck` + `npm test` clean (184 passed).
- [ ] Device check: trial banner and expired state render correctly.

### Follow-up

Once this ships, the `beginner` → `free` mapping in `CLAUDE_entitlements_get`'s `Map Plan to App` node is redundant and can be dropped. Deferred because the backend is returning 401 on every call (#82) and the change can't be verified; the client normalisation makes the removal a no-op whenever it happens.

---

# Issue G — Trial gate + day-15 lockout

**Branch:** `feat/issue-86-trial-gate` ([#86](https://github.com/Koin-App-Official/pignify/issues/86)) · **Depends on:** F (merged) · **Files:** new `src/lib/planGate.ts`, `src/lib/authLock.ts`, `src/components/auth/AuthGate.tsx`, new `src/components/auth/PlanGate.tsx`, `app/onboarding.tsx`, `app/(tabs)/index.tsx`, `src/lib/notifications.ts`, `src/lib/store.ts`

> **Rewritten.** Was "Onboarding paywall + trial lifecycle". The paywall becomes a one-tap trial start; the payment moment moves to H.

- [x] **New lock status `needs_plan`** in the `authLock` machine, ahead of the PIN steps. The *lapsed* check additionally runs on every transition to `unlocked`, so a trial ending mid-week is caught on the next unlock rather than only at login.
- [x] **`PlanGate`, trial-intro mode** — what the trial includes, "we didn't ask for a card, so there's nothing to cancel", one button. Not a paywall and doesn't look like one.
- [x] **`PlanGate`, lapsed mode** — same component, leading with "nothing has been deleted" (constraint C4), which is the thing a user in that state actually worries about.
- [x] **Decision extracted to `src/lib/planGate.ts`** — pure and unit-tested (16 tests), since `store.ts` can't be imported under vitest. Same pattern as goalMath/deposits/storeMigrations.
- [x] `trialIntroSeen` on the profile, so the intro shows exactly once.
- [x] **Onboarding hands off directly**, and pulls entitlements once after provisioning so the gate shows the real tier and day count rather than a hardcoded guess.
- [x] **Celebration moved to the dashboard** (`justOnboarded`), firing once the gate and PIN setup are both behind the user — on a finished account, with their goal on screen.
- [x] **Trial reminder at 2 days out** (day 12), and its "no action needed if you've already added a payment method" copy dropped: there is no card, so that was never true.
- [x] `npm run typecheck` + `npm test` clean (200 passed).
- [ ] Device check: trial intro, lapsed screen, and the dashboard confetti.

### `LOCKOUT_ENFORCED` — the one thing left deliberately off

`planGate.ts` exports `LOCKOUT_ENFORCED = false`. With no payment rail, enforcing the lockout would produce a screen telling the user to subscribe and giving them no way to do it. The gate still *shows* on a lapse, so it is never silent — it just isn't a dead end.

Flip it to `true` in the same change that ships checkout (issue H); a test asserts the current value so the change is deliberate rather than accidental. Nobody can reach that state until 14 days after the first signup.

### On decision D5

D5 ("plan selection before PIN creation") was written when this gate was a paywall and the point was capturing day-0 payment intent. There is no payment here, so the *intro* still runs before PIN as D5 asks, but the *lapsed* check deliberately runs after unlock too — an expiry mid-week would otherwise never be noticed. `planGateReturnTo` records which entry point was used so dismissing the gate returns to the right place.

### Risk

- **Data is never deleted at lockout** (constraint C4). `subscription.ts` zeroes entitlements and sets `locked`; the rows stay.
- **A no-card trial converts worse than a card-on-file trial.** Expected and accepted — the alternative was sending a brand-new user to a browser to type card details before using the app once.

---

# Issue H — Stripe checkout + full lockout

**Depends on:** G · **Blocks:** I · **Deadline:** before the first cohort reaches day 15 · **Files:** `src/lib/planGate.ts`, `src/components/auth/PlanGate.tsx`, `src/lib/billing.ts`, `app/plans.tsx`, `CLAUDE_billing_checkout`

The rail already exists and is live — `billing.ts`, `CLAUDE_billing_checkout`, `CLAUDE_stripe_webhook`, `CLAUDE_billing_sync`. This is mostly wiring, not building.

- [ ] **Subscribe action in `PlanGate`'s lapsed mode** — plan cards (all three tiers, D15) into `startCheckout`, returning via the existing `requestSubscriptionSync` reconcile.
- [ ] **`LOCKOUT_ENFORCED` → true**, removing the "Continue" escape. `needs_plan` already replaces the whole tree in `AuthGate`, so no-app-access (D12) needs no new gating — only the escape hatch goes.
- [ ] Update the `LOCKOUT_ENFORCED` assertion in `planGate.test.ts` in the same change, so the flip stays deliberate.
- [ ] **Remove the leftover 7-day Stripe trial** for Family in `CLAUDE_billing_checkout` ("Pick Price + Trial"). The 14 free days are granted by the app; a Stripe trial on top would double-count them.
- [ ] **Enable Apple Pay / Google Pay in Stripe Checkout** — the browser round-trip is the main conversion cost of this rail, and one-tap wallets recover most of it.
- [ ] Confirm `plans.tsx`'s checkout-return path still reconciles correctly now that `planStatus` can be `expired`.

**Largely mooted by D12, but worth knowing:** `useEntitlements` reads every quota except AI messages from `PLAN_CONFIG[plan]` rather than the server's zeroed values, so a locked user *would* keep e.g. Family goal limits. With no app access there is nowhere for that to leak, but it should still be corrected rather than left as a latent trap.

---

# Issue I — Downgrade selection (what to keep)

**Depends on:** H · **Files:** `src/lib/retention.ts`, new selection screen

**This is already half-built.** `src/lib/retention.ts` implements the rule: a downgrade that exceeds the target plan's limits is **blocked** (`awaiting_selection`) until the user chooses what to keep, and over-limit records are archived rather than deleted. What is missing is the UI and the wiring into the lockout flow.

Flow, per D13: **pick a plan → see what doesn't fit → choose what to keep → subscription applies.**

- [ ] Selection screen driven by `computeRetentionRequirement` — per resource (goals, incomes, devices), how many must be archived and which the user keeps.
- [ ] Wire it between checkout success and unlock, so the plan cannot apply while over-limit.
- [ ] Offer "upgrade to Family instead" as an inline escape from the selection screen — a user confronting the loss of four goals is exactly who might pay more instead.
- [ ] Archived records stay visible and recoverable, and return automatically on a later upgrade (C4/C7).

### Copy caveat (D14)

The decision is to archive but tell the user the records are *removed*. Two things follow, and the copy has to thread them:

- Do **not** say "deleted permanently" or "this cannot be undone" — it would be untrue, and it collides with the archived goals reappearing if they later upgrade.
- Wording like **"removed from your plan"** or **"no longer active"** keeps the simplicity you want without asserting something false. Recommended, but it's your call.

## Sequencing

```
A ──► C ──► D                    ✅ merged
B                                ✅ merged
E ──► F ──► G                    ✅ merged (G in review)
              └──► H ──► I       ready; H gates the lockout, I gates the downgrade
```

H must land before any user's day 15, because D12 leaves no escape hatch. No one is on a trial yet, so the clock starts with the first new signup.

## Not in scope

Behaviour-triggered lifecycle messaging beyond the day-12 trial reminder, post-close discount offers (report §7.4), self-segmentation/attribution questions (§2.2), and demo mode (§1.3). All viable later; none belong in this batch.
