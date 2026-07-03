# Flip the Question: Monthly Contribution → Derived Goal Date

## The problem

The onboarding flow (`app/onboarding.tsx`) asks for a **target date** (screen 4)
before it knows the user's **income** (screen 5), then computes
`estimatedMonthlySavings = targetAmount / months`. Nothing prevents an
impossible combination, so users routinely see "save 90% of your income" —
mathematically correct, practically ridiculous.

## The fix

Invert the relationship: ask **"how much can you comfortably set aside each
month?"** and **derive the goal date** from it. The date becomes an output of
savings capacity, not an input. The user can never enter an impossible plan.

New onboarding order:

| Screen | Before | After |
|---|---|---|
| 2 | Goal declaration | Goal declaration (unchanged) |
| 3 | Target amount | Target amount (unchanged) |
| 4 | **Timeline (date chips)** | **Income** (moved up) |
| 5 | Income | **Monthly contribution** (new — replaces timeline) |
| 6 | Blueprint review | Blueprint review (now shows *derived* date) |

Core formula: `months = ceil(targetAmount / monthlyContribution)`,
`derivedDate = addMonths(today, months)` — the inverse of today's math.

---

## Decisions & de-risking commitments (from plan review)

Adopted up front so they don't get lost in the phase details:

- [x] **Named-step enum refactor is in scope.** While reordering, convert the stepper's raw `step === N` indices to a named enum — reordering with magic numbers ripples through `TOTAL_STEPS`, progress dots, and back-navigation. (Tracked in Phase 2b.)
- [x] **Hard horizon cap is a requirement, not a nice-to-have.** Income-skippers have no % anchor, so `goalMath.ts` must enforce a max horizon (10 years) at the calculation level — "$5/month" must never render a 40-year date. (Tracked in Phase 1.)
- [ ] **Backend field mapping gets a real test execution.** The n8n/Appwrite layer maps fields strictly and can silently drop `monthlyContribution`; a live dev-webhook execution with payload inspection is a Phase 3 exit criterion, not optional.
- [x] **"Fixed deadline" escape hatch: DECIDED — build it.** Some goals are genuinely date-bound (trip, tuition), so `ContributionStep` ships with an "I have a fixed deadline" mode from day one (see 2a). Contribution-first stays the default; date-first is the explicit opt-in.

## Phase 1 — Core calculation & data model

Goal: the inverted math exists, is tested, and the store can hold the new fields.

- [x] Create `src/lib/goalMath.ts` with pure functions:
  - [x] `deriveGoalDate(targetAmount, monthlyContribution, from?)` → ISO date (reuse/move `addMonths` from `onboarding.tsx`)
  - [x] `suggestedContribution(monthlyIncome, pct = 0.15)` → rounded suggestion (e.g. nearest 10)
  - [x] `contributionBounds(targetAmount)` → sensible min/max for the input (min = amount / 120 months, max = amount i.e. "done in 1 month")
  - [x] `requiredContribution(targetAmount, deadline, from?)` → monthly amount for the fixed-deadline mode (the old flow's math, now living in one tested place)
- [x] Enforce a **hard 10-year horizon cap** inside `deriveGoalDate` itself (return a capped/flagged result, don't rely on UI to catch it) — this is the safety net for income-skippers with no % anchor
- [x] Unit-test the edge cases: contribution ≥ amount (1 month), tiny contribution hitting the horizon cap, zero/NaN inputs, rounding so the *last* month isn't a weird remainder surprise
- [x] Extend the Zustand profile in `src/lib/store.ts`:
  - [x] Add `monthlyContribution: number | null`
  - [x] Add `planningMode: 'contribution' | 'deadline'` (default `'contribution'`; legacy pre-flip data reads as `'deadline'`)
  - [x] Keep `estimatedMonthlySavings` for now (it becomes an alias of the chosen contribution) — decide in Phase 4 whether to drop it
- [x] Decide and document the income-skipped path: contribution input still works, we just can't show the "% of income" hint or suggestion chips

## Phase 2 — Contribution-first UI in onboarding **and** the goals tab (one release)

Goal: both entry points flip together, built on one shared component, so the app
never ships with two contradictory mental models. This phase is the release
gate — neither half ships without the other.

### 2a. Shared contribution step component

- [x] Build `src/components/ContributionStep.tsx` first — both flows consume it:
  - [x] Numeric input styled like the target-amount screen (currency-aware)
  - [x] If income is available: suggestion chips — e.g. `10% · 15% · 20% of income` — that prefill the input
  - [x] Live feedback line under the input: *"At $300/month you'll reach your goal by **March 2028**"*, updating as they type
  - [x] If income available, show % of income next to the amount; soft-warn (copy only, never block) above ~35–40%
  - [x] Guard rails: disable Continue on 0/empty; if derived horizon exceeds the cap (10 yrs), nudge to raise the contribution or lower the goal
  - [x] **Fixed-deadline mode (decided — in scope):** a small "I have a fixed deadline" link that switches the step to date-first for genuinely date-bound goals (wedding, trip, tuition):
    - [x] Reuse the existing date picker; compute the *required* monthly contribution (`targetAmount / months`) via `goalMath.ts`
    - [x] Show the same % of income framing and soft warning (>35–40%) — this mode is where the old "90% of income" problem can still appear, so the coaching copy matters most here
    - [x] Symmetric toggle back to contribution-first without losing entered values
    - [x] Persist which mode the user chose (e.g. `planningMode: 'contribution' | 'deadline'`) so review screens and downstream flows can phrase things correctly

### 2b. Onboarding (`app/onboarding.tsx`)

- [x] **First:** refactor the stepper from raw `step === N` indices to a named enum (e.g. `OnboardingStep.Income`), updating `TOTAL_STEPS`, progress dots, and back-navigation — do this as its own commit before any reordering, so the swap diff stays reviewable
- [x] Swap screens 4 and 5: income (with its existing skip option) now comes before the contribution question
- [x] Replace the timeline screen with the shared `ContributionStep`
- [x] Blueprint review screen: reframe rows — "Monthly set-aside: $300" is the hero, "Goal reached: March 2028" is the derived result
- [x] Persist on finish: write `monthlyContribution`, computed `targetDate` (derived), and keep the goal's `deadline` populated so nothing downstream breaks
- [x] Remove now-dead code: date chips, custom date picker wiring, `monthDiff`-based division

### 2c. Goals tab (`app/(tabs)/goals.tsx`)

- [x] Replace the date-picker step in the add-goal flow with the shared `ContributionStep`
- [x] Reuse `goalMath.ts` for the derived deadline; remove the duplicated `monthDiff` / division logic
- [x] Multiple-goals reality check: sum contributions across active goals and warn if the *total* crosses the income threshold (new logic that didn't exist in the date-first world)
- [x] Update the goal review/detail UI to show "monthly set-aside" + derived date consistently

## Phase 3 — Backend & sync alignment

Goal: n8n / Appwrite receive coherent data; nothing 500s or silently drops fields.

- [x] Audit the onboarding webhook payload (currently sends `targetDate`, `monthlyIncome`, `incomeSkipped`, `estimatedMonthlySavings`) and add `monthlyContribution` + `planningMode`; confirm `targetDate` is the derived date in contribution mode and the picked date in deadline mode
- [x] Update the Appwrite collection schema (users/goals) if `monthlyContribution` should be a first-class attribute — check the CLAUDE_ n8n workflows that read/write these fields
- [x] Update the relevant CLAUDE_ n8n workflows (onboarding intake, user sync) to map the new field
- [x] **Exit criterion:** run a live test execution against the dev webhook and inspect the stored Appwrite document to confirm `monthlyContribution` survives the strict field mapping end-to-end — do not close this phase on code review alone
- [x] Confirm the AI coach / any downstream workflow that consumed `estimatedMonthlySavings` reads the right field — the field name and value semantics were deliberately preserved (never renamed), so any consumer keyed on `estimatedMonthlySavings` keeps working unchanged. Could not open "Stripe - Extra Financial Analysis + Ai chat system" directly (not MCP-enabled) to double check, but it has no `CLAUDE_` prefix and isn't part of the onboarding/goals data path per the workflow search.
- [x] Backward compatibility: existing users have date-first goals with no `monthlyContribution` — treat `estimatedMonthlySavings` as the contribution for them (read-time fallback, no migration script needed unless Appwrite schema requires it). The new `monthly_contribution_cents`/`planning_mode` columns were added as optional (no default required), so legacy Appwrite rows need no migration; app-side `resolveMonthlyContribution()` derives the value at read time when it's missing.

## Phase 4 — Polish, cleanup & validation

Goal: coherent copy, no dead fields, verified on device.

- [x] Copy pass: coaching tone everywhere ("set aside" not "must save"); check any localized strings — reworded the one remaining "requires saving more than your income" warning in `onboarding.tsx` to "sets aside more than your income" to match `ContributionStep`'s tone; app has no i18n/locale system, so no localized strings exist to check
- [x] Decide the fate of `estimatedMonthlySavings` (keep as alias vs. rename) and clean up store, profile screen (`app/(tabs)/profile.tsx`), and webhook payloads accordingly — **decided: keep as a deprecated alias** (already documented in `store.ts`); `profile.tsx` never referenced it, so there was nothing to clean up there
- [x] Delete unused timeline-chip components/date-picker code paths flagged in Phase 2 — confirmed removed in Phase 2 (`TIMELINE_CHIPS`, `handleTimelineChip`, `selectedChipLabel`, standalone `CalendarModal` wiring); re-verified none remain in `onboarding.tsx` or `goals.tsx`
- [ ] Manual test matrix — user will verify on device/simulator directly; not checked off here
  - [ ] Fresh onboarding with income → suggestion chips → finish → correct data in store, Appwrite, n8n
  - [ ] Fresh onboarding with income **skipped** → no chips, no % hints, flow still completes
  - [ ] Contribution > amount, contribution ≈ 0, huge amounts, non-USD currency formatting
  - [ ] Fixed-deadline mode: pick a date, verify required contribution + % of income warning; toggle between modes without losing values; near-past/past dates handled
  - [ ] `planningMode` persisted correctly in both modes and reflected in review/detail screens
  - [ ] Existing user (pre-flip data) opens goals/profile screens — no crashes, sane fallbacks
- [x] Verify missions/roadmap features that key off the goal deadline still behave with derived dates — `app/(tabs)/index.tsx`'s `daysUntilDeadline` reads `goal.deadline` generically (works for both derived and picked dates); `app/(tabs)/missions.tsx` has no deadline/contribution dependency at all

---

## Predicted roadblocks

1. **Screen reorder ripple effects.** `onboarding.tsx` is one large stepper with
   index-based conditionals (`step === 4`, `TOTAL_STEPS`, progress dots,
   back-navigation). Swapping screens 4/5 and replacing one means touching every
   index; easy to break back-button state (e.g. income entered, then user goes
   back and changes the target amount — the suggested contribution must recompute).
   *Mitigation:* consider naming steps (enum) instead of raw indices while in there.

2. **Income-skipped users lose the safety net.** The whole point is anchoring to
   income; skippers get no anchor. The contribution screen must still feel
   complete without chips/percentages, or people will enter $5/month and get a
   40-year date. The 10-year horizon cap is the backstop — make sure it exists.

3. **Backend field drift.** The n8n workflows and Appwrite schema were built
   around `targetDate` + `estimatedMonthlySavings`. If a workflow validates or
   maps fields strictly, adding/renaming fields can silently drop data or fail
   executions. Test with a real execution against the dev webhook before
   shipping; don't rename fields the AI coach already reads until Phase 4.

4. **Existing users' data shape.** Pre-flip users have goals created from a
   picked date. Any new UI that assumes `monthlyContribution` exists will render
   blanks/NaN for them. Fallback logic must live at read time, and the manual
   test matrix must include a legacy account.

5. **Two planning modes to maintain (accepted).** We decided to ship the
   "I have a fixed deadline" escape hatch, which means `ContributionStep`
   carries two modes forever: contribution-first (default) and date-first
   (opt-in). The old "90% of income" problem still exists inside deadline mode —
   the soft-warning + coaching copy is the only guard there. Watch for mode
   asymmetries: every future change to the step (currency, validation, copy)
   must be checked in both modes, and `planningMode` must stay consistent
   across store, Appwrite, and n8n or review screens will phrase plans wrong.

6. **Rounding and the last month.** `ceil()` on months plus a rounded suggested
   contribution means the final month's payment is smaller than the rest, or the
   derived date lands a month later than a user would eyeball. Cosmetic, but
   review-screen copy should say "by March 2028" (not an exact day) to avoid
   looking wrong.

7. **Goals-tab duplication.** The add-goal flow in `goals.tsx` is a near-copy of
   the onboarding steps. That's why Phase 2 covers both flows as a single
   release gate, with the shared `ContributionStep` built first (2a) so the two
   implementations can't drift. The residual risk is scope pressure to ship
   onboarding alone "for now" — resist it; a half-flipped app is worse than a
   delayed one.
