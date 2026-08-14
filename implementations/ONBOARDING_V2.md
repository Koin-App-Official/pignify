# Onboarding v2 — Implementation Plan

Derived from the onboarding pattern-library report + the audit of `app/onboarding.tsx`.
Status: **in progress** — issue A implemented. Tick boxes as work lands.

## Progress

| Issue | Scope | Status |
|---|---|---|
| A | Onboarding structure fixes | ☑ implemented (#55) — device check pending |
| B | Pre-signup carousel | ☐ not started |
| C | Trust & consent copy pass | ☐ not started |
| D | Push pre-permission step | ☐ not started |
| E | RevenueCat backend & products | ☐ blocked on store setup |
| F | App-side billing swap | ☐ not started |
| G | Onboarding paywall + trial lifecycle | ☐ not started |

## Decisions locked with the user (2026-08-14)

| # | Decision |
|---|---|
| D1 | No free tier. **14-day free trial on every plan**, then auto-charge on day 15. |
| D2 | **RevenueCat replaces Stripe entirely.** Both iOS and Android. |
| D3 | Trial end without conversion (cancelled in store / billing failure) = **full lockout**, consistent with the existing cancel rule. |
| D4 | Age gate (DOB) **moves early**, out of the terminal position after 7 screens of work. |
| D5 | **Paywall before PIN creation**, after account creation. |
| D6 | "No bank connection" is a **lead marketing message**, not a footnote. |
| D7 | Verified email stays at the **end** of onboarding; push becomes the drop-off recovery channel. |
| D8 | Ship as **separate issues/branches**, not one PR. |

## Open decisions — needed before the issue that depends on them

- [ ] **Mid-trial upgrade behaviour** (blocks F): carry the remaining trial over to the new tier, or charge immediately? Apple grants only one intro offer per subscription group per Apple ID, so there is no second trial either way.
- [ ] **Escape hatch on paywall failure** (blocks G): hard wall with no skip means an RC/store outage blocks 100% of new signups. Accept, or add a bounded grace path?
- [ ] **Account-deletion copy** (blocks E): store subscriptions can't be cancelled server-side — the user must do it. Needs wording + a manage-subscriptions deep link.

## Target flow

```
Carousel (3 slides)
  → Name
  → Age gate (DOB wheel + confirm)        ← moved up from step 7
  → Localization
  → Goal
  → Target amount
  → Income (skippable)
  → Contribution
  → Blueprint Review  (+ optional "email me this plan")
  → Push pre-permission                    ← new; the recovery channel
  → Email + OTP  → account created
  → Paywall: pick plan, start 14-day trial ← new, mandatory
  → PIN creation
  → Success + confetti
  → App
```

Draft state persists across app kills at every step up to account creation.

---

# Issue A — Onboarding structure fixes

**Branch:** `feat/issue-55-onboarding-structure` ([#55](https://github.com/Koin-App-Official/pignify/issues/55)) · **Depends on:** nothing · **Files:** `app/onboarding.tsx`, new `src/lib/onboardingDraft.ts`

Independent of the billing work; ships first and standalone.

- [x] **Move the age gate to position 2.** Extract the DOB block (`DobWheelPicker` + `DobConfirmModal` + `ageBlocked` terminal screen, currently `onboarding.tsx:897-924`) into its own `OnboardingStep.AgeGate = 1`. `AccountFinalization` keeps only email/OTP. Renumber the enum; the enum exists precisely so this is reviewable.
- [x] **Honest progress.** `TOTAL_STEPS` currently = 6 while 8 interactive screens exist; the bar disappears at `BlueprintReview` (`onboarding.tsx:389`), so users hit "Step 6 of 6" then face three more screens. Make the bar span every step through the paywall, and keep it visible.
- [x] **Draft persistence.** New `src/lib/onboardingDraft.ts` — debounced write of the collected answers to AsyncStorage on each step advance; hydrate on mount; clear on `onboardingCompleted`.
- [x] Never persist `code`, `pendingSession`, or `otpUserId`.
- [x] On resume show a one-line "Picking up where you left off, {name}".
- [x] **Webhook retry.** On provisioning failure after a *successful* OTP (`onboarding.tsx:375-384`), the copy currently tells the user to tap Resend — wrong remedy. Add an explicit **Retry** that re-fires the idempotent webhook with the session already held, keeping Resend for genuine OTP problems.

**Done when:**
- [ ] Cold-kill at any pre-account step resumes with all answers intact. *(draft module unit-tested; not yet exercised on a device)*
- [x] An under-18 user is blocked on screen 2, not screen 8.
- [x] The progress bar never overruns.
- [x] `npm run typecheck` and `npm test` clean.

---

# Issue B — Pre-signup carousel

**Branch:** `feat/issue-B-onboarding-carousel` · **Depends on:** nothing · **Files:** new `app/welcome.tsx`, `app/(tabs)/index.tsx:154`, `src/components/Mascot.tsx`

Today a cold install lands directly on an autofocused name field.

- [ ] Build `app/welcome.tsx` — three swipeable slides, mascot-led per `MASKOT.md`.
- [ ] Persisted "seen" flag so it shows once; route cold installs here before `/onboarding`.
- [ ] Review + finalise the draft copy below.

**Draft copy — for review, not final:**

| Slide | Headline | Sub |
|---|---|---|
| 1 | Every goal starts with a number | Tell Piggy what you're saving for. We'll turn it into a month-by-month plan you can actually keep. |
| 2 | No bank login. Ever. | Piggy never connects to your accounts. There's nothing to link, and nothing for anyone to steal. |
| 3 | A coach in your pocket | Streaks, missions, and an AI coach that knows your plan — so month three feels as good as day one. |

Slide 2 is the differentiator and is structurally true, not a policy promise. Reused verbatim later at the email step.

**Open risk to watch:** leading with "no bank connection" invites *"so it's a spreadsheet?"* — slide 3 is the counterweight and must not be dropped.

---

# Issue C — Trust & consent copy pass

**Branch:** `feat/issue-C-onboarding-trust-copy` · **Depends on:** A (touches the same screens) · **Files:** `app/onboarding.tsx`

- [ ] **Replace the legal wall.** `LegalLinksNote` (`onboarding.tsx:46-73`) drops five underlined legal links directly under the email field, at the single highest-anxiety moment. Replace with one trust line — *"We're asking for your email. Not your bank."* — plus a collapsed "Legal" expander holding all five links unchanged. No links removed, just not shouted.
- [ ] **Trust copy at the DOB step**, explaining why a savings app wants a birthdate (legal 18+ requirement, not profiling).
- [ ] **"Email me this plan"** — optional secondary action on Blueprint Review. Consented capture one screen earlier than today, from a self-selected high-intent slice; prefills the OTP step.
- [ ] Supporting n8n send-blueprint webhook. *(Cuttable without affecting the rest if we'd rather not add a backend surface now.)*

---

# Issue D — Push pre-permission step

**Branch:** `feat/issue-D-push-preprompt` · **Depends on:** A · **Files:** `app/onboarding.tsx`, `src/lib/notifications.ts`

- [ ] New step between Blueprint Review and the email step: custom priming screen ("we'll nudge you when your streak is on the line").
- [ ] Fire the native prompt via the existing `requestNotificationPermission()`; declining is non-blocking.
- [ ] Wire the result into `profile.notificationPrefs` so Settings reflects reality.

Rationale: post-value (the plan is already on screen), pre-friction (immediately before the email/OTP step, where abandonment concentrates), and it's the *only* channel that can reach a user who abandons before giving an email. iOS grants one shot at the native dialog, so the priming screen matters.

**Note:** `plugins/withoutPushEntitlement` strips `aps-environment` on purpose — this is local-notifications-only, which is all the retention engine in `notifications.ts` needs. No remote-push infrastructure is introduced here.

---

# Issue E — RevenueCat backend & product configuration

**Branch:** `feat/issue-E-revenuecat-backend` · **Depends on:** nothing (but blocks F, G) · **Files:** n8n workflows, Appwrite schema, `scripts/appwrite/setup.mjs`

### Blocking manual work — I cannot do these; they need your accounts

- [ ] Apple Developer paid-apps agreement + banking/tax complete.
- [ ] App Store Connect: one subscription group, three auto-renewable subscriptions (Beginner $5.99 / Medium $7.99 / Family $9.99), each with a **14-day free trial introductory offer**.
- [ ] Play Console: three subscriptions with matching base plans + 14-day free-trial offers.
- [ ] RevenueCat: project, both apps, entitlements/offerings configured, API keys issued.
- [ ] Hand over the RC public SDK keys and product identifiers.

### Work

- [ ] **New `CLAUDE_revenuecat_webhook`** — consume RC webhooks (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`), map to the existing state machine in `src/lib/subscription.ts` (already models `trialing`/`active`/`past_due`/`canceled` + full lockout), write the `subscriptions`/`entitlements` Appwrite rows.
- [ ] **Retire the Stripe rail** — archive `CLAUDE_billing_checkout`, `CLAUDE_billing_addon`, `CLAUDE_stripe_webhook`, `CLAUDE_billing_sync`.
- [ ] Keep `CLAUDE_entitlements_get` unchanged — it stays the app's single read path, so Appwrite remains the authority the app trusts.
- [ ] **Extra AI messages** ($2.99/msg, `extraMessagePriceUSD`) becomes a **consumable IAP** rather than a Stripe one-off; the webhook credits `addonMessageBalance` on purchase.
- [ ] **`CLAUDE_account_delete` change** — it currently cancels the Stripe subscription server-side. **Store subscriptions cannot be cancelled by us**; only the user can. Delete the account *and* tell the user plainly they must cancel themselves, with a deep link to the store's manage-subscriptions page. Real behavioural regression versus Stripe; needs its own copy.
- [ ] **Localized pricing** — stores handle pricing/tax natively (the Stripe rail did USD/PLN/HUF via Stripe Tax). Displayed prices must come from RC's fetched offerings, never the hardcoded `priceUSD` in `entitlements.ts`.

---

# Issue F — App-side billing swap

**Branch:** `feat/issue-F-revenuecat-client` · **Depends on:** E · **Files:** `src/lib/billing.ts`, `src/lib/entitlements.ts`, `src/lib/store.ts`, `app/plans.tsx`, `src/components/UpgradeModal.tsx`

- [ ] **Add `react-native-purchases`**; init in `app/_layout.tsx`, `Purchases.logIn(appwriteUserId)` so the RC app-user-id is the Appwrite `$id` — the key everything else is already on. Requires a dev build; not Expo Go (already the case here).
- [ ] **Rewrite `billing.ts`** — replace the Stripe-URL + `Linking` handoff in `startCheckout`/`startAddonCheckout` with `Purchases.purchasePackage` / `restorePurchases`. Keep the typed-result convention (`{status}`, never throw) so call sites in `plans.tsx`, `goals.tsx:518`, `coach.tsx:146`, `index.tsx:84` change minimally.
- [ ] **Rename `plan: 'free'` → `'beginner'`.** A plan id named `free` that costs $5.99 will cause a mistake next to an RC product identifier — and the backend *already* uses `beginner` (`effective_plan_id`), so this closes an existing client/server mismatch.
- [ ] Zustand `persist` merge migration for installed apps, following the pattern already used for `accountState`.
- [ ] **Fix `trialDays`** — currently client config with only Family = 7 (`entitlements.ts:80/99/125`). Stores own trial config now, so the field becomes descriptive (14 across the board).
- [ ] Add `trialEndsAt` to the profile; extend `PlanStatus` to cover the `past_due`/grace case `subscription.ts` already models.
- [ ] **`plans.tsx` reads live RC offerings** for prices/localization instead of `priceUSD`.
- [ ] **Add "Restore Purchases"** — required by App Store review, and needed by any reinstalling user.
- [ ] `npm run typecheck` + `npm test` clean; verify on a real dev build (RC does not work in Expo Go).

### Constraint to design copy around

Apple grants **one introductory offer per subscription group per Apple ID** (Play is equivalent). "14 days free on every plan" is only true for the *first* plan a user trials. Copy must say **"your 14-day free trial"**; see the open decision on mid-trial upgrades.

---

# Issue G — Onboarding paywall + trial lifecycle

**Branch:** `feat/issue-G-onboarding-paywall` · **Depends on:** F · **Files:** `src/lib/authLock.ts`, `src/components/auth/AuthGate.tsx`, new `src/components/auth/PlanGate.tsx`, `app/onboarding.tsx`, `src/lib/notifications.ts`

- [ ] **New lock status `needs_plan`** in the `authLock` machine, ordered **after login, before `needs_pin_setup`** (satisfies D5). `AuthGate` renders `PlanGate` for it. Putting it in the state machine rather than in onboarding means the *same* gate serves the day-15 lockout — one screen, both jobs.
- [ ] **Build `PlanGate`** — three plan cards + transparent trial-timeline block (report §7.1):
      *Today — full access, free · Day 12 — we'll remind you · Day 15 — $X/mo begins*
- [ ] Restore Purchases + store-managed-cancellation note on the paywall (App Store review requirement).
- [ ] Confirm **day-15 auto-charge needs no custom logic** — it's default IAP behaviour; we simply must not offer an in-app cancel.
- [ ] **Lockout state.** With no free tier, `canceled`/`expired` has nowhere to fall back to, so `PlanGate` doubles as the lockout screen with different copy. `subscription.ts` already zeroes entitlements and sets `locked`; this gives it a UI. Data is never deleted (constraint C4 holds).
- [ ] **Trial-ending notification** — `_layout.tsx:42` already routes a `trial-ending` notification to `/plans`; schedule it at day 12 off `trialEndsAt` and repoint it at `PlanGate`.
- [ ] **Onboarding hand-off** — `onboarding.tsx:1016-1034` currently calls `onLoggedIn()` straight into PIN setup. Transition into `needs_plan` first; move the Success screen and confetti to *after* PIN creation so the celebration lands on a genuinely finished account.
- [ ] Verify bootstrap routes a user who abandoned at the paywall (real account, no PIN) back to `needs_plan` cleanly rather than stranding them.

### Risks on the record

- **A hard wall with no skip means any store/RC outage blocks 100% of new signups.** Mitigation is robust retry + restore + honest error states; there is no free-tier fallback by design. See the open decision above.
- **A user who abandons at the paywall has a real Appwrite account and no PIN** — covered by the bootstrap check above.
- **App Store review** requires visible trial terms, price, and Restore on the paywall — all included, but a common rejection cause.

---

## Sequencing

```
A ──► C ──► D          (ship independently, no billing dependency)
B                      (independent)
E ──► F ──► G          (billing chain; E gated on your store/RC setup)
```

A/B/C/D can ship and be validated while the store products are still in review.

## Not in scope

Behaviour-triggered lifecycle messaging beyond the day-12 trial reminder, post-close discount offers (report §7.4), self-segmentation/attribution questions (§2.2), and demo mode (§1.3). All viable later; none belong in this batch.
