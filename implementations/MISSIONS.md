# Missions v2: Catalog, Rotation, Verification & Tiers

> **Tracking:** epic [#69](https://github.com/Koin-App-Official/pignify/issues/69)
> · Phase 0 [#63](https://github.com/Koin-App-Official/pignify/issues/63) (bug, blocker)
> · Phase 1 [#64](https://github.com/Koin-App-Official/pignify/issues/64)
> · Phase 2 [#65](https://github.com/Koin-App-Official/pignify/issues/65)
> · Phase 3 [#66](https://github.com/Koin-App-Official/pignify/issues/66)
> · Phase 4 [#67](https://github.com/Koin-App-Official/pignify/issues/67)
> · Phase 5 [#68](https://github.com/Koin-App-Official/pignify/issues/68)

## The problem

`DEFAULT_MISSIONS` ([store.ts:197](src/lib/store.ts:197)) is six hardcoded rows —
four daily, two weekly — and [missions.tsx](app/(tabs)/missions.tsx) renders all
six at once. `checkAndResetMissions` only flips `completed` back to `false` on a
day/Monday boundary, so **every user sees the same six missions forever**. There
is no library, no rotation, no difficulty curve, and no verification.

Three structural limits:

1. **Completion is an unverified checkbox.** `completeMission` → `addXP` with
   zero checks — even for "Save $5 today", where the deposit data needed to
   verify it already lives in `goals[].deposits`.
2. **The array is both catalog and per-period state.** Adding 40 missions to
   `Mission[]` means rendering 40 cards. The two concerns have to split.
3. **Amounts are hardcoded `$`.** The app supports ~15 currencies
   ([store.ts CURRENCIES](src/lib/store.ts)), so "Save $5 today" is wrong for
   every non-USD user. Expanding the list multiplies the bug.

## The fix

Split the one array into **a static catalog** (`MISSION_CATALOG`, ~35–45 defs,
each tagged category/cadence/tier and carrying a `verify` predicate) and
**per-period assignments** (`activeMissions`, the 3 daily + 1 weekly actually
live right now, chosen by deterministic rotation).

Amounts stop being literals and become **derived from the user's own
`monthlyContribution`** — which makes them currency-correct and personalized in
one move, instead of needing a per-currency lookup table.

| | Before | After |
|---|---|---|
| Source of missions | 6-item `Mission[]` | `MISSION_CATALOG` (static) + `activeMissions` (state) |
| Shown at once | all 6 | 3 daily + 1 weekly |
| Rotation | none | deterministic per period, excludes recent |
| Difficulty | flat | tier 1/2/3, gated on `level`/`streak` |
| Completion | tap, always | verified from store data where possible |
| Amounts | `"$5"` in the title | derived from `monthlyContribution`, rendered via `formatCurrency` |

---

## Decisions & commitments (from the brainstorm)

Adopted up front so they don't get relitigated mid-phase:

- [ ] **Class A (auto-verified) missions are the backbone.** The report this
  plan derives from is written for bank-linked apps (Chime/Cleo/Plum). Piggy is
  manual-entry only, so missions sort into three classes — see below. Today's
  set is almost entirely Class B, which is why it feels hollow: the app knows
  nothing about whether the user actually did it.
- [ ] **Tap-to-claim, not auto-complete.** Verified missions unlock the claim
  button when their predicate passes, but the user still taps. Keeps the
  existing `SkiaConfetti`/`useCelebrate` payoff and preserves agency.
- [ ] **Missions and achievements stay separated.** Missions = repeatable,
  resettable actions. Achievements = one-time lifetime milestones. The source
  report's "streak/milestone/big swing" category is already the Badges tab —
  do not duplicate it into the catalog.
- [ ] **No cash, no draws, no investing.** Rewards remain XP-only. That keeps
  the whole prize-linked-savings / sweepstakes / SEC-gamification surface out of
  scope. The one external rule worth adopting verbatim is Chime's: **no mission
  may ever require spending money or hitting a minimum spend.** Phase 1 exit
  criterion is auditing the catalog against that line.
- [ ] **Gate personalization, not missions.** Missions are the habit loop and
  stay fully available on `free`. If missions become a plan lever later, the
  paid perk is coach-picked/personalized selection (Phase 5), never access.
- [ ] **Debt, investing, social/referral, round-ups, payday split, 52-week
  ladder and weather-triggered saves are OUT.** Each needs either a bank link,
  automated transfers, or a whole new data model. They are feature requests
  wearing mission costumes; do not smuggle them in as catalog rows.

### Verification classes

| Class | How it's checked | Examples |
|---|---|---|
| **A — auto-verified** | Predicate over `goals[].deposits`, `profile.expenses`, `streak`, `goals` | Save X today · Log an expense · 7-day streak · Create a goal · Beat last week's spending |
| **B — manual** | User taps, honor system | Skip a coffee · Cook at home · Cancel a subscription · Negotiate a bill |
| **C — impossible today** | Needs bank data or a feature that doesn't exist | Round-ups · Payday split · Category caps on real spend · Debt payoff |

Class B is legitimate but must stay a **minority of any surfaced set** — an
un-checkable checkbox teaches users the XP is meaningless. Target ≤1 manual
mission in the 3 daily slots.

---

## Phase 0 — Fix the deposit date bug (BLOCKER) — #63

Goal: the data every Class A predicate reads is actually correct. **Nothing in
Phase 1+ works until this lands.**

`addDeposit` ([goals.tsx:185](app/(tabs)/goals.tsx:185)) writes
`{ date: new Date().toISOString(), amount }` — a full timestamp
(`2026-08-15T14:32:11.000Z`). But `sumDepositsForDate`
([store.ts:403](src/lib/store.ts:403)) matches with `d.date === dateStr` where
`dateStr` is `YYYY-MM-DD`. **That equality can never be true.**

Live consequences today, all pre-existing:

- `checkAndUpdateStreak` ([store.ts](src/lib/store.ts)) takes the `else` branch
  every single day for any user with `target > 0` → **`streak` is permanently
  reset to 0** and `checkinIgnoredStreak` climbs forever, skewing the reminder
  decay logic in `buildAndRefreshSchedule`.
- `targetMet` is always `false` → streak-protection notifications fire at users
  who *did* save.
- "Saved today" on the home screen ([index.tsx:119](app/(tabs)/index.tsx:119))
  always renders 0.
- `sumDepositsSince` and the `startsWith(thisMonth)` check at
  [index.tsx:123](app/(tabs)/index.tsx:123) happen to still work, because `>=`
  and `startsWith` are prefix-safe against a full ISO string. Only the exact-equality
  reads are broken — which is why this has gone unnoticed.

Steps:

- [ ] Decide the canonical shape: `deposits[].date` is a **calendar day string
  (`YYYY-MM-DD`)**, consistent with `Expense.date`, `lastActiveDate`, and
  `lastStreakCheckDate`. Document it on the `Goal` interface.
- [ ] Fix the write path at [goals.tsx:185](app/(tabs)/goals.tsx:185) to store
  `new Date().toISOString().split('T')[0]`.
- [ ] Add a persist migration that normalizes existing `deposits[].date` values
  (`date.split('T')[0]`) — folded into the same `version: 1` migration as
  Phase 2, so there is only one migration to review.
- [ ] Harden the readers: make `sumDepositsForDate` compare on a normalized
  prefix (`d.date.slice(0, 10) === dateStr`) so a stray timestamp from any
  future write path can't silently re-break the streak.
- [ ] Apply the same normalization at
  [index.tsx:119](app/(tabs)/index.tsx:119).
- [ ] Unit-test `sumDepositsForDate` against both shapes, and add a
  `checkAndUpdateStreak` test proving the streak *increments* when a deposit
  meets the target (this is the regression test that would have caught it).
- [ ] Sanity-check the blast radius of the fix: users whose streak was silently
  pinned at 0 will start accruing from the fix date. That's the correct
  behavior — no back-fill, but note it in the release notes.

---

## Phase 1 — Catalog, types & pure selection/verification lib — #64

Goal: the whole missions engine exists as pure, tested functions with no store
or React coupling.

- [ ] Create `src/lib/missions.ts` with the core types:
  - [ ] `MissionCategory = 'saving' | 'habit' | 'spending' | 'planning' | 'learning'`
  - [ ] `MissionCadence = 'daily' | 'weekly'`, `MissionTier = 1 | 2 | 3`
  - [ ] `MissionContext` — the derived read-model built once per evaluation:
        `{ today, weekStart, goals, profile, depositsToday, depositsThisWeek, expensesToday, expensesThisWeek, expensesLastWeek, dailyTarget, currency }`
  - [ ] `MissionDef` — `{ id, titleTemplate, description, category, cadence, tier, reward, amount?, verify, eligible? }`
  - [ ] `MissionVerifier = 'manual' | ((ctx: MissionContext) => boolean)`
- [ ] Build the context: `buildMissionContext(state)` — reuses the existing
  `getWeekMondayString`, `getDailySavingsTarget`, `sumDepositsForDate`,
  `sumDepositsSince` helpers rather than reimplementing them. Export the ones
  currently module-private.
- [ ] Currency-correct amounts:
  - [ ] `amount?: (ctx) => number` on the def; titles carry an `{amount}`
        placeholder rendered through the existing
        [`formatCurrency`](src/lib/store.ts:756).
  - [ ] Size amounts off `dailyTarget` (derived from `monthlyContribution`), so
        they're personalized *and* currency-neutral by construction.
  - [ ] Fallback ladder for users with **no goal or skipped income** (where
        `dailyTarget === 0`): a minimal per-currency `MICRO_AMOUNT` table. This
        is the one place a currency table is unavoidable — keep it to one small
        constant, not per-mission.
  - [ ] Round amounts to something human (nearest 1 / 5 / 10 by magnitude), never
        `save 3.67`.
- [ ] Eligibility gating via `eligible?(ctx)` — never surface a mission the user
  physically cannot do:
  - [ ] Deposit missions require ≥1 non-archived goal.
  - [ ] "Create your first goal" requires **zero** goals.
  - [ ] "Beat last week's spending" requires ≥1 logged expense last week.
- [ ] Tier resolution: `getTier(profile): MissionTier`
  - [ ] Tier 2 at `level >= 2 || streak >= 7`; Tier 3 at `level >= 5 || streak >= 21`.
  - [ ] **Performance-gated, not calendar-gated** — matches the progression model
        in the source report and reuses fields that already exist. No new
        persisted field required.
- [ ] Selection: `selectMissions(ctx, { cadence, count, recentIds })`
  - [ ] Deterministic — seeded on the `periodKey` so the set is stable across
        app restarts, backgrounding, and re-renders within the same day.
  - [ ] Draws from tiers `<= getTier(profile)`, weighted toward the current tier
        so lower-tier wins stay in the mix (guaranteed-win floor).
  - [ ] Excludes `recentIds` (last ~10 assigned) to avoid immediate repeats.
  - [ ] Caps manual (Class B) at 1 of the 3 daily slots.
  - [ ] Degrades gracefully: if filters leave fewer than `count` eligible defs,
        fall back to any-tier eligible, then to a hardcoded safe default. **The
        screen must never render an empty mission list.**
- [ ] Write the catalog (see the table below). Start at ~35 defs; the shape
  matters more than the count.
- [ ] Unit-test in `src/lib/missions.test.ts` (mirrors the existing
  `goalMath.test.ts` convention):
  - [ ] Same seed + same period → identical selection; different period → different.
  - [ ] Tier gating: a level-1 user never draws a tier-3 def.
  - [ ] Eligibility: no deposit missions when the user has no goals.
  - [ ] Amount derivation for a zero-target user hits the `MICRO_AMOUNT` path.
  - [ ] Every verifier is total — no throw on empty `goals`/`expenses`.
- [ ] **Compliance audit**: walk every catalog row against "no mission requires
  spending money or a minimum spend." This is a Phase 1 exit criterion.

### Catalog spec

`✱` = exists today. **V** = Class A verified, **M** = Class B manual.

**Tier 1 — build the habit, guarantee wins**

| Cadence | Mission | Cat | ✓ | Verifier |
|---|---|---|---|---|
| daily | Save {amount} today | saving | V | `depositsToday >= amount` |
| daily | Hit today's target | saving | V | `depositsToday >= dailyTarget` |
| daily | Log an expense | habit | V | `expensesToday.length >= 1` |
| daily | Check in | habit | V | auto-true on app open (`recordActivity`) |
| daily | Skip a coffee ✱ | spending | M | — |
| daily | No-spend lunch ✱ | spending | M | — |
| daily | Walk instead of ride ✱ | spending | M | — |
| daily | Cook dinner at home | spending | M | — |
| weekly | Save {amount} this week ✱ | saving | V | `depositsThisWeek >= amount` |
| weekly | Set up your first goal | planning | V | `goals.length >= 1` |
| weekly | Log 5 expenses this week | habit | V | `expensesThisWeek.length >= 5` |
| weekly | No-spend weekend | spending | M | — |

**Tier 2 — consistency & first real behavior change**

| Cadence | Mission | Cat | ✓ | Verifier |
|---|---|---|---|---|
| daily | Save 1.5× today's target | saving | V | `depositsToday >= dailyTarget * 1.5` |
| daily | Log every expense today | habit | V | `expensesToday.length >= 3` |
| daily | Add a note to an expense | habit | V | any `expensesToday` with `note` |
| daily | Save what you almost bought | saving | M | — |
| daily | Today's money quiz | learning | V | Phase 4 |
| weekly | Beat last week's spending | planning | V | `sum(expensesThisWeek) < sum(expensesLastWeek)` |
| weekly | Dine-out detox | spending | M | hint: shows food-category total |
| weekly | Cancel a subscription ✱ | spending | M | — |
| weekly | Hit a 7-day streak | habit | V | `profile.streak >= 7` |
| weekly | Save 20% over your weekly target | saving | V | `depositsThisWeek >= target * 1.2` |

**Tier 3 — stretch**

| Cadence | Mission | Cat | ✓ | Verifier |
|---|---|---|---|---|
| daily | Save 2× today's target | saving | V | `depositsToday >= dailyTarget * 2` |
| daily | Two deposits today | saving | V | ≥2 deposit entries dated today |
| daily | Pantry day — cook from what you have | spending | M | — |
| weekly | Push your goal to the next 10% | saving | V | crosses a 10% band of `savedAmount/targetAmount` |
| weekly | Hit a 30-day streak | habit | V | `profile.streak >= 30` |
| weekly | Review next month's contribution | planning | V | `monthlyContribution` changed this week |
| weekly | Add a second goal | planning | V | `goals.filter(!archived).length >= 2` |
| weekly | Negotiate or downgrade a bill | spending | M | — |

Note the deliberate overlap with existing XP awards: `addDeposit` already grants
+10 XP ([goals.tsx](app/(tabs)/goals.tsx)) and goal creation +20. A saving
mission therefore double-dips. That's acceptable (both reward the same good
behavior) but see the Phase 3 XP calibration step.

---

## Phase 2 — Store integration — #65

Goal: rotation, claiming and persistence work; legacy data migrates cleanly.

- [ ] Replace the `Mission` interface's dual role:
  - [ ] Keep `MissionDef` in `missions.ts` (static, never persisted).
  - [ ] Add `ActiveMission { defId, cadence, periodKey, claimed, claimedAt? }`
        to the store — this is the only thing that persists.
- [ ] State changes in `PiggyState`:
  - [ ] `activeMissions: ActiveMission[]` replaces `missions: Mission[]`
  - [ ] `recentMissionIds: string[]` (capped at ~10, FIFO) for repeat-avoidance
  - [ ] `profile.missionsCompletedTotal: number` — lifetime counter
  - [ ] Remove `missions` from state and from `resetForDemo`
        ([store.ts:735](src/lib/store.ts:735))
- [ ] Rewrite `checkAndResetMissions` → `refreshActiveMissions()`:
  - [ ] On a day boundary, re-roll the 3 daily slots; on a Monday boundary,
        re-roll the weekly slot. Keep the existing `lastDailyReset` /
        `lastWeeklyReset` + `getWeekMondayString` machinery — it's correct and
        already UTC-safe.
  - [ ] Push replaced `defId`s into `recentMissionIds`.
  - [ ] Must be idempotent — safe to call on every app focus.
- [ ] Rewrite `completeMission(id)` → `claimMission(defId)`:
  - [ ] Re-run the verifier server-of-truth-style **inside the action**, not just
        in the UI, so a stale button can't grant XP for an unmet mission.
  - [ ] Increment `profile.missionsCompletedTotal`.
  - [ ] Move the `a4` "Mission Master" unlock here from
        [missions.tsx:46](app/(tabs)/missions.tsx:46). **This fixes a live bug**:
        a4 currently counts *currently-completed* missions, so it requires 5 of 6
        within a single period rather than 5 lifetime.
- [ ] Persist migration — the config at
      [store.ts:743](src/lib/store.ts:743) has **no `version` and no `migrate`**,
      so persisted state is merged raw and a stale `missions` array would survive:
  - [ ] Add `version: 1` and a `migrate(persisted, from)`.
  - [ ] Drop the legacy `missions` key; seed `activeMissions: []` and let
        `refreshActiveMissions()` populate on next launch.
  - [ ] Normalize `goals[].deposits[].date` to `YYYY-MM-DD` (Phase 0).
  - [ ] Backfill `profile.missionsCompletedTotal` to 0 and `recentMissionIds` to `[]`.
  - [ ] Test the migration against a real pre-v1 AsyncStorage payload, not a
        hand-written fixture.
- [ ] Verify no other call sites break: `grep` for `missions`, `completeMission`,
      `checkAndResetMissions`, `setMissions` across `app/` and `src/`.

---

## Phase 3 — UI — #66

Goal: 3 daily + 1 weekly, with the verified/manual distinction legible.

- [ ] Rework [missions.tsx](app/(tabs)/missions.tsx) to render `activeMissions`
      resolved against the catalog, not a raw array.
- [ ] Card states — the checkbox is no longer always tappable:
  - [ ] **Locked** (verified, predicate false): circle disabled, subtitle shows
        live progress ("$3 of $5 saved today").
  - [ ] **Ready** (verified, predicate true): circle pulses/highlights, tap to
        claim → existing `celebrate()` confetti.
  - [ ] **Manual**: tappable immediately, visually distinguished (e.g. a subtle
        "on your honor" affordance) so users learn which are real checks.
  - [ ] **Claimed**: current completed styling, unchanged.
- [ ] Show a per-mission progress bar for quantitative verifiers, reusing
      `AnimatedProgressBar`. This is where the endowed-progress effect from the
      report actually applies.
- [ ] Surface the tier as a small badge on the header card next to `Saver Lv.{level}`,
      so progression is visible.
- [ ] Update the header counter — `{completedCount}/{missions.length}` becomes
      claimed-of-4, not of the whole catalog.
- [ ] Empty/degenerate states: no goal yet → the weekly slot shows "Set up your
      first goal"; verify nothing renders a blank list.
- [ ] Keep the existing `FadeInStagger` / `PressableScale` / `ScreenTransition`
      choreography intact — per [ANIMATION_GUIDE.md](guides/ANIMATION_GUIDE.md).
- [ ] **XP calibration pass**: with 3 daily + 1 weekly at current reward values
      (~3–20 XP), plus +10/deposit and +20/goal, re-check the pace of
      `level = xp/100`. Decide whether tier 2/3 missions pay more, and whether
      leveling should slow at higher tiers.
- [ ] Self-verify visually on device (per project convention — no simulator
      screenshots needed from me).

---

## Phase 4 — Learning pack & planning missions — #67

Goal: fill the two categories the app has no content for yet.

- [ ] **Learning missions ship as a local content pack**, not through the AI
      coach: no n8n quota burn, works offline, deterministic. `src/lib/lessons.ts`
      with ~15 Q&A items (emergency fund, APY, needs vs wants, 50/30/20).
- [ ] Minimal quiz UI — one question, 3 options, immediate feedback. A modal in
      the missions screen, not a new tab.
- [ ] Store `lessonsCompleted: string[]` so the same question isn't re-asked, and
      wire the `learning` verifier to it.
- [ ] **Planning missions** need a monthly budget concept to go further than the
      catalog above. Decide explicitly whether to add
      `profile.monthlyBudget: number | null` or defer the category. If deferred,
      cut the budget-dependent rows rather than leaving them unverifiable.
- [ ] Subscription-audit missions stay Class B **unless** a subscriptions list
      feature is built. Decide, don't drift.

---

## Phase 5 — Personalization (optional, decide later) — #68

Goal: coach-picked missions as the paid perk.

- [ ] Weight selection by the user's own data (heaviest expense category,
      deposit cadence, weakest streak day) — still local, no backend needed.
- [ ] Optionally route selection through the existing n8n coach rail for
      `medium`/`family`. Reuses the `CLAUDE_coach_reply` pattern and the quota
      machinery in [quota.ts](src/lib/quota.ts).
- [ ] Guardrail: personalization is the perk, **missions themselves stay free**.
      Gating the habit loop behind a paywall costs more retention than it earns.

---

## Explicitly out of scope

Recorded so they don't creep back in:

- Round-ups, payday split, 52-week ladder, weather-triggered saves — all need a
  bank link and automated transfers.
- Debt payoff missions — needs a whole debt data model.
- Investing missions — needs a feature plus regulatory exposure, zero upside here.
- Social / referral / shared goals — needs Appwrite backend work.
- Prize-linked draws, cash rewards, cash-back — would drag in sweepstakes law,
  money transmission, and a bank partner. XP-only is the whole point.

## Open questions

- [ ] Selection seed: `periodKey` alone, or mixed with a stable per-user id?
      There's no durable user id in the store today (`profile.email` is the
      closest). Period-only + `recentMissionIds` is probably sufficient for a
      local-first app.
- [ ] Should a missed daily mission cost anything? Current answer: no — the
      report's fatigue findings argue against punishment, and the streak already
      carries the loss-aversion weight.
- [ ] Does the "Check in" mission cheapen the set by being free XP, or is it the
      guaranteed-win floor the tier-1 design wants? Lean: keep it in tier 1 only.
