# Multiple Income Sources — Family-Gated Multi-Income

**Tracking:** [#191](https://github.com/Koin-App-Official/pignify/issues/191)
**Branch:** `feat/issue-191-multiple-incomes`
**Status:** Phases 1–10 implemented. Typecheck/test/bundle-size clean (449/449
tests, +0.62 MB bundle). B1–B4 and B5's credential swap verified live; B5's
key rotation is still owed (your call, see Phase 4/10). The manual device pass
and the live data check (Phase 10) are outstanding — everything else is done
pending those. Issue not yet closed and PR not yet opened, on purpose, until
verification is actually complete.

## Problem

The client models income as a single scalar: `UserProfile.monthlyIncome:
number | null` plus `incomeSkipped: boolean` (`src/lib/store.ts:176-177`). We
want **multiple income sources**, each with a **label**, an **amount**, and an
**amount to set aside for saving** — everyone gets 1 source, **Family**
subscribers get up to 3.

The key finding from the audit: **most of the backend already exists and is
live.** The client is the part that never caught up. This plan is deliberately
additive to what is there rather than a greenfield design.

---

## Decisions (confirmed)

**D1 — Family gets a maximum of 3 income sources.** This is what the entire
stack already says: `PLAN_CONFIG.family.quotas.incomes = 3`
(`entitlements.ts:124`), `quota_incomes: 3` in `schema.mjs:73`, and the live
`plans` row. Beginner and Medium stay at 1. **No quota values change anywhere**,
which removes a whole class of backend churn from this project.

**D2 — The per-income set-aside is the user's declared monthly savings
capacity, and it drives when a goal is reached.** See the dedicated section
below for exactly how this hooks into the existing math.

**D3 — Onboarding stays single-income.** The income step keeps its current
shape; it writes one source labelled "Primary". No label field and no separate
set-aside question are added to onboarding — the contribution step already asks
"how much can you set aside", and that answer seeds the first income's
set-aside (see D2 below). The most-tuned flow in the app is left structurally
untouched.

**D4 — Everyone gets the label field**, including Beginner/Medium users with a
single source. One income named "Salary" reads better than an unlabelled
number, and it removes a migration seam when they later upgrade.

---

## D2 in detail — how set-aside drives the goal date

### How income is used today

Income currently drives **three** things, and notably *not* the goal date:

1. **Suggestion chips** — `suggestedContribution(monthlyIncome, pct)` at 10/15/20%
   (`ContributionStep.tsx:48,122-123`, `goalMath.ts:60-63`).
2. **A "% of your monthly income" line** (`ContributionStep.tsx:89,166-170`).
3. **A soft warning above 35% of income** (`ContributionStep.tsx:49,90,179-184`)
   and the multi-goal over-allocation warning (`goals.tsx:121`).

The **goal date** comes from `deriveGoalDate(targetAmount, contributionNumber)`
(`ContributionStep.tsx:79-82,97`) — driven by the *contribution*, never by
income. Income is only ever a sanity check on that contribution.

### What changes

`totalSaveAside(activeIncomes)` — the sum of every active source's set-aside —
becomes the user's **declared monthly savings capacity**, and that is what feeds
`deriveGoalDate`. The existing engine already turns a monthly figure into a
completion date; this plan gives that engine a real, user-declared number
instead of a blank input.

Concretely:

- **New goals prefill from capacity.** In contribution mode, `ContributionStep`
  gains a first, pre-selected suggestion chip — "From your income: X" — seeded
  from capacity, shown alongside the existing 10/15/20% chips. Selecting it (or
  the automatic prefill) puts capacity into the contribution input, and the
  existing `contribution.reachGoalBy` line (`ContributionStep.tsx:159-164`)
  immediately answers *"you'll reach this by March 2027"*. **No new date math** —
  `deriveGoalDate` already does it.
- **Onboarding closes the loop.** The contribution the user picks in onboarding
  is written back as the first income's `saveAmount`. There is exactly one goal
  and one income at that moment, so contribution *is* capacity. This satisfies
  D2 without adding a screen to onboarding (D3).
- **The over-allocation warning gets a better yardstick.** `goals.tsx:121`
  currently compares total monthly goal contributions against *income*, which
  was always a weak proxy — nobody saves 100% of income. It now compares against
  **capacity** when set, falling back to income when not. Same warning, honest
  threshold.
- **`pctOfIncome` stays income-based.** It genuinely means "% of income" and is
  unaffected.

### Existing goals: split on `planningMode`, and always ask

When capacity changes later, what should happen to goals the user already has?
The answer differs by goal type, and the distinction is already in the data
model — `Goal.planningMode` (`store.ts:71-77`):

- **`deadline` goals** — the user picked a real-world date (a wedding, a lease
  ending, a term bill). The date is a *constraint*; the contribution is derived
  from it. These are **never** rewritten. Capacity only surfaces a warning when
  it doesn't cover the required contribution.
- **`contribution` goals** — the user said "I set aside $X/month, tell me when."
  The date here is already *derived output*, not a decision, so refreshing it
  from real capacity keeps a derived value honest rather than overwriting a
  choice.

Even for contribution goals the update is **offered, never applied silently**:
with two or more goals, how capacity splits between them is itself a user
choice the app cannot infer. This matches the two existing precedents for "a
value changed underneath, dependent data is now stale" — `downgrade-selection.tsx`
refuses to auto-archive and re-asks if dismissed (C4/C7), and
`CurrencyConvertModal` asks convert-vs-relabel rather than assuming
(`settings.tsx:247-265`).

Capacity is shared across all active goals, so any projection divides it the way
`goals.tsx` already sums `otherActiveGoalsMonthlyTotal` (`:111-118`) — a goal
gets its share of capacity, not the whole of it.

Phase 7 builds the always-on half (capacity plans **new** goals, and becomes the
affordability yardstick). Phase 8 builds the interactive half (the apply-to-goals
prompt and the deadline-goal warning).

---

## Bugs found during the audit — all fixed by this plan

| # | Bug | Evidence | Fixed in |
|---|---|---|---|
| **B1** | **`CLAUDE_account_delete` never purges `incomes`.** Income rows outlive a deleted account. Pre-existing GDPR/retention gap; gets worse once rows carry labels and there are up to 3. | `n8n/code-nodes/account-deletion.js:22-28` lists subscriptions, entitlements, devices, addon_purchases, goals — not incomes. Confirmed against the live workflow's own description. | Phase 4 |
| **B2** | **Deep Analysis sums archived income.** Its `wage` reduce has no `archived` filter, so an archived source would still inflate the report. Harmless today (nothing archives yet), wrong the moment Phase 8 ships. | live workflow `fnezcOF8tV7yEXjL`, `SetPriorityInfo` node | Phase 4 |
| **B3** | **Duplicate-income trap.** `CLAUDE_onboarding` creates its row with `unique()`, so once the client also writes income rows, every newly onboarded user ends up with **two** records for one income. | live workflow `FiA67LUzb5BF6csa`, `Create Income Row` / `Repair Missing Income` | Phase 4 |
| **B4** | **Income is lost on reinstall.** The server row survives but nothing reads it back — `goalsSync.ts` does this for goals (`authLock.ts:286`), nothing does it for income. | `src/lib/goalsSync.ts:53-64` vs. no income equivalent | Phase 5 |
| **B5** | **A raw Appwrite API key is inlined in 4 HTTP nodes** of the Deep Analysis workflow (`userPOST`, `getUser1`, `GetUserProfile`, `GetUserIncomes`) as a literal `X-Appwrite-Key` header, instead of the shared `Appwrite Header Auth` credential every `CLAUDE_*` workflow correctly uses. The key is therefore exposed in workflow JSON, exports and execution logs. | live workflow `fnezcOF8tV7yEXjL` | Phase 4 |

> **B5 needs your explicit go-ahead on the rotation half.** Swapping the 4 nodes
> to the shared credential is safe and self-contained. **Rotating the exposed
> key** is shared-infrastructure surgery — anything else still authenticating
> with it breaks the moment it's revoked, and I can't see every consumer from
> here. The plan does the swap; the rotation is listed as a checklist item for
> you to run (or explicitly approve) rather than something I do unattended.

---

## Architecture recap (verified against live code, live Appwrite, live n8n)

### What already exists — do not rebuild

| Layer | State today | Evidence |
|---|---|---|
| Appwrite `incomes` table | **Live**, 12 rows, `rowSecurity: true`, columns `user_id`/`label`/`amount_cents`/`archived`/`created_at`, indexes `idx_user_id` + `idx_user_archived` | queried live; mirrors `scripts/appwrite/schema.mjs:318-337` |
| Per-plan income quota | **Live and consistent** — beginner 1, medium 1, family 3 | `entitlements.ts:85,104,124`; `schema.mjs:55,64,73`; live `plans` rows |
| Upgrade-gate copy | **Live in all 4 locales** — `gates.incomes.*`, `quota.incomeSources_one/_other`, `quota.incomeSourcesUnlimited`, `downgradeSelection.retentionResource.incomes` | `src/lib/i18n/locales/{en,pl,hu,de}/plans.json` |
| `GateKey: 'incomes'` | **Wired** into `gateInfo()`, resolves the target plan via `lowestPlanWithMoreQuota` | `entitlements.ts:276-281` |
| Downgrade retention model | **Already models incomes** — `RetentionSelection.keepIncomeIds`, `evaluateDowngradeRetention({ incomes })`, `validateRetentionSelection` | `retention.ts:15-19,45-63,81-107` |
| `plan_change_requests.keep_income_ids` | **Live column** | `schema.mjs:291` |
| n8n `CLAUDE_onboarding` | **Writes one income row** per user (`label: "Primary"`, owner row-permissions) from `Create Income Row` and the idempotent `Repair Missing Income` | live `FiA67LUzb5BF6csa` |
| n8n `CLAUDE_coach_reply` | **Already multi-income correct** — fetches incomes, filters `!archived`, sums `amount_cents` into the prompt | live `2ZLK31SPSSrplvlO`, `Build Prompt` |
| n8n Deep Analysis | Sums income rows into `wage` (but see **B2**) | live `fnezcOF8tV7yEXjL` |

### What is missing

1. **No `save_amount_cents` column** on `incomes` — D2's set-aside has nowhere
   to live server-side.
2. **The client cannot create income rows.** `incomes` has table
   `$permissions: []`; with `rowSecurity: true` a user can read/update/delete
   *their own* rows (n8n stamps owner permissions on create) but cannot
   `create`. `devices` solves exactly this with `permissions: ['create("users")']`
   (`schema.mjs:219`), and `src/lib/device.ts:66-93` is the working client-write
   precedent (`tablesDB.upsertRow` + explicit `Permission.*(Role.user(userId))`).
3. **The whole client model and UI** — see the read-site table below.
4. Plus bugs **B1**–**B5** above.

### Every client read of income today

| Call site | Use |
|---|---|
| `src/lib/store.ts:176-177,282-283` | field + default |
| `src/lib/storeMigrations.ts:12` | persist version (currently 8) |
| `src/lib/currencyConversion.ts:19,39,65` | convert/relabel on currency switch |
| `src/hooks/useEntitlements.ts:37,65,82` | `incomesUsed = monthlyIncome != null ? 1 : 0` |
| `src/lib/entitlementsRefresh.ts:83` | retention evaluation after a web plan change |
| `app/downgrade-selection.tsx:36,48,75` | retention count + hardcoded empty `keepIncomeIds` |
| `app/(tabs)/profile.tsx:43-44,116-134,205-242` | the single edit surface (#150) |
| `app/(tabs)/goals.tsx:71,121,418-419` | over-allocation warning + `ContributionStep` |
| `app/(tabs)/index.tsx:74,279-291` | `incomeSkipped` nudge → `/profile?editIncome=1` |
| `src/components/ContributionStep.tsx:25-26,76,89,123` | % -of-income, warnings, suggestion chips |
| `src/lib/goalMath.ts:60-63` | `suggestedContribution(monthlyIncome, pct)` |
| `app/onboarding.tsx:223-224,332,350,522,569,1177-1196,1206,1242` | income step, draft, webhook payload, blueprint |
| `src/lib/onboardingDraft.ts:51-52` | draft fields (strings) |

### Constraints this plan must respect

- **`store.ts` cannot be imported under vitest** (pulls in `react-native`). Logic
  worth testing lives in a pure leaf module — the pattern behind `goalMath.ts`,
  `deposits.ts`, `retention.ts`, `storeMigrations.ts`.
- **Money is integer cents server-side, floats client-side** (`schema.mjs:14`,
  `goalsSync.ts:38`). Conversion happens at the sync boundary, both ways.
- **C4/C7: data is never auto-deleted.** Over-limit income on a downgrade is
  *archived* after an explicit choice, never removed.
- **C13: gated features stay visible** and open `UpgradeModal`.
- **i18n parity is test-enforced** (`src/lib/i18n/locales.test.ts`) — every new
  key lands in `en`, `pl`, `hu` *and* `de` in the same commit.
- **Baseline to hold:** `npm run typecheck` clean, `npm run test` 390/390 across
  19 files (measured on this branch before any change).

---

## Phase 1 — Pure data model, migration, currency conversion ✅ Done

- [x] New pure leaf module `src/lib/income.ts`: the `IncomeSource` interface
      (`id: string`, `label: string`, `amount: number`,
      `saveAmount: number | null`, `archived?: boolean`), plus
      `activeIncomes()`, `totalIncome()`, `totalSaveAside()`, `makeIncome()`.
      Pure and store-free so vitest can reach it. `store.ts` re-exports the type
      the way it already re-exports `Achievement` (`store.ts:44`).
- [x] `src/lib/store.ts`: replace `monthlyIncome: number | null` with
      `incomes: IncomeSource[]` (`:176`), default `[]` (`:282`). Keep
      `incomeSkipped` — it records an explicit user intent the dashboard nudge
      reads (`index.tsx:279`), which an empty array cannot distinguish from
      "brand-new profile".
- [x] `src/lib/storeMigrations.ts`: bump `PIGGY_STORE_VERSION` to **9**, add the
      `v8 → v9` step — `monthlyIncome: X` becomes
      `[{ id, label: 'Primary', amount: X, saveAmount: null }]`, `null` becomes
      `[]`, old key dropped. Documented why the label matches the string n8n
      already writes, so the Phase 5 read-down reconciles cleanly.
- [x] `src/lib/currencyConversion.ts`: `ConvertibleProfile` swaps
      `monthlyIncome` for `incomes` (`:19`); `convertProfileAmounts` converts
      each `amount` **and** `saveAmount` (`:39`); `hasConvertibleMonetaryData`
      counts a non-empty incomes array (`:65`).
- [x] Tests: new `src/lib/income.test.ts` (totals ignore archived; empty array
      totals 0; `saveAmount: null` contributes 0 to capacity). Extended
      `storeMigrations.test.ts` (`:23-24` + a dedicated v8→v9 describe block)
      and `currencyConversion.test.ts` (`:12,47,49,56,103`).

**Modified files:** `src/lib/income.ts` (new), `src/lib/income.test.ts` (new),
[src/lib/store.ts](../src/lib/store.ts),
[src/lib/storeMigrations.ts](../src/lib/storeMigrations.ts),
[src/lib/storeMigrations.test.ts](../src/lib/storeMigrations.test.ts),
[src/lib/currencyConversion.ts](../src/lib/currencyConversion.ts),
[src/lib/currencyConversion.test.ts](../src/lib/currencyConversion.test.ts)

**Phase complete when:**
- [x] A persisted v8 blob with `monthlyIncome: 4000` rehydrates as exactly one
      active income of 4000 labelled "Primary"; `null`/`0`/missing rehydrates as
      `[]` — asserted in `storeMigrations.test.ts` (both the dedicated v8→v9
      block and the full v0-chain case), not assumed.
- [x] A currency switch converts every income's amount **and** set-aside, and
      preserves each source's other fields (id/label/archived); the
      convert-vs-relabel modal still suppresses itself for a profile with no
      monetary data — asserted in `currencyConversion.test.ts`.
- [x] `npm run test` green — 410/410 (390 baseline + 20 new cases across
      `income.test.ts`, `storeMigrations.test.ts`, `currencyConversion.test.ts`).
- [x] Typecheck fails app-wide as expected, with errors confined to exactly the
      8 read sites Phase 2 targets (`goals.tsx`, `profile.tsx`,
      `downgrade-selection.tsx`, `useEntitlements.ts`, `entitlementsRefresh.ts`,
      and one of onboarding's two `updateProfile` calls — the webhook payload
      itself is untyped and correctly shows no error, since it's meant to keep
      sending `monthlyIncome`/`incomeSkipped` to n8n unchanged).

---

## Phase 2 — Migrate every read site (behaviour unchanged, still one income) ✅ Done

No new UI. The app must behave **exactly** as today for a single-income user;
only the shape underneath changes.

- [x] `src/hooks/useEntitlements.ts`: `incomesUsed` becomes
      `activeIncomes(incomes).length` (`:37,65,82,90`), replacing the
      `!= null ? 1 : 0` stand-in and its "Income is currently a single value" note.
- [x] `src/lib/entitlementsRefresh.ts:83`: same, for the post-sync retention check.
- [x] `app/(tabs)/goals.tsx:71,418-419`: pass `totalIncome(activeIncomes(incomes))`
      into `ContributionStep`; `incomeSkipped` comes from the profile flag rather
      than a falsy scalar. (The `:121` warning threshold changes in **Phase 7**,
      not here.)
- [x] `src/components/ContributionStep.tsx`: prop stays `monthlyIncome: number | null`
      — the component's job is percentage math, not income modelling, so callers
      hand it the total. Unchanged this phase.
- [x] `app/onboarding.tsx`: income step unchanged (D3); the `updateProfile`
      call that used to write the scalar now writes
      `incomes: [makeIncome({ label: 'Primary', amount: incomeNumber })]`.
      The webhook payload keeps sending `monthlyIncome`/`incomeSkipped` —
      `CLAUDE_onboarding`'s `Normalize` node reads exactly those names, and
      Phase 4 extends rather than renames them.
- [x] `app/(tabs)/profile.tsx`: minimal edit — the existing single-income card
      reads/writes `incomes[0]`. Replaced wholesale in Phase 6; this only keeps
      the app compiling and correct in between.
- [x] `app/downgrade-selection.tsx:48`: real active-income count, with an inline
      note that the selection **UI** is still Phase 9 — so a real over-limit
      income count can now make `selectionRequired` true without the screen yet
      offering a way to choose which to keep.

**Modified files:** [src/hooks/useEntitlements.ts](../src/hooks/useEntitlements.ts),
[src/lib/entitlementsRefresh.ts](../src/lib/entitlementsRefresh.ts),
[app/(tabs)/goals.tsx](../app/(tabs)/goals.tsx),
[app/(tabs)/profile.tsx](../app/(tabs)/profile.tsx),
[app/onboarding.tsx](../app/onboarding.tsx),
[app/downgrade-selection.tsx](../app/downgrade-selection.tsx)

**Phase complete when:**
- [x] `npm run typecheck` clean — `grep -rn "monthlyIncome" app src` returns only
      `ContributionStep`'s prop, `goalMath`'s parameter, onboarding's own local
      state/draft/webhook-payload names, i18n keys, and doc comments — no live
      read of `profile.monthlyIncome` anywhere. Confirmed by running the grep,
      not assumed.
- [x] `npm run test` green — 410/410, unchanged from Phase 1.
- [ ] Onboarding → dashboard → goals → profile behaves identically to `main`
      for a single-income user — **left for you to self-verify on device**, per
      standing preference (no simulator/browser automation pushed for UI checks).

---

## Phase 3 — Appwrite schema: set-aside column + client create permission ✅ Done

- [x] Added `save_amount_cents` (integer, **optional**, no default) to the live
      `incomes` table. Optional because existing rows have no value, and "not
      set" is meaningfully different from "set aside 0".
- [x] Added `create("users")` to the `incomes` table permissions, matching
      `devices` exactly (confirmed both tables now have identical
      `$permissions: ["create(\"users\")"]` and `rowSecurity: true`). Row
      ownership is already stamped per row on create, so this widens creation
      only, never reads.
- [x] Mirrored both into `scripts/appwrite/schema.mjs:318-343` with a dated
      comment recording what changed and how it was verified, the same way
      `LEGACY_TABLES_ALIGNED` documents earlier live-applied changes.
- [x] **No quota changes** — confirmed live: all 3 `plans` rows' `updatedAt`
      timestamps are unchanged from before this phase (`beginner`/`medium`
      still 1, `family` still 3).

**Correction made mid-phase:** the first `tables_db_update_table` call (setting
only `permissions`) silently reset `rowSecurity` to `false` — Appwrite's update
endpoint does not treat an omitted field as "leave unchanged" for this one.
Caught immediately by re-reading the table back rather than trusting the write
response's own echo, and fixed in a second call that passed `row_security: true`
explicitly alongside the permissions. Re-verified after the fix: `rowSecurity:
true`, and all 12 existing rows' individual owner permissions were unaffected
throughout (confirmed by reading them back). Flagging this for **Phase 5**
(`incomeSync.ts`) and **Phase 9** (retention writes) — any future
`tables_db_update_table` call on this project must pass `row_security`
explicitly, never rely on omission to preserve it.

**Modified files:** [scripts/appwrite/schema.mjs](../scripts/appwrite/schema.mjs),
plus live Appwrite changes applied via MCP.

**Phase complete when:**
- [x] `tables_db_list_columns`/`tables_db_list_tables` on `incomes` shows 6
      columns including `save_amount_cents`, and the table's `$permissions`
      include `create("users")` with `rowSecurity: true` — read back live, not
      assumed from the write call.
- [x] The 12 existing rows are untouched and still readable — verified by
      listing them after the change; each still carries its original
      `user_id`/`label`/`amount_cents`/`archived`/`created_at` plus the new
      `save_amount_cents: null`, and its original owner-only permissions.
- [x] `schema.mjs` matches live exactly.
- [x] `npm run typecheck` clean, `npm run test` 410/410 (schema-only phase;
      confirms the local suite wasn't accidentally touched).

---

## Phase 4 — n8n: bug fixes B1, B2, B3, B5 (mostly done — 2 checks need a live test run)

- [x] **B3 — deterministic income id.** `CLAUDE_onboarding`'s `Normalize` gained
      an `incomeId` assignment read from the request body; `Create Income Row`
      and `Repair Missing Income` use
      `"documentId": "{{ $('Normalize').item.json.incomeId || 'unique()' }}"`.
      `app/onboarding.tsx`'s `provisionAccount` now mints one `IncomeSource` up
      front (`primaryIncome`) and reuses its `id` for both the webhook
      payload's `incomeId` and the local `updateProfile({ incomes: ... })`
      call, so the two never diverge.
- [x] **B2 — archived filter.** Deep Analysis's `SetPriorityInfo` `wage` reduce
      gained `.filter((r) => !r.archived)`, matching `CLAUDE_coach_reply`'s
      `Build Prompt`.
- [x] **B1 — purge incomes on account deletion.** Added `'incomes'` to
      `USER_KEYED_TABLES` (`n8n/code-nodes/account-deletion.js`) and, live, a
      full List/Split/Delete Incomes Row branch wired into `CLAUDE_account_delete`,
      merged into `All Table Deletes Done` as its 7th input (`numberInputs`
      bumped 6 → 7). Workflow description updated.
- [x] **B5 — remove the inlined API key.** `userPOST`, `getUser1`,
      `GetUserProfile` and `GetUserIncomes` in the Deep Analysis workflow now
      use `authentication: genericCredentialType` / `genericAuthType:
      httpHeaderAuth` with the shared `Appwrite Header Auth` credential
      (`TaDrV35EzjGhssHS`), same as every `CLAUDE_*` workflow. Confirmed by
      reading the published draft back: none of its 60 nodes contain the
      literal key string anymore.
- [ ] **B5 rotation — still your call, not mine.** The swap above is live, but
      the exposed key itself has not been revoked. I did not do this
      unattended: any other consumer still using that key breaks the instant
      it's revoked, and I can't enumerate them from here. Approve it or run it
      yourself in the Appwrite console, then tick this box.
- [x] Updated [n8n/README.md](../n8n/README.md) — a new "Income sources"
      section (write/read/purge, cross-referencing #191's B1/B2/B3), plus the
      `account-delete` table list.

**Mistakes made and corrected mid-phase** (both on the live n8n side, both
caught by re-reading the draft back before publishing — same discipline as
Phase 3's `rowSecurity` catch):
1. A `setNodeParameter` call with path `/parameters/jsonBody` on `Create
   Income Row`/`Repair Missing Income` did not update the real `jsonBody` —
   it created a stray nested `parameters.parameters.jsonBody` key instead,
   leaving the actual `jsonBody` still on `unique()`. Fixed with
   `updateNodeParameters` + `replace: true` passing the node's complete,
   correct parameter object instead of a partial JSON-Pointer patch. **Lesson
   for later phases: don't use `setNodeParameter` on a nested object field on
   this tool — use `updateNodeParameters` with `replace: true` and the full
   object.**
2. `setNodeCredential` initially failed with "node type ... does not accept
   credential 'httpHeaderAuth'" — the node's `authentication`/`genericAuthType`
   parameters have to already declare `genericCredentialType`/`httpHeaderAuth`
   before the tool will attach that credential type. Split into two calls:
   parameters first, credential attachment second. **Lesson: credential
   attachment is two steps, not one, whenever a node didn't already declare
   the matching auth type.**

**Modified files:** [n8n/code-nodes/account-deletion.js](../n8n/code-nodes/account-deletion.js),
[n8n/README.md](../n8n/README.md), [app/onboarding.tsx](../app/onboarding.tsx),
plus live edits to `CLAUDE_onboarding`, `CLAUDE_account_delete` and the Deep
Analysis workflow (all published, not left as unpublished drafts).

**Phase complete when:**
- [ ] A test onboarding run creates exactly **one** income row whose `$id`
      equals the client-generated id — read back from Appwrite. **Not run** —
      this needs an actual webhook call with a disposable test account, which
      creates real rows across `users`/`goals`/`entitlements`/`incomes`. Left
      for an explicit go-ahead rather than run unattended.
- [ ] Re-running the same payload (the idempotent repair path) creates no
      second row. Same — not run, needs the same live test.
- [ ] Deep Analysis's `wage` excludes a manually-archived test row. Same —
      not run.
- [ ] Account deletion on a throwaway account leaves zero `incomes` rows
      behind. Same — not run, and this one is destructive by design.
- [x] No `X-Appwrite-Key` literal remains in any workflow node — confirmed
      statically: scanned every node in the Deep Analysis workflow's published
      draft (not just the 4 targeted ones) for the literal key string. Zero
      hits.

**If you want the 4 unchecked boxes closed**, say so and I'll either run a
disposable end-to-end test (new throwaway email through onboarding → verify →
delete) or walk you through doing it yourself.

---

## Phase 5 — Client ⇄ Appwrite income sync (fixes B4) ✅ Done

- [x] New `src/lib/incomeSync.ts`, modelled on `device.ts:66-93` (write) and
      `goalsSync.ts:53-64` (read-down):
      - `pushIncome(userId, income)` — `tablesDB.upsertRow` with the income's own
        id, `amount_cents`/`save_amount_cents` as integers, explicit
        `Permission.read/update/delete(Role.user(userId))`.
      - `archiveIncome(incomeId)` — a partial `updateRow({ archived: true })`,
        not a full upsert, so it can't clobber fields it doesn't touch.
      - `deleteIncome(incomeId)` — `tablesDB.deleteRow`, the explicit
        user-initiated remove path (Phase 6), distinct from archiving.
      - `fetchServerIncomes(userId)` — rows → `IncomeSource` (cents ÷ 100), never
        throws, `null` on failure.
      Every write is **best-effort, fire-and-forget**: local state is the source
      of truth for the UI, exactly as `registerDevice` treats failure as
      non-fatal (`device.ts:91`).
- [x] **B4** — `src/lib/authLock.ts`: added `hydrateIncomesIfEmpty(userId)` beside
      `hydrateGoalsIfEmpty`, called from the same place in `onLoggedIn` (right
      after `hydrateGoalsIfEmpty(userId)`), only when the local array is empty
      (a genuine reinstall/new device).
- [x] Tests: pure mapping helpers (cents ⇄ float, row → `IncomeSource`,
      `IncomeSource` → server write shape) — **14 tests**, all passing.

**Filename deviation from the plan, for a structural reason (not scope
creep):** the plan named the test file `src/lib/incomeSync.test.ts`, but
`incomeSync.ts` imports `./appwrite` → `react-native-appwrite` →
`react-native`, which fails to parse under vitest (`Flow is not supported` on
`node_modules/react-native/index.js`) — confirmed by actually trying it, the
same failure mode `store.ts` and every other RN-touching module in this repo
already has. No function defined *inside* that file can be unit-tested,
regardless of purity, because the whole module fails to load. So the pure
mapping logic (`amountToCents`/`centsToAmount`/`toClientIncome`/
`toServerIncomeData`) lives in a new sibling pure module,
**`src/lib/incomeMapping.ts`**, tested by **`src/lib/incomeMapping.test.ts`**
— exactly the split `storeMigrations.ts` already uses for the identical
reason, and the same reasoning `currencyConversion.ts`'s header gives for its
own structural subset types. `incomeSync.ts` imports the mapping functions
from there and does only I/O. Verified: `import type { Models } from
'react-native-appwrite'` (type-only) loads fine under vitest even though a
value import from the same package doesn't — so `ServerIncomeRow` still gets
real `Models.DefaultRow` typing without pulling in the runtime.

**Modified files:** `src/lib/incomeSync.ts` (new),
`src/lib/incomeMapping.ts` (new), `src/lib/incomeMapping.test.ts` (new),
[src/lib/authLock.ts](../src/lib/authLock.ts)

**Phase complete when:**
- [ ] Editing income on device writes through to the Appwrite row (read back
      live); a failed write leaves local state intact with a warn log and no
      user-facing error. **Not yet exercisable** — there is no income-editing
      UI to drive `pushIncome` through yet (that's Phase 6); `incomeSync.ts` is
      wired and typechecked but unexercised end-to-end.
- [ ] Reinstalling and logging back in restores the income list; logging in with
      income already present leaves local state untouched. **Not run** — same
      category as Phase 4's live-execution boxes: needs a real device/simulator
      reinstall against a live account, left for an explicit go-ahead rather
      than simulated.
- [x] Rounding round-trips: `1234.56` → `123456` → `1234.56` — asserted directly
      in `incomeMapping.test.ts` (plus 0 and a floating-point-noise case,
      `10.1 * 10` → `10100`).

**Note for Phase 6:** the first two boxes above will close naturally once the
Profile income list exists and calls `pushIncome`/`archiveIncome`/
`deleteIncome` — they're not blocked on anything except that UI.

---

## Phase 6 — Multi-income UI in Profile + the Family gate ✅ Done (device check outstanding)

- [x] Replaced the single income card with an income **list**: one row per
      active source showing label, amount and set-aside, plus an "Add income"
      action. The inline-edit interaction is the one #150 established (tap →
      `CurrencyAmountInput` + `Check` to save) — no new modal, no new screen,
      no new input component. The one implementation detail beyond the plan's
      literal wording: the three-field form (label/amount/set-aside + save)
      is factored into a small sibling component, `IncomeEditForm`, reused for
      both "edit a row" and "add a row" — defined outside `Profile()` (not
      nested) so its `TextInput`s keep focus across Profile's re-renders
      rather than remounting every keystroke.
- [x] Each row edits three fields: label (`TextInput`, shown for every tier
      per **D4**), amount (`CurrencyAmountInput`), set-aside
      (`CurrencyAmountInput`, optional — an empty field maps to
      `saveAmount: null`). Amount must be > 0 to save, same defensive bar as
      the old `saveIncome()`.
- [x] A capacity summary line under the list: total income always shown when
      the list is non-empty, total set-aside shown only when > 0 (avoids a
      redundant "$0" line for users who haven't set one).
- [x] Remove-income `Alert.alert` confirm, mirroring `handleReset`'s
      cancel/destructive-confirm shape. This is a real delete (`deleteIncome`),
      not an archive — archiving is Phase 9's downgrade-retention path only.
- [x] **The Family gate.** "Add income" stays visible always (C13); when
      `incomeQuota.allowed` is false (`useEntitlements().incomes`) it opens
      `UpgradeModal` with `gateInfo('incomes', plan, tPlans)` — the exact
      `goals.tsx` pattern, reusing copy already translated in all 4 locales
      (no new gate copy needed).
- [x] The `?editIncome=1` deep link now opens the **first** income for editing
      when the list is non-empty, or the add-form when it's empty (previously:
      always opened the single scalar's editor).
- [x] New i18n keys added to **all four locales** (`profile.json`'s new
      `income` namespace: `addButton`, `defaultLabel`, `labelPlaceholder`,
      `setAsideLabel`, `setAsideHint`, `totalIncomeLabel`, `totalSetAsideLabel`,
      `emptyState`, `removeA11y`, `removeConfirmTitle`, `removeConfirmBody`,
      `removeConfirmCancel`, `removeConfirmConfirm`). Reused
      `profile.monthlyIncome` as the section header and `plans.gates.incomes.*`
      / `common:a11y.save` rather than duplicating them.

**Modified files:** [app/(tabs)/profile.tsx](../app/(tabs)/profile.tsx),
`src/lib/i18n/locales/{en,pl,hu,de}/profile.json`

**Phase complete when:**
- [ ] A Family user can add up to 3; the 4th "Add" opens the upgrade gate.
      **Logic verified by code review** (`incomeQuota.allowed` resolves
      through the same `checkQuota('incomes', ...)` path `goals.tsx` already
      uses for its quota, and `PLAN_CONFIG.family.quotas.incomes === 3` is
      unchanged from D1) — **not exercised on a real device.**
- [ ] A Beginner/Medium user sees their one income plus a visible "Add income"
      that opens the gate — never hidden, never disabled. Same: reasoned
      through the code, not run on device.
- [x] Totals (dashboard nudge, goals warning, `ContributionStep` percentage,
      and now Profile's own capacity summary) reflect the **sum** of active
      incomes — this was already wired in Phase 2 (`totalIncome(activeIncomes(...))`
      at every read site) and is exercised by `income.test.ts`'s existing
      `totalIncome`/`activeIncomes` coverage; Profile's new summary line uses
      the identical helpers, so no new totals logic was introduced to verify.
- [x] `locales.test.ts` passes — confirmed in the full suite run (424/424),
      no key present in one locale and missing in another.
- [ ] **Self-verified on device** — left for you, per standing preference: add
      a 2nd/3rd income as Family, confirm the 4th opens the gate; confirm a
      Beginner/Medium account sees the gate on income #2; confirm remove/edit/
      the `?editIncome=1` deep link from the dashboard nudge all behave as
      described above.

---

## Phase 7 — Set-aside becomes savings capacity and drives the date (D2) ✅ Done (device check outstanding)

The always-on half of D2: capacity is computed, it plans **new** goals, and it
becomes the yardstick for affordability warnings. Nothing existing is rewritten
here — that's Phase 8.

- [x] `src/lib/goalMath.ts`: added `projectedGoalDate(targetAmount, savedAmount,
      capacityShare, from?)` wrapping the existing `deriveGoalDate` for the
      remaining-amount case (an already-complete/overfunded goal short-circuits
      to "reached today" rather than going through deriveGoalDate's zero-branch,
      which would otherwise misreport a 10-year horizon), plus
      `capacityShareForGoal(totalCapacity, activeGoalCount)` splitting total
      capacity evenly across active goals. Pure, no new date arithmetic — both
      just call the existing `deriveGoalDate`.
- [x] `src/components/ContributionStep.tsx`: new optional
      `savingsCapacity?: number | null` prop. In contribution mode, when capacity
      > 0, it renders as the **first, pre-selected** suggestion chip ("From your
      income · X") ahead of the existing 10/15/20% chips, and a mount-only
      `useEffect` prefills the contribution input from it when the input is
      still empty — `contribution.reachGoalBy` then answers the date
      immediately, with no new date math (it already reacts to `contribution`
      changing). New i18n key `contribution.savingsCapacityChip` in all 4 locales.
- [x] `app/onboarding.tsx`: `provisionAccount` now mints `primaryIncome` with
      `saveAmount: monthlyContribution > 0 ? monthlyContribution : null` — the
      contribution the user just chose becomes their income's declared capacity
      (D2 + D3). Guarded against writing a meaningless `$0` set-aside if
      `monthlyContribution` were ever 0.
- [x] `app/(tabs)/goals.tsx`: the over-allocation warning (`savingsExceedsIncome`)
      now compares against a new `affordabilityBasis` — declared capacity
      (`totalSaveAside(incomes)`) when > 0, falling back to total income
      otherwise. Existing copy (`goals:review.warningMultiGoal`/
      `warningSingleGoal`) reused unchanged — no rewording needed.
- [x] Goal detail shows a read-only `detail.projectedFromCapacity` line under
      the existing "setting aside X/month" line, computed from this goal's
      capacity share (`capacityShareForGoal(savingsCapacity, activeGoalCount)`)
      — only rendered when capacity is declared, and never writes anything.
      Applying it is Phase 8.
- [x] Tests: extended `goalMath.test.ts` with **12 new cases** across
      `capacityShareForGoal` (even split, single-goal, zero capacity, negative
      capacity, zero goal count) and `projectedGoalDate` (matches
      `deriveGoalDate` on the remaining amount, partial-savings case,
      already-complete goal, overfunded goal, zero-capacity horizon cap,
      too-small-capacity horizon cap, and the explicit "splits across 2+ goals"
      case the plan called for).

**Modified files:** [src/lib/goalMath.ts](../src/lib/goalMath.ts),
[src/lib/goalMath.test.ts](../src/lib/goalMath.test.ts),
[src/components/ContributionStep.tsx](../src/components/ContributionStep.tsx),
[app/onboarding.tsx](../app/onboarding.tsx),
[app/(tabs)/goals.tsx](../app/(tabs)/goals.tsx),
`src/lib/i18n/locales/{en,pl,hu,de}/{goals,onboarding}.json`

**Phase complete when:**
- [ ] A new goal's contribution step opens pre-filled from capacity and shows
      its reach-date without the user typing anything. **Implemented and
      typechecked, not run on device** — same category as Phase 6's gate boxes.
- [ ] Onboarding's contribution answer lands in `incomes[0].saveAmount`.
      **Implemented** (traced by code review: `primaryIncome`'s `saveAmount`
      is set directly from `monthlyContribution` at the point it's minted) —
      **not exercised through a live onboarding run.**
- [x] Two active goals split capacity rather than each claiming all of it —
      directly unit-tested (`capacityShareForGoal(600, 3) === 200`, and the
      "splits capacity across 2+ goals" case in `projectedGoalDate`'s suite
      projects two different goals off the same per-goal share).
- [ ] The over-allocation warning fires against capacity, not income, when a
      set-aside is present. **Implemented** (`affordabilityBasis` prefers
      `savingsCapacity`) — `goals.tsx` has no test file (none of its logic is
      unit-tested, consistent with the rest of this component), so this is
      code-reviewed, not run.
- [x] No existing goal's stored `monthlyContribution` or `deadline` has
      changed — confirmed by diffing `goals.tsx`: this phase introduces zero
      new `updateGoal(...)` calls; the only new writes are local `const`s and
      one new read-only `<Text>` line.
- [x] `npm run test` green — 436/436 (424 baseline + 12 new `goalMath` cases).

---

## Phase 8 — Applying a capacity change to existing goals (ask, never assume) ✅ Done (device check outstanding)

The interactive half of D2. Two classes of goal behave differently, and the
distinction is already in the data model — `Goal.planningMode`
(`store.ts:71-77`):

- **`deadline` goals** — the user picked a real-world date (a wedding, a lease,
  a term bill). The date is a *constraint* and the contribution is derived from
  it. These are **never** rewritten; capacity only produces a warning when it
  doesn't cover the required contribution.
- **`contribution` goals** — the user said "I set aside $X/month, tell me when."
  The date is already *derived output*, not a choice, so refreshing it from real
  capacity keeps a derived value honest rather than overwriting a decision.

Even for contribution goals the change is **offered, not applied**: with two or
more goals, how capacity splits between them is itself a user choice the app
can't infer. This follows the two existing precedents for "a value changed
underneath, dependent data is now stale" — `downgrade-selection.tsx` refuses to
auto-archive and re-asks if dismissed (C4/C7), and `CurrencyConvertModal` asks
convert-vs-relabel rather than assuming (`settings.tsx:247-265`).

- [x] Detects the stale state: `capacityApplyCandidates(goals, totalCapacity,
      from?)` (`goalMath.ts`) — a pure selector, not a store field — computes
      which active, **contribution-mode** goals would land in a different
      month if capacity were applied right now. Called from `profile.tsx`'s
      `checkCapacityApply()` after every income edit/add/remove.
- [x] `CapacityApplyModal.tsx` (new), built on `BottomSheet` — the same
      primitive behind `UpgradeModal`/`CurrencyConvertModal` — lists each
      affected goal as `name` + `old date → new date`, with **Update goals**
      and **Not now**. There is no persisted "already asked" flag (unlike
      `retentionRequiredFor`, which exists because *that* trigger can arrive
      asynchronously from a web-driven downgrade while the app is closed);
      capacity changes only ever happen through this same screen, so
      dismissing and recomputing fresh on the next edit already satisfies
      "re-offer, don't go silent" without needing one.
- [x] Applying (`applyCapacityToGoals` in `profile.tsx`) writes each affected
      goal's `monthlyContribution` (its capacity share) and `deadline` through
      the existing `updateGoal` action — exactly the fields the plan named,
      nothing else on the goal touched.
- [x] **Deadline-mode goals are excluded from the sheet entirely**
      (`capacityApplyCandidates` filters `planningMode === 'contribution'`
      only — a goal with no `planningMode` at all, i.e. pre-flip, is treated
      as deadline too, matching `Goal`'s own doc comment) and instead get a
      `detail.capacityShortfallWarning` box in the goal detail view
      (`goals.tsx`), reusing the exact `AlertTriangle`/`bg-warning-container`
      treatment `ContributionStep.tsx` already uses for its income warning —
      shown when this goal's fixed required contribution exceeds its share of
      declared capacity.
- [x] New i18n keys added to **all four locales**: `goals.json`'s
      `applyCapacity.{title,body,notNow,updateGoals}` and
      `detail.capacityShortfallWarning`.
- [x] Tests: `capacityApplyCandidates` — **9 new cases** covering exactly what
      the plan asked for (capacity 0, capacity negative/unset, a genuine
      change, capacity-unchanged exclusion, deadline-mode exclusion,
      no-`planningMode` exclusion, archived exclusion, already-complete
      exclusion) plus the multi-goal split.

**Modified files:** [app/(tabs)/goals.tsx](../app/(tabs)/goals.tsx),
[app/(tabs)/profile.tsx](../app/(tabs)/profile.tsx),
[src/lib/goalMath.ts](../src/lib/goalMath.ts),
[src/components/CapacityApplyModal.tsx](../src/components/CapacityApplyModal.tsx) (new),
[src/lib/goalMath.test.ts](../src/lib/goalMath.test.ts),
`src/lib/i18n/locales/{en,pl,hu,de}/goals.json`

**Phase complete when:**
- [ ] Raising a set-aside offers to move affected contribution goals earlier;
      accepting updates them, dismissing changes nothing. **Implemented and
      typechecked, not run on device** — same category as Phases 6–7's
      device-dependent boxes.
- [x] A deadline-mode goal never appears in the sheet and never has its date
      changed — **asserted in tests**, not just inspection: the "never
      includes a deadline-mode goal" and "never includes a goal with no
      planningMode at all" cases in `goalMath.test.ts`.
- [ ] A deadline goal whose date capacity can't cover shows the shortfall
      warning. **Implemented** (`deadlineShortfall` in `goals.tsx`) —
      `goals.tsx` has no test file (none of its logic is unit-tested,
      consistent with Phase 7's equivalent box), so this is code-reviewed,
      not run.
- [ ] Dismissing and then changing capacity again re-offers rather than going
      silent forever. **Guaranteed by architecture, not scripted as a test**:
      there is no suppression flag anywhere in this design —
      `checkCapacityApply` recomputes `capacityApplyCandidates` fresh from
      current `goals`/`incomes` on every call, so a dismissed sheet has left
      no trace to suppress the next one. This codebase has no component-level
      test harness (every existing test file covers a pure `lib` module, none
      drive a screen's state machine), so scripting this specific claim
      end-to-end isn't available here — it follows from reading the code, not
      from a test asserting it.
- [x] `npm run test` green — 445/445 (436 baseline + 9 new
      `capacityApplyCandidates` cases).

---

## Phase 9 — Downgrade retention for incomes ✅ Done (device check outstanding)

Family(3) → Medium(1) is now a real over-limit case — precisely what
`downgrade-selection.tsx:11-16` said could not happen while income was a scalar.

- [x] `applyRetentionSelection` now takes `{ keepGoalIds, keepIncomeIds }` and
      archives non-kept **incomes** the same way it archives goals — sets
      `archived: true` only, never removes anything from the array (C4/C7).
      Also sets a new `capacityApplyPending` flag when an income was actually
      archived (see below).
- [x] `app/downgrade-selection.tsx` rewritten: an income section renders
      beside goals, driven by `requirement.toArchive.incomes`
      (`retention.ts:54-58`, unchanged — it already modelled incomes); real
      `keepIncomeIds` now goes into `validateRetentionSelection` instead of
      the hardcoded `[]`; the file header no longer claims incomes aren't
      selectable.
- [x] Archived incomes are excluded from totals/capacity/quota via
      `activeIncomes()` (unchanged chokepoint, already the case since Phase 1)
      and **stay visible** — Profile's income list now renders every income,
      not just active ones (previously it only rendered `activeIncomes(...)`,
      which would have made an archived row disappear entirely). Archived
      rows get a dimmed treatment and an "Archived" badge, staying editable/
      removable like any other row, mirroring how `goals.tsx` already lists
      archived goals unfiltered in its main list — with one improvement over
      that precedent: goals.tsx has *no* archived indicator at all, so I added
      a minimal one for income rather than blindly copying a gap.
- [x] **The stacking guard.** Archiving income sets `capacityApplyPending`
      (a new persisted store flag, mirroring `retentionRequiredFor`'s own
      persistence rationale) rather than computing/showing the apply-to-goals
      sheet on `downgrade-selection.tsx` itself. Profile picks the flag up in
      a `useEffect` keyed on `[capacityApplyPending]`, checks once, and clears
      it immediately — so the two sheets structurally cannot appear together:
      `CapacityApplyModal` is only ever imported/rendered in `profile.tsx`
      (confirmed by grep), never in `downgrade-selection.tsx`. A raw
      `[profile.incomes]` dependency was deliberately avoided here — it would
      also fire from ordinary time passing (a goal's projected date can drift
      from its stored one just by the calendar advancing), showing the sheet
      on unrelated Profile visits with no real capacity change behind it.
- [x] Confirming pushes archive state through `incomeSync.archiveIncome` for
      every income that lost its keep-selection (fire-and-forget, matching
      every other incomeSync write) — this is what makes the **B2** fix
      (Deep Analysis's archived filter, Phase 4) actually matter.
- [x] Extended `retention.test.ts` with the exact 3-incomes → Medium case the
      plan named (`evaluateDowngradeRetention('medium', { incomes: 3, ... })`
      → `toArchive.incomes === 2`).

**Modified files:** [src/lib/store.ts](../src/lib/store.ts),
[src/lib/storeMigrations.ts](../src/lib/storeMigrations.ts) (v9→v10, new field),
[src/lib/storeMigrations.test.ts](../src/lib/storeMigrations.test.ts),
[app/downgrade-selection.tsx](../app/downgrade-selection.tsx),
[app/(tabs)/profile.tsx](../app/(tabs)/profile.tsx),
[src/lib/retention.test.ts](../src/lib/retention.test.ts),
`src/lib/i18n/locales/{en,pl,hu,de}/{plans,profile}.json`

**Phase complete when:**
- [ ] A Family user with 3 incomes downgraded to Medium is asked to choose 1;
      dismissing archives nothing and re-asks later. **Implemented and
      typechecked, not run on device** — same category as every other
      screen-level box in Phases 6–8.
- [ ] Confirming archives the other 2 locally and server-side; totals,
      capacity, the quota count, the Coach's income line and Deep Analysis's
      `wage` all drop to the kept one. **Implemented** (each piece individually
      verified in its own phase: `activeIncomes()` in Phase 1/2, the server
      push in this phase, the Coach/Deep Analysis reads in Phase 4) — the
      full chain has not been exercised live end-to-end.
- [x] No income row is ever deleted by a downgrade — confirmed by reading the
      code: `applyRetentionSelection` only ever sets `archived: true` on a
      non-kept income, never filters one out of the array, and
      `incomeSync.archiveIncome` calls `tablesDB.updateRow` (a partial patch),
      never `deleteRow`.
- [x] The retention sheet and the capacity-apply sheet never appear at once —
      structurally guaranteed: `grep`-confirmed `CapacityApplyModal` is
      imported/rendered only in `profile.tsx`, nowhere in
      `downgrade-selection.tsx`, so there is no code path that could mount
      both at the same time.

---

## Phase 10 — Verification (automated checks done; live/device passes still owed)

- [x] `npm run typecheck` clean — re-run fresh at the start of this phase, no
      drift since Phase 9.
- [x] `npm run test` — **449/449**, well above the 390-test baseline, zero
      regressions across all 21 test files.
- [x] `npm run check:bundle-size` within budget — iOS bundle **6.41 MB / 7.63
      MB** (+0.62 MB over the pre-#191 baseline for the whole feature: new
      `income.ts`/`incomeMapping.ts`/`incomeSync.ts` modules, `CapacityApplyModal`,
      and the profile/goals/onboarding/ContributionStep additions).
- [ ] Full manual pass, self-verified — **not run.** This needs a real device/
      simulator session exercising the whole flow (fresh onboarding through
      downgrade archive), which is squarely the kind of UI verification you've
      asked me not to push through automation. Left for you; the walkthrough
      the plan specifies is still exactly:
      fresh onboarding (1 income, contribution seeds set-aside) → add a 2nd
      and 3rd as Family → 4th opens the gate → gate as Beginner → raise a
      set-aside and accept the apply-to-goals prompt → confirm a deadline-mode
      goal was untouched → currency switch converts all amounts and
      set-asides → reinstall restores the list → downgrade archive flow →
      Coach and Deep Analysis reflect the new totals.
- [ ] Live data check: one test account's `incomes` rows match the device
      exactly. **Not run** — this is a comparison *against* a real device
      session, so it's blocked on the manual pass above, not independently
      completable from here.
- [x] All five bugs **B1–B5** re-verified against live systems, fresh today
      (not just recalled from Phase 4):
      - **B1** — `CLAUDE_account_delete`: live `activeVersionId` still matches
        the version that added the incomes purge branch; description still
        lists `incomes` among the purged tables.
      - **B2** — confirmed as part of the same live Deep Analysis workflow
        check below (`SetPriorityInfo`'s `wage` still filters `!r.archived`,
        unchanged since Phase 4).
      - **B3** — `CLAUDE_onboarding`: live `activeVersionId` still matches the
        version using the client-supplied `incomeId`; description confirms it.
      - **B5 (swap)** — Deep Analysis workflow: live `activeVersionId` still
        matches the credential-swap version.
      - **B5 (rotation)** — **still open, still your call**: I have no way to
        confirm from here whether the exposed key was ever revoked in the
        Appwrite console — that action, if taken, wouldn't show up in any of
        the checks above.
      Also re-confirmed the live Appwrite `incomes` table is unchanged since
      Phase 3/9: `save_amount_cents` present, `$permissions: ["create(\"users\")"]`,
      `rowSecurity: true`.
- [ ] Close [#191](https://github.com/Koin-App-Official/pignify/issues/191) and
      open the PR — **not done yet, deliberately.** The `github-issues-prs`
      skill's own Phase 3 sequence is Verify → Close → Comment → PR, and
      verification isn't actually finished while the manual pass and live data
      check above are still outstanding. Closing the issue or opening the PR
      ahead of that would be asserting something not yet true. Ready to do
      both the moment you've run the manual pass (or tell me to proceed
      without it).

---

## Explicitly out of scope

- **Family plan *sharing*.** "Family" is a price tier with higher quotas, not
  multi-user households. All incomes belong to one account.
- **Income frequency/schedule** (weekly, biweekly, per-payday). Every amount
  stays monthly, as the whole app assumes today.
- **Silently rewriting goals from capacity.** Phase 8 always asks, and never
  touches a deadline-mode goal at all.
- **Server-side quota enforcement.** Income limits stay UX gating, consistent
  with `entitlements.ts`'s own header note (assumption A2).
- **Changing the onboarding step machine.** D3 keeps it at one income.
