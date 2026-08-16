# Onboarding v2 — Implementation Plan

Derived from the onboarding pattern-library report + the audit of `app/onboarding.tsx`.
Status: **in progress** — A–D merged. E–H rewritten 2026-08-16 after the RevenueCat plan was dropped.

## Progress

| Issue | Scope | Status |
|---|---|---|
| A | Onboarding structure fixes | ✅ merged ([#56](https://github.com/Koin-App-Official/pignify/pull/56)) — device check pending |
| B | Pre-signup carousel | ✅ merged ([#58](https://github.com/Koin-App-Official/pignify/pull/58)) — copy + visuals pending review |
| C | Trust & consent copy pass | ✅ merged ([#60](https://github.com/Koin-App-Official/pignify/pull/60)) — "email me this plan" deferred |
| D | Push pre-permission step | ✅ merged ([#62](https://github.com/Koin-App-Official/pignify/pull/62)) — device check pending |
| E | Trial entitlement machinery (no payment) | ☐ ready to start |
| F | App-side trial state | ☐ blocked on E |
| G | Trial gate + day-15 lockout | ☐ blocked on F |
| H | Payment rail | ⛔ deferred — rail undecided, see open decisions |

## Decisions

Locked 2026-08-14, **revised 2026-08-16** where marked.

| # | Decision |
|---|---|
| D1 | **REVISED.** 14-day free trial on every plan, **no card required**. Was: card-up-front via store IAP. |
| D2 | **REVISED — RevenueCat is dropped.** Was: "RevenueCat replaces Stripe entirely." The existing Stripe rail is *retained, not archived*. |
| D3 | **REVISED.** The trial always runs its full 14 days, whenever the user cancels. After expiry without a subscription: full lockout. Was: immediate cutoff on cancel. |
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

- [ ] **Which payment rail** (blocks H). Three viable options, see H.
- [ ] **Day-15 fallback if H isn't ready.** Hard lockout with no way to pay is the worst outcome. Options: extend the trial server-side for existing users (cheap — `trial_ends_at` is a column), or soft-lock to read-only. Needs deciding *before* launch, not after.
- [ ] **Play policy stance**, only if Stripe is chosen in H — selling digital subscriptions in a Play-distributed app outside Play Billing is the exact thing the policy targets.

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

**Branch:** `feat/issue-E-trial-entitlements` · **Depends on:** nothing · **Blocks:** F, G · **Files:** n8n workflows, Appwrite schema

> **Rewritten.** Was "RevenueCat backend & product configuration". No store, no RC, no Stripe changes. Nothing here needs the Apple Developer Program.

- [ ] **Add `trial_ends_at`** to the `entitlements` table (and `trial_started_at` for analytics).
- [ ] **`CLAUDE_onboarding` grants the trial.** It already seeds beginner entitlements on signup — extend it to stamp a 14-day trial with `status: trialing` and the chosen plan. One workflow, one node.
- [ ] **Expire lazily on read, not on a cron.** `CLAUDE_entitlements_get` compares `trial_ends_at` to now and returns `expired` past the date. This mirrors the lazy period-key pattern already used for quotas in `src/lib/quota.ts` and needs no scheduler.
- [ ] **Return `trialEndsAt` and `status`** from `CLAUDE_entitlements_get` so the client can render the countdown and the day-12 reminder without a second call.
- [ ] **Which plan does the trial grant?** Recommend Family (best first impression, and the drop at day 15 is the conversion argument). Alternative: the plan the user picks at the gate. Decide during implementation.
- [ ] **Leave the Stripe workflows alone.** `CLAUDE_billing_checkout`, `billing_addon`, `stripe_webhook`, `billing_sync` stay live and untouched — they are the fastest path to H if Stripe wins.
- [ ] **Do NOT touch `CLAUDE_account_delete`.** Its Stripe cancellation still works. The store-cancellation regression flagged in the old plan was a RevenueCat consequence and no longer applies.

---

# Issue F — App-side trial state

**Branch:** `feat/issue-F-trial-client` · **Depends on:** E · **Files:** `src/lib/store.ts`, `src/lib/entitlements.ts`, `src/lib/entitlementsSync.ts`, `app/plans.tsx`

> **Rewritten.** Was "App-side billing swap" (RevenueCat SDK). No SDK, no new dependency, no dev-build requirement.

- [ ] **Rename `plan: 'free'` → `'beginner'`.** A plan id named `free` that costs $5.99 is a bug waiting to happen, and the backend *already* uses `beginner` for `effective_plan_id` — this closes a live client/server mismatch.
- [ ] Zustand `persist` migration for installed apps (the store now has `PIGGY_STORE_VERSION` / `migratePiggyState`, so this has a home).
- [ ] **Add `trialEndsAt`** to the profile; extend `PlanStatus` with `expired`. `src/lib/subscription.ts` already models `trialing`/`past_due`/`canceled` + lockout — reuse it rather than inventing a parallel state machine.
- [ ] **`trialDays` → 14 across all three plans** in `entitlements.ts` (currently 0/0/7).
- [ ] **`entitlementsSync.ts` reads `trialEndsAt` + `status`** from the extended webhook response.
- [ ] **`plans.tsx` becomes a trial-aware view** — "12 days left of your trial" rather than a checkout screen, with the upgrade CTA disabled or pointing at a "coming soon" state until H lands.
- [ ] `npm run typecheck` + `npm test` clean.

---

# Issue G — Trial gate + day-15 lockout

**Branch:** `feat/issue-G-trial-gate` · **Depends on:** F · **Files:** `src/lib/authLock.ts`, `src/components/auth/AuthGate.tsx`, new `src/components/auth/PlanGate.tsx`, `app/onboarding.tsx`, `src/lib/notifications.ts`

> **Rewritten.** Was "Onboarding paywall + trial lifecycle". The paywall becomes a one-tap trial start; the payment moment moves to H.

- [ ] **New lock status `needs_plan`** in the `authLock` machine, after login and before `needs_pin_setup` (satisfies D5). Building it into the state machine rather than into onboarding means the *same* gate serves the day-15 lockout — one screen, two jobs.
- [ ] **`PlanGate`, trial-start mode** — what the trial includes, "no card needed, nothing to cancel", one button. This is not a paywall and should not look like one.
- [ ] **`PlanGate`, lockout mode** — same component, expired copy, and whatever H provides as the way to pay.
- [ ] **Day-12 trial-ending notification.** `_layout.tsx:42` already routes a `trial-ending` type to `/plans`; schedule it off `trialEndsAt`. With no card on file this is the *only* conversion signal, so it matters far more than it did under auto-renewing IAP.
- [ ] **Onboarding hand-off** — `onboarding.tsx` currently calls `onLoggedIn()` straight into PIN setup. Transition into `needs_plan` first; move the Success screen and confetti to after PIN creation so the celebration lands on a finished account.
- [ ] Verify bootstrap routes a user who quit at the gate (real account, no PIN) back to `needs_plan` rather than stranding them.

### Risk

- **Data is never deleted at lockout** (constraint C4). `subscription.ts` zeroes entitlements and sets `locked`; the rows stay.
- **A no-card trial converts worse than a card-on-file trial.** Expected and accepted — the alternative was sending a brand-new user to a browser to type card details before using the app once.

---

# Issue H — Payment rail ⛔ DEFERRED

**Depends on:** the rail decision below · **Deadline:** before the first cohort reaches day 15

Nothing here can start until the rail is chosen. All three options remain open; the entitlement read path (`CLAUDE_entitlements_get` → Appwrite) stays the single authority the app trusts, so any of them plugs in underneath without touching E–G.

**Option 1 — Google Play Billing.** Works today, no Apple account needed. Native purchase UX, best conversion, Play-policy compliant by construction. Cost: Google's cut, and Apple IAP still has to be built separately when D9 lifts.

**Option 2 — Stripe web checkout.** The rail is *already built and live* — `billing.ts`, `CLAUDE_billing_checkout`, `stripe_webhook`, `billing_sync`. Cheapest to finish by a wide margin, ~2.9% instead of 15–30%, full control of trials, proration, and discounts. Cost: leaving the app to a browser hurts conversion (mitigate with Apple Pay / Google Pay in Stripe Checkout), and it is squarely what Play's billing policy targets.

**Option 3 — Wait for the Apple Developer Program**, then do both stores at once. Cleanest end state, unknown timeline.

**Correction on record:** RevenueCat was dropped because of the Apple block, but RC supports **Play-only projects** — the Apple constraint never actually ruled it out for Android. If Option 1 is chosen, RC is still worth considering as the wrapper, since it makes adding Apple IAP later nearly free.

---

## Sequencing

```
A ──► C ──► D                    ✅ all merged
B                                ✅ merged

E ──► F ──► G                    ready now; nothing store-dependent
              └──► H             blocked on the rail decision
```

E, F and G can be built and shipped to Play without any store, Apple, or payment dependency. H is the only piece that needs a decision, and its deadline is day 15 of the first real user.

## Not in scope

Behaviour-triggered lifecycle messaging beyond the day-12 trial reminder, post-close discount offers (report §7.4), self-segmentation/attribution questions (§2.2), and demo mode (§1.3). All viable later; none belong in this batch.
