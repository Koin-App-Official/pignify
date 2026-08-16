# Reinstall / New Device — Data Loss

Scoping report for the half of [ONBOARDING_FIXES.md — Finding 3](ONBOARDING_FIXES.md#-3-nothing-reads-data-back-down-from-the-server)
that [#96](https://github.com/Koin-App-Official/pignify/issues/96) deliberately left unfixed. #96 closed the
"reinstall creates an orphaned duplicate goal" bug (a login entry point + goal-metadata hydrate). This document
is about what's left: **saved progress does not survive a reinstall, full stop.**

- **Audited:** `main` @ the state after #91–#97, plus a direct read of the live Appwrite schema and the
  `CLAUDE_onboarding` n8n workflow (via MCP) on 2026-08-16.
- **Not a plan.** No schema is proposed as final. This is the input a scoping decision needs — options,
  tradeoffs, and exactly which pieces (client / Appwrite / n8n) each option touches.

---

## What's actually lost

Everything below lives in `AsyncStorage` only, under the zustand `piggy-storage` key, and nowhere else:

| Field | Where | Purpose |
|---|---|---|
| `Goal.savedAmount` | `src/lib/store.ts` | Progress toward a goal's target |
| `Goal.deposits: { date, amount }[]` | `src/lib/store.ts` | Full deposit history — drives streak, missions, charts |
| `profile.streak` | `src/lib/store.ts` | Consecutive-day saving streak |
| `profile.xp`, `profile.level` | `src/lib/store.ts` | Gamification progress |
| `profile.missionsCompletedTotal`, `activeMissions`, `recentMissionIds` | `src/lib/store.ts` | Mission state |
| `profile.lessonsCompleted` | `src/lib/store.ts` | Money-quiz progress |
| `profile.expenses: Expense[]` | `src/lib/store.ts` | Spending log |
| `profile.lastActiveDate`, `lastStreakCheckDate`, `checkinIgnoredStreak`, `activityHourCounts` | `src/lib/store.ts` | Streak bookkeeping, notification personalization |

A reinstall wipes `AsyncStorage`. Every one of these resets to zero. There is no server copy of any of it —
confirmed directly against the live schema, not inferred from docs (which had already drifted stale once this
session — see the `PLAN_RANK` and `monthly_contribution_cents`/`planning_mode` discoveries in #95/#96).

## What #96 already restores (and why it stops there)

The server `goals` table (`piggnify_mobile_db`) has exactly these columns:

```
user_id, goal_name, price_cents, deadline, archived, monthly_contribution_cents, planning_mode
```

`CLAUDE_onboarding`'s "Create Goal Row" node writes this once, at account creation. **Nothing writes to it
again, ever** — `updateGoal` in `store.ts` is a pure local mutation with no server call, confirmed by reading
its implementation. So the row is a write-once snapshot of goal *configuration*, not a live mirror.

#96's `goalsSync.ts` reads exactly those columns back on login, when local goals are empty. That's the ceiling
of what's restorable without new schema: name, target amount, deadline, archived status, planning mode. It
explicitly does not and cannot restore `savedAmount` or `deposits`, because those columns don't exist.

## Why this is harder than adding a column

Three compounding problems, not one:

**1. No server representation for progress.** `goals` needs at minimum a `saved_amount_cents` column to
restore *current* progress. Restoring the full deposit *history* (which streak/mission logic depends on, not
just the total) needs a separate table — a `deposits` row per deposit, mirroring the `incomes` table's shape
(`user_id`, `goal_id`, `amount_cents`, `date`, `created_at`).

**2. No write path exists.** Every other piece of server-tracked state in this app (billing, entitlements) is
written by a backend process, never the client directly — client of record is Stripe→n8n→Appwrite for
billing, `CLAUDE_onboarding` for account creation. Deposits have no equivalent. Today `addDeposit` in
`app/(tabs)/goals.tsx` calls `updateGoal()` and stops — a purely local, fire-and-forget mutation. Making
deposits durable means every deposit write needs a corresponding server call, either:
  - **Client → n8n webhook** (same pattern as `CLAUDE_onboarding`/billing) — client stays the trigger, backend
    is the single writer. Consistent with how this codebase does everything else. Needs a new n8n workflow.
  - **Client → Appwrite directly**, using the row-security model already proven for `goals`/`incomes`
    (`read/update/delete("user:<id>")` permissions, confirmed live on both tables). Simpler (no n8n round
    trip), but this app has deliberately avoided treating the client as a direct writer of anything
    financially meaningful elsewhere — would be a first, and needs its own review of whether that's
    acceptable for deposit data specifically (lower stakes than billing, still worth a deliberate call).

**3. No reliable identity between client and server records.** Client `Goal.id` is generated with
`Math.random().toString(36).substring(7)` — confirmed by reading `onboarding.tsx`'s goal-creation call.
Server row `$id` is Appwrite's own auto-generated ID. They have never been the same value for any goal created
before #96, and #96 only aligns them going forward for goals actually created *through* a hydrate (where the
client now adopts the server's `$id` as its local `id` — see `goalsSync.ts`). Every goal created via
onboarding before this still has two unrelated IDs if it round-trips server → client. Any deposit-sync design
needs a real foreign key (`goal_id` matching the server goal row, not the client's random string) from the
start, or it inherits this mismatch permanently.

## What a real fix needs — by system

**Appwrite schema (new):**
- `goals.saved_amount_cents` (integer) — current total, cheap to add and cheap to keep in sync (one field,
  updated on every deposit).
- A `deposits` table: `user_id`, `goal_id` (real FK to the `goals` row `$id`, not the client's local id),
  `amount_cents`, `date`, `created_at`. rowSecurity + owner permissions, same pattern as `incomes`/`goals`.
- Row-permission decision: apply the same `read/update/delete("user:<id>")` pattern already live on
  `goals`/`incomes`/`subscriptions`/`entitlements` — no new pattern needed here, just more tables using it.

**n8n (new workflow, if the client→n8n write path is chosen):**
- A `CLAUDE_deposit_record` (or similar) webhook: takes `userId`, `goalId`, `amount`, writes the `deposits`
  row and bumps `goals.saved_amount_cents` atomically (two writes, no transaction primitive visible in the
  tools used elsewhere in this codebase — needs either an Appwrite transaction, or accepting a narrow window
  where the two could disagree and reconciling by summing `deposits` as the source of truth on read).
- This workflow would need to be hand-assembled in the n8n UI, same as every other workflow in this project —
  not something buildable purely from this session (per the existing "blocked on access" pattern already
  noted for the billing workflows in memory).

**Client (`src/lib/`):**
- A `depositsSync.ts` (mirroring `goalsSync.ts`'s shape): `recordDeposit(goalId, amount)` — best-effort,
  fire-and-forget from `addDeposit()` in `goals.tsx`, matching how every other network call in this app treats
  its own failure (never blocks the local write, logs and moves on).
- Extend the hydrate-on-login path (`authLock.ts`'s `hydrateGoalsIfEmpty`) to also pull deposit history for
  each restored goal, so streak/mission/XP recomputation has real data to work from — this is where the
  "only when local is empty" rule from #96 keeps mattering: a same-device forgot-PIN reset must never
  overwrite local deposits with a server copy that could be behind if any writes failed along the way.
- **Streak/XP/missions/lessons still have no server representation in any option above.** Restoring deposits
  alone lets `computeStreak()` (`src/lib/deposits.ts`) recompute a streak from real deposit dates after a
  reinstall, which recovers *most* of the practical loss — but `xp`, `level`, `missionsCompletedTotal`, and
  `lessonsCompleted` would still reset to zero unless they get their own columns too. Worth deciding
  explicitly whether recomputed streak is "good enough" or whether gamification state needs the same
  treatment — recomputing XP/level from deposit history is possible in principle (replay the same rules that
  award XP live) but hasn't been designed here.

## Sizing

Not a single PR. Minimum shippable slice: `saved_amount_cents` + a `deposits` table + one new n8n workflow +
two new client modules (write path in `goals.tsx`, read path in `authLock.ts`) + tests for the merge logic.
Streak recomputation from restored deposits is a reasonable stretch goal for the same slice. XP/level/mission/
lesson restoration is a separate decision and, if wanted, a separate slice on top.

## Recommended sequencing

1. Decide the write-rail question first (client→n8n vs. client→Appwrite direct) — it's the one architectural
   choice everything else depends on, and it's a genuine "how does this app want to treat client-writable
   data going forward" call, not an implementation detail.
2. Schema (`saved_amount_cents` + `deposits` table) — cheap, reversible, do it early regardless of (1).
3. Write path — wire `addDeposit()` to the new sync call.
4. Read path — extend hydrate-on-login (still gated on local-empty, per #96's established reasoning).
5. Streak recomputation from restored history — verify against `computeStreak()`'s existing logic and its
   test suite (`deposits.test.ts`) rather than writing new streak logic.
6. XP/level/missions/lessons — separate decision, only after (1)–(5) are live and the "is recomputed streak
   enough" question has an answer from real usage.
