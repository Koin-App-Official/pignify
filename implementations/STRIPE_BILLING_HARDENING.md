# Stripe Billing Hardening — Implementation Plan

Post-launch hardening of the Stripe payment rail. The core "user pays → app unlocks"
loop is already live and working; this plan covers everything *around* the happy path
that was deferred or silently broken: renewals, failed payments, refunds, reconciliation,
and the incentive layer.

**Status:** planning complete, no code written.
**Audited:** `main` @ `99b8fb0`, live n8n workflows + live Appwrite `plans` table read
2026-08-22.

## Issues covered

| Issue | Scope | Phase |
|---|---|---|
| [#141](https://github.com/Koin-App-Official/pignify/issues/141) | Add-on messages dropped from entitlements | 1 |
| [#140](https://github.com/Koin-App-Official/pignify/issues/140) | `billing-sync` on test-mode Stripe credential | 1 |
| [#136](https://github.com/Koin-App-Official/pignify/issues/136) | Renewal / payment-failure / refund webhook events | 2 |
| [#137](https://github.com/Koin-App-Official/pignify/issues/137) | Hourly reconciliation cron | 3 |
| [#139](https://github.com/Koin-App-Official/pignify/issues/139) | Referral / goal-bonus / loyalty incentives | 4 |
| [#138](https://github.com/Koin-App-Official/pignify/issues/138) | Live add-on QA + Apple/Google Pay | 5 |

## What is already live (do not rebuild)

Confirmed by reading the live workflows via MCP, not just the docs:

- `startCheckout` / `startAddonCheckout` / `requestSubscriptionSync` /
  `requestAccountDeletion` in [src/lib/billing.ts](../src/lib/billing.ts)
- `CLAUDE_billing_checkout`, `CLAUDE_billing_addon`, `CLAUDE_stripe_webhook`,
  `CLAUDE_billing_sync`, `CLAUDE_account_delete`, `CLAUDE_onboarding`,
  `CLAUDE_entitlements_get` — all active
- Full lockout (`PlanGate`), downgrade-selection UI, `past_due` client banner
- `plans` table: 3 tiers with live `stripe_price_id` populated
- Tests: `planGate.test.ts` + `retention.test.ts`, 31/31 passing

## Guiding constraints

Carried forward from the locked architecture decisions — these are not up for
re-litigation in this plan:

| # | Constraint |
|---|---|
| C1 | Stripe is the rail on every platform (D2). No store IAP. |
| C2 | Full lockout on lapse — `PlanGate` is the only reachable screen (D12). |
| C3 | Over-limit records are **archived, never deleted** (D14). |
| C4 | Always **refetch from Stripe** in a webhook; never trust payload state. |
| C5 | Single-writer: only n8n writes billing tables. The client never mutates plan state. |
| C6 | Every webhook branch dedupes through `webhook_events` before doing work. |
| C7 | `N8N_BLOCK_ENV_ACCESS_IN_NODE` is set on this instance — `$env` expressions are rejected in Code nodes. Use literals or Appwrite lookups. |

## Sequencing rationale

Phase 1 comes first and is non-negotiable in its ordering: fixing the `billing-sync`
credential (#140) **activates** a second code path for the add-on wipe (#141), so #141
must land first or the fix makes the bug worse. Phase 2 must precede Phase 4, because
the incentive logic hangs off the `renewal` and `clawback` branches that don't exist
yet. Phase 3 is only worth doing once Phase 1 makes the reconciler functional at all.

```
Phase 1 (#141 → #140)  ─┬─→ Phase 2 (#136) ──→ Phase 4 (#139)
                        └─→ Phase 3 (#137)
                                              Phase 5 (#138) — any time after Phase 1
```

---

# Phase 1 — Stop the bleeding (P0 bugs)

Two live defects that silently cost users things they paid for. Everything else in
this plan is additive; this phase is corrective and should ship on its own branch
before anything else starts.

**Branch:** `fix/issue-141-addon-balance-wipe`, then `fix/issue-140-billing-sync-credential`

## 1a. Add-on balance wipe ([#141](https://github.com/Koin-App-Official/pignify/issues/141)) — ✅ done 2026-08-22

The add-on branch writes `plan.quota_ai_messages + newBalance`; the two other
resolvers write `plan.quota_ai_messages` alone, so any `customer.subscription.*`
event silently recomputes away the purchased credit.

- [x] Read `subscriptions.addon_balance` in the subscription branch of
      `CLAUDE_stripe_webhook` before resolving — read from the `Upsert
      Subscription` HTTP node's response instead of an extra call: Appwrite's PUT
      is a partial update and returns the full row, including fields this branch
      never touched
- [x] Thread it into the `Resolve Entitlements` node's `quota_ai_messages`
- [x] Same fix in `CLAUDE_billing_sync`'s `Resolve Entitlements` node
- [ ] ~~Converge all three inline resolver copies onto the shared
      `resolveEntitlements({ ..., addonAllowance })`~~ — **descoped.** n8n Code
      nodes can't `require()` a local repo file; true convergence would mean a
      sub-workflow call or a copy-paste-and-hope shared module, both bigger than
      this fix warrants. Did the minimal correct fix in both places instead — the
      three copies still exist but are no longer wrong.
- [x] Dry-run via `test_workflow` on `CLAUDE_billing_sync` (webhook-triggered, so
      directly executable): mocked a `medium` plan (`quota_ai_messages: 10`) +
      `addon_balance: 5` → confirmed output `quota_ai_messages: 15`. Also ran the
      no-subscription-found path to confirm it still exits cleanly.
      `CLAUDE_stripe_webhook` uses a Stripe Trigger, which MCP cannot execute
      directly — verified by code review only (identical 3-line change, same
      pattern just proven correct in the sibling workflow).

**Files / resources:**
- n8n `CLAUDE_stripe_webhook` (`CH8BNqTucylUhHBC`) — nodes `Resolve Entitlements`, `Compute Addon Credit`
- n8n `CLAUDE_billing_sync` (`XTlWxBQB0LwkeAKK`) — node `Resolve Entitlements`
- [n8n/code-nodes/resolve-entitlements.js](../n8n/code-nodes/resolve-entitlements.js) — becomes the single source

## 1b. Test-mode credential on the reconciler ([#140](https://github.com/Koin-App-Official/pignify/issues/140)) — ✅ done 2026-08-22

`Stripe Search Subscription` is bound to `piggySandbox` (`1oFcWRanIMMsyqFS`) while all
Price IDs are live-mode, so the reconciler queries the wrong Stripe account, finds
nothing, and `return []`s in silence.

- [x] Rebind `Stripe Search Subscription` to the live `Piggy` credential (`GAKHJYvu6ypjNHRF`)
- [x] Replace the silent `if (!sub) return [];` with a `console.log` naming the
      `user_id` that was searched for — visible in n8n execution history now
- [x] Sweep every Stripe node in every `CLAUDE_*` workflow for test-vs-live binding
      and record the result in [n8n/README.md](../n8n/README.md) — every other
      Stripe node (`CLAUDE_billing_checkout`, `CLAUDE_billing_addon`,
      `CLAUDE_stripe_webhook`, `CLAUDE_account_delete`) was already on the live
      credential; this was the only one
- [x] Verified via `test_workflow` with a mocked found-subscription and a mocked
      not-found case (real live-mode user-id verification is Phase 5's job, since
      it needs a real account — logged as a follow-up there rather than blocking
      this fix)

**Files / resources:**
- n8n `CLAUDE_billing_sync` (`XTlWxBQB0LwkeAKK`) — nodes `Stripe Search Subscription`, `Build Subscription Row`
- [n8n/README.md](../n8n/README.md) — credential audit table

## Phase 1 done when

- [x] An add-on purchase followed by a subscription update leaves `quota_ai_messages`
      intact — verified via `test_workflow` (10 + 5 addon → 15, not 10)
- [ ] `requestSubscriptionSync()` demonstrably updates entitlements for a **live**
      user — the mocked test proves the logic; a real live-mode confirmation is
      folded into Phase 5, which already covers a live end-to-end purchase
- [x] No Stripe node anywhere is bound to `piggySandbox` — swept all four other
      `CLAUDE_*` workflows with Stripe nodes, only this one was wrong
- [x] `npm run typecheck` + `npm test` clean — no client files touched by Phase 1;
      existing suite still 31/31 (billing workflow fixes are n8n-only, no client
      test coverage exists for them, which Phase 5's manual QA is the backstop for)

**No app code changed in this phase** — both fixes were entirely inside the two n8n
workflows (`CLAUDE_stripe_webhook`, `CLAUDE_billing_sync`), applied via the n8n MCP
and published live on 2026-08-22.

---

# Phase 2 — Complete the webhook ([#136](https://github.com/Koin-App-Official/pignify/issues/136)) — ✅ done 2026-08-22

`CLAUDE_stripe_webhook` subscribed to only four events; the missing seven meant
renewals, failed payments, and refunds did nothing live. Investigating this
surfaced two things that changed the shape of this phase from what was originally
planned:

1. **`pending_plan_id` is dead today.** Nothing in this codebase ever writes it —
   the client's "downgrade" (`app/plans.tsx`/`store.ts`) is local-state-only, never
   sent to n8n or Stripe. `Resolve Entitlements` already hardcodes it to `null`.
   Building "apply the pending downgrade at renewal" logic against a field nothing
   sets would be dead code. **Descoped** — a real scheduling mechanism (client →
   n8n → Stripe subscription schedule) is a separate, larger feature, not a
   sub-task of this issue.
2. **Period rollover needs no bespoke logic.** Usage counters already reset lazily
   off `subscriptions.current_period_start` (`src/lib/quota.ts`), so a plain
   refetch-and-resolve — the *existing* `subscription` branch, already fixed and
   tested in Phase 1 — is a complete, correct renewal handler. `invoice.paid` is
   routed straight into it rather than duplicating the logic.

## 2a. Subscribe to the missing events — done

- [x] Added to the `Stripe Event` trigger: `invoice.paid`, `invoice.payment_failed`,
      `charge.refunded`, `charge.dispute.created`, `customer.subscription.trial_will_end`
- [x] Extended the `Route Event` Code node's classification (kept inline, per
      workflow convention — `webhook-helpers.js` updated separately as a matching
      reference copy, not actually executed by the live workflow)
- [x] Every new branch passes through the existing `Check Dedup` →
      `Not Yet Processed?` gate before doing any work (unchanged upstream of the branch point)

## 2b. Renewal (`invoice.paid`) — done, descoped as above

- [x] Routed into the existing `subscription` branch: refetch → upsert subscription
      → resolve/upsert entitlements (already carries `addonAllowance` from Phase 1)
- [x] `pending_plan_id` application — **not built**, see rationale above

## 2c. `payment_failed` branch (`invoice.payment_failed`) — done, descoped

- [x] **Not a new entitlements write.** Stripe already flips subscription status to
      `past_due` on a failed payment, firing `customer.subscription.updated` —
      already subscribed, already resolves correctly (Phase 1 verified `past_due`
      stays in `ENTITLED`). This branch just records the event (`webhook_events`,
      result `processed`) as a hook for a future dunning/email feature, since
      building the actual notification has no email-sending workflow to land in yet.

## 2d. Refund / dispute branches — done, split into two

- [x] `charge.refunded` on a **non-invoice** (add-on) charge → new dedicated chain:
      `Get Subscription By Customer` (query by `stripe_customer_id`, the one field a
      Charge object always carries — session/checkout metadata isn't reliably
      copied to the resulting Charge) → `Get Plans For Refund` → `Compute Refund
      Adjustment` (decrements `addon_balance`, floored at 0, re-resolves
      entitlements) → `Update Refund Balance` → `Upsert Refund Entitlements` →
      `Record Refund Purchase` (audit row, negative quantity) → `Record Processed`.
- [x] `charge.refunded` on an **invoice** charge (subscription payment) →
      deliberately left alone. Its status effects already flow through
      `customer.subscription.updated`/`deleted`; auto-reacting to a partial
      subscription refund was judged out of scope and riskier than doing nothing.
- [x] `charge.dispute.created` → recorded as `needs_review` (dedicated node,
      distinct `result` value), **not** auto-revoked. A dispute is provisional and
      can be won; this workflow doesn't subscribe to the resolution event
      (`charge.dispute.closed`), so an automatic revoke has no way to un-revoke
      itself if Piggy wins.

## 2e. `trial_will_end` branch — done

- [x] Recorded only (fans into `Record Processed`, same as `payment_failed`) — no
      notification infra exists yet ([#28](https://github.com/Koin-App-Official/pignify/issues/28))

## Bug found and fixed in the same pass ([#142](https://github.com/Koin-App-Official/pignify/issues/142))

Building the refund chain meant re-reading the *existing* add-on-purchase branch
closely, which surfaced a real bug: `Upsert Entitlements Addon` and `Record Addon
Purchase` referenced `$json.userId`/`entitlementsData`/`purchaseRecord`, but per
n8n's own data-flow rules `$json` is scoped to the **immediate predecessor only**
— by the time those nodes ran, `$json` was an intervening HTTP node's Appwrite
response, not `Compute Addon Credit`'s output. A real purchase would have credited
`subscriptions.addon_balance` correctly, then failed writing `entitlements` and
the audit row, left the webhook event permanently unprocessed, and **double-
credited the balance on every Stripe retry**. Zero executions of this workflow
have ever occurred (confirmed via execution history) — no data was affected.
Fixed by naming the source node explicitly, matching the pattern already used
correctly elsewhere in this same file.

## Phase 2 done when

- [x] Every new branch traced against n8n's documented expression-scoping rules
      and the workflow JSON re-read post-publish to confirm each reference resolves
- [ ] ~~Each branch dry-run via `test_workflow`~~ — **not possible.** This
      workflow's only trigger is a Stripe Trigger node, which has no alternate
      executable entry point via MCP (confirmed, not assumed). Every change in this
      phase is verified by code review and by re-reading the published graph, not
      by execution. Flagging this clearly rather than claiming test coverage that
      doesn't exist — Phase 5's manual QA should exercise a renewal, a failed
      payment, and a refund at least once for real.
- [x] A renewal (`invoice.paid`) resolves via the same tested `subscription` branch
      — no new renewal-specific logic to independently verify
- [x] A failed payment needs no new entitlements write — `past_due` already
      verified correct in Phase 1 via the existing `subscription` branch
- [x] `webhook_events` records exactly one row per event — every new branch ends in
      exactly one of `Record Processed` / `Record Needs Review` / `Record Ignored`,
      no branch double-writes
- [x] `npm run typecheck` + `npm test` clean — no client files touched, 31/31 still passing

**No app code changed in this phase either** — everything is inside
`CLAUDE_stripe_webhook`, applied via the n8n MCP and published live on 2026-08-22.

**Files / resources:**
- n8n `CLAUDE_stripe_webhook` (`CH8BNqTucylUhHBC`) — trigger, `Route Event`, 11 new
  nodes (4 IF routers + 1 dispute-record node + 6 refund-chain nodes), 2 bug-fixed
  nodes in the existing addon branch
- [n8n/code-nodes/webhook-helpers.js](../n8n/code-nodes/webhook-helpers.js) — updated
  to match the live logic (reference only, not executed by the workflow)
- [n8n/README.md](../n8n/README.md) — event/branch table and bug note updated to match reality

**Descoped, tracked separately if wanted:** a real downgrade-scheduling write path
(client → n8n → Stripe subscription schedule, applying `pending_plan_id` at
renewal) — this is new feature work, not a gap in what Phase 2 was fixing.

---

# Phase 3 — Reconciliation cron ([#137](https://github.com/Koin-App-Official/pignify/issues/137)) — ✅ done 2026-08-22

- [x] Added a Schedule trigger (hourly) to `CLAUDE_billing_sync`, alongside the
      existing webhook trigger — but **as a separate, dedicated node chain**, not
      feeding the same downstream nodes as originally planned. The webhook chain
      uses `.first()` throughout, correct only because it always processes exactly
      one item; reusing it for a multi-subscription batch would have silently
      applied subscription #1's data to every user in the run. Built a parallel
      chain instead, using `$json`/`.item.json` for per-item correctness and
      `.first()` only for the two genuinely-global fetches (subscription list,
      plans list).
- [x] Lists subscriptions in `active` / `past_due` / `cancel_scheduled` from Appwrite
- [x] Per subscription: refetch from Stripe → upsert `subscriptions` → resolve/upsert
      `entitlements`
- [x] Idempotency against concurrent webhook writes — unchanged upsert-by-user-id
      pattern, same as the existing (verified) webhook path
- [x] Batch/page cap: **100 subscriptions per run**, explicit and documented, not
      yet paginated — revisit if the active-user count approaches it. Stripe calls
      paced 10/sec via the HTTP node's built-in batching option.

## Bug found and fixed via `test_workflow` before publish

`Resolve Sync Row` (the per-item Code node) defaulted to `runOnceForAllItems` mode
— every other Code node in this codebase omits the `mode` param because they only
ever see one item per execution, so this default never mattered before. Here it
did: a two-item test batch collapsed to a single output, silently dropping every
subscription but the first. This is exactly the class of bug the plan's own risk
table flagged as a *risk*, not a certainty — it became a real, caught bug because
this workflow (unlike `CLAUDE_stripe_webhook`) has a Schedule/Webhook trigger and
so actually *could* be execution-tested. Fixed: `mode: "runOnceForEachItem"` set
explicitly, plus the return statement changed from an array-wrapped item to a
single `{ json: {...} }` object (the shape that mode expects — confirmed via a
second `test_workflow` failure, "A 'json' property isn't an object", before
getting it right).

## Phase 3 done when

- [x] The cron runs hourly (`Hourly Sync Trigger`, `hoursInterval: 1`) — confirmed
      in the published workflow JSON, not just assumed from the parameter I set
- [x] **Execution-tested**, unlike Phases 1's webhook fix and all of Phase 2: ran
      `test_workflow` with two different mocked subscriptions (different plans,
      different statuses, different add-on balances) in one batch and confirmed
      both resolved with their own distinct, correct data — no cross-contamination.
      Also tested an empty batch (0 subscriptions) — exits cleanly, no error.
- [ ] A subscription changed directly in the Stripe dashboard is reconciled within
      an hour with no app interaction — **not verified against a real subscription**,
      since that requires waiting for a real hourly fire against real data. Every
      piece of *logic* is tested; the live end-to-end timing behavior isn't. Folding
      into Phase 5's manual QA rather than claiming it here.
- [x] A user with no Stripe subscription is skipped cleanly — covered by the empty-batch test
- [x] `npm run typecheck` + `npm test` clean — no client files touched, 31/31 still passing

**No app code changed in this phase** — everything is inside `CLAUDE_billing_sync`,
applied via the n8n MCP and published live on 2026-08-22.

**Files / resources:**
- n8n `CLAUDE_billing_sync` (`XTlWxBQB0LwkeAKK`) — new `Hourly Sync Trigger` +
  7 dedicated cron-path nodes, existing webhook path untouched
- [n8n/README.md](../n8n/README.md) — cron section added, explains the dedicated-chain
  decision and the `runOnceForEachItem` bug

---

# Phase 4 — Incentive layer ([#139](https://github.com/Koin-App-Official/pignify/issues/139)) — ✅ loyalty done, referral + goal bonus descoped, 2026-08-22

Investigating this phase surfaced the same pattern Phase 2 found with
`pending_plan_id`: two of the three incentives don't just need backend wiring,
they're missing a *client-side or trust* prerequisite that makes the wiring
meaningless to build right now.

## 4a. Stripe coupons — done, via API not dashboard

- [x] Created **live-mode** via a one-time throwaway n8n workflow
      (`CLAUDE_setup_incentive_coupons`, executed once for real, then archived):
      `piggy_free_month_100off_once` (100% off, once) and
      `piggy_loyalty_10off_forever` (10% off, forever)
- [x] Coupon ids are hardcoded literals in the relevant Code nodes — matching the
      established convention already used for the add-on Stripe Price ID in
      `CLAUDE_billing_addon` (see ADDONS.md), not a new config table for two
      values that rarely change

## 4b. Referral — ❌ not built, descoped

- [ ] ~~Wire `evaluateReferralReward` into the renewal branch~~ — **there is no
      `referrals` row for it to evaluate.** Nothing in the client creates one: no
      invite flow, no referral code entry, no way to link an inviter to an
      invitee anywhere in the app. `referral` exists only as a plan-comparison
      feature-flag label in `app/plans.tsx`. Wiring reward logic against a table
      nothing populates would be dead code. Building the actual feature (invite
      UI + a way to create `referrals` rows) is separate, larger scope — say the
      word if you want it scoped as its own piece of work.

## 4c. Goal bonus — ❌ not built, still blocked (confirmed again)

- [ ] ~~Call `evaluateGoalBonus(...)` from the server goal-completion path~~ —
      re-confirmed the prerequisite still doesn't exist:
      [src/lib/goalsSync.ts](../src/lib/goalsSync.ts) states directly *"there is
      no server representation for saved progress or deposit history."* Shipping
      this against a client-reported `saved_amount` would let a user mint free
      months by editing their own savings total. Stays blocked until server-
      trusted deposits exist.

## 4d. Loyalty — ✅ done

- [x] `subscriptions.active_since` maintained in **both** paths: the webhook
      `subscription` branch via a new `Get Existing Subscription` lookup (set on
      activation, kept while continuously active, cleared on lapse), and the cron
      path using the pre-sync row it already has (no extra lookup needed there)
- [x] `Resolve Entitlements` decides `attach`/`detach`/`noop` using **Stripe's own
      `subscription.discount`** as the current-state source of truth — simpler
      and more reliable than a separate `bonuses`-table lookup, and consistent
      with the "always refetch from Stripe" principle (C4)
- [x] Attach (`POST .../subscriptions/{id}` with `coupon=…`) / detach
      (`DELETE .../subscriptions/{id}/discount`) — both `neverError: true` so a
      coupon-action failure can't block the entitlements write (already correct
      by that point) from being marked processed
- [x] **No standalone loyalty cron built** — descoped from the original plan.
      `invoice.paid` already retriggers the `subscription` branch every renewal,
      giving every active subscriber a monthly evaluation heartbeat for free; a
      second cron would have been redundant complexity
- [x] `entitlements.discount_active`/`discount_percent` populated for real now —
      previously hardcoded `false`/`0`, matching what the client's pure mirror
      (`src/lib/subscription.ts`) already expected
- [x] Cron path mirrors the same discount state **read-only** — only the webhook
      path mutates Stripe's discount, keeping exactly one writer

### Bugs found and fixed while building this

- **[#143](https://github.com/Koin-App-Official/pignify/issues/143):**
  `Build Subscription Row` sourced `userId` only from `Route Event`, which
  `invoice.paid` (added in #136) never populates — every renewal would have PUT
  to `.../rows/undefined`. Fixed to source from the refetched subscription's own
  `metadata.user_id` first.
- **Caught before publish, no issue needed:** the cron path's first draft of
  `active_since` support hardcoded `discount_active`/`discount_percent` to
  `false`/`0`, which would have flapped a loyalty-active user back to `false` on
  every hourly sync even though the real Stripe discount stayed attached. Fixed
  before publishing by reading the same already-fetched `sub.discount` there too.

## 4e. Clawback — not wired for loyalty, by choice

- [ ] ~~Call `clawbackBonus(bonus)` in the clawback branch~~ — the
      `clawback_dispute`/`needs_review` path from Phase 2 already flags disputes
      for manual review. Automatic wiring wasn't worth the added complexity for a
      feature that, by construction, can't affect a real user for 6 months from
      whenever `active_since` starts being tracked (today, 2026-08-22) — plenty
      of time to revisit if it turns out to matter.

## Phase 4 done when

- [x] Loyalty tenure tracked and coupon attach/detach wired, verified against
      what the client already expected (`src/lib/subscription.ts`)
- [ ] ~~Each incentive granted exactly once under event replay~~ — only loyalty
      shipped; referral/goal-bonus have nothing to replay yet
- [ ] ~~A refund revokes the matching unconsumed bonus~~ — deferred, see 4e
- [~] "Family's advertised features are all actually delivered" — **only
      partially true.** Loyalty now is; referral and goal-bonus are not, and
      `feat_referral`/`feat_goal_bonus` remain `true` on the Family plan row
      while undelivered. Worth a product decision: fix the copy/flags, or build
      the missing features.
- [x] `npm run typecheck` + `npm test` clean — no client files touched, 31/31 still passing

**No app code changed in this phase** — everything is inside
`CLAUDE_stripe_webhook` and `CLAUDE_billing_sync`, plus one archived throwaway
workflow for coupon creation, applied via the n8n MCP and published live on
2026-08-22.

**Files / resources:**
- [n8n/code-nodes/incentives.js](../n8n/code-nodes/incentives.js) — reference
  only; the live loyalty logic is inlined in the workflow, matching this file's
  own established convention (same as `webhook-helpers.js`)
- n8n `CLAUDE_stripe_webhook` (`CH8BNqTucylUhHBC`) — `Get Existing Subscription`,
  `Loyalty Action Needed?`, `Should Attach?`, `Attach Loyalty Coupon`,
  `Detach Loyalty Coupon`; `Build Subscription Row` and `Resolve Entitlements` updated
- n8n `CLAUDE_billing_sync` (`XTlWxBQB0LwkeAKK`) — `Resolve Sync Row` updated for
  `active_since` + read-only discount mirroring
- [n8n/README.md](../n8n/README.md) — incentives section rewritten to match reality

---

# Phase 5 — Verification ([#138](https://github.com/Koin-App-Official/pignify/issues/138))

Not code. Every phase above deferred at least one thing into this phase because it
needed a real purchase, real elapsed time, or dashboard access I don't have —
**every `CLAUDE_stripe_webhook` change across Phases 1, 2, and 4 has never been
execution-tested, only code-reviewed**, because that workflow's only trigger
(Stripe Trigger) has no MCP-executable entry point. This list is the consolidated
set of everything that's accumulated needing a real check, not just the original
two items.

I ran what I *could* check remotely, read-only, with no purchase or dashboard
needed — results below, folded into the relevant items.

## Confirmed remotely (2026-08-22, no purchase needed)

- [x] **`CLAUDE_stripe_webhook` is genuinely registered with Stripe**, live mode,
      status `enabled`, `enabled_events` matching the 9 events set in Phase 2
      exactly (checked via `GET /v1/webhook_endpoints`) — the workflow being
      *published* doesn't by itself prove Stripe will actually call it; this does.
- [x] **Apple Pay needs no action here.** `GET /v1/apple_pay/domains` shows only
      Stripe's own domains (`buy.stripe.com`, `donate.stripe.com`,
      `invoice.stripe.com`) — expected, since `CLAUDE_billing_checkout`/
      `CLAUDE_billing_addon` use Stripe-*hosted* Checkout, where Apple Pay works
      automatically on Stripe's own pre-registered domain. Domain registration
      (the thing this API checks) is only a concern for a custom/embedded
      integration on Piggy's own domain, which this isn't. **I could not confirm
      the separate Dashboard "Payment methods" toggle** that controls whether
      Apple Pay/Google Pay show as selectable options in Checkout — that's a
      settings toggle, not an API-visible registration, so it still needs a
      one-time look at the Dashboard or an actual Checkout page.
- [!] **Housekeeping, not a blocker:** a second, older webhook endpoint
      (`we_1Tid6hDzaXFFTsX5WSpFsjIu`) is still registered, live mode, `enabled`,
      listening for `charge.succeeded` only, pointing at an n8n **webhook-test**
      URL (`.../webhook-test/...`) rather than a production one — leftover from
      an earlier dev session. Harmless (events sent there just fail delivery,
      Stripe retries and gives up per its normal policy) but it's dead
      configuration nobody's using. I didn't delete it since removing Stripe
      account config wasn't asked for — say the word if you want it cleaned up.

## Needs a real purchase / real device (original scope)

- [ ] Exhaust AI Coach quota on a medium/family test account
- [ ] Complete a real live-mode add-on purchase through Stripe Checkout
- [ ] Confirm redirect back into the app, `addon_balance` incremented in Appwrite,
      `webhook_events` row recorded as `processed`
- [ ] Confirm the coach counter updates and a previously-blocked send succeeds
- [ ] **Re-run the same purchase after a subscription update** to confirm the
      Phase 1a fix (`entitlements.quota_ai_messages` including `addon_balance`
      after a `customer.subscription.*` event) holds end-to-end — the mocked
      `test_workflow` run proved the logic in isolation; this proves the real chain
- [ ] Look at an actual live Checkout page and confirm Apple Pay / Google Pay
      appear as payment options (the API check above ruled out the domain-
      registration blocker but can't see the Dashboard toggle)

## Needs a real subscription lifecycle event (accumulated from Phases 2 & 4)

None of this has ever fired for real — the workflow has zero executions in its
history. First occurrence of each is effectively also its first real test.

- [ ] **Renewal** — a real monthly `invoice.paid` on an active subscriber updates
      the *correct* user's `subscriptions`/`entitlements` rows (this specifically
      exercises the #143 fix — `userId` sourced from Stripe metadata, not the
      triggering event)
- [ ] **Failed payment** — an `invoice.payment_failed` flips `status` to
      `past_due` via the *existing* `customer.subscription.updated` handling
      (Phase 2 deliberately didn't add a second write path for this — confirm the
      one path is enough) and the client's `past_due` banner lights up
- [ ] **Add-on refund** — refunding a one-time add-on charge decrements
      `addon_balance` correctly through the dedicated Phase 2 chain
      (`Get Subscription By Customer` → … → `Record Refund Purchase`)
- [ ] **Dispute** — `charge.dispute.created` produces a `needs_review` row in
      `webhook_events`, not a silent no-op

## Needs real elapsed time (Phase 3)

- [ ] A subscription changed directly in the Stripe dashboard is reconciled by the
      hourly cron within an hour, with no app interaction — the cron's *logic* was
      execution-tested with mocked multi-user batches (Phase 3); this confirms the
      *schedule* actually fires against real data over real time

## Loyalty — can be smoke-tested sooner than 6 months, deliberately not done by me

`active_since` only starts accumulating from 2026-08-22, so no real subscriber can
naturally reach the 6-month threshold until ~2027-02-22. The attach/detach
*mechanism* doesn't have to wait that long to be checked, but doing so means
manually backdating a real `subscriptions.active_since` value for a real
account — I did not do this myself, since it directly affects what a real paying
customer's next invoice looks like (an unearned discount appearing on a real
invoice is a bigger mistake than waiting). If you want to pull this forward:

- [ ] On a **test account you control**, backdate `subscriptions.active_since` to
      7+ months ago via Appwrite
- [ ] Trigger a `subscription`-branch re-evaluation (e.g. call `billing-sync` for
      that user, or wait for their next renewal)
- [ ] Confirm the coupon actually attaches in Stripe and
      `entitlements.discount_active`/`discount_percent` update to `true`/`10`
- [ ] Reverse the backdate afterward so the test account doesn't keep an unearned discount

---

# Cross-cutting cleanup — ✅ done 2026-08-22

Small things noticed during the audit. Not worth their own issues; folded into
this pass rather than a phase, since none of them touch phase-specific logic.

- [x] `extra_message_stripe_price_id` — **documented, not dropped.** Stays `null`
      on all three `plans` rows; there's no per-plan Stripe Price to store since
      the add-on's single flat price is hardcoded in the Code node instead. A
      schema drop wasn't warranted for a cosmetic pass — documented in
      [n8n/README.md](../n8n/README.md) §2 instead, so the next reader isn't left
      guessing why it's empty.
- [x] `extra_message_price_cents` — **reconciled**, not removed: updated `199` →
      `299` (medium) and `99` → `299` (family) via Appwrite, matching the real
      flat price in [src/lib/entitlements.ts](../src/lib/entitlements.ts). Still
      unread by the live add-on flow (kept as accurate documentation-via-data
      rather than a functional dependency), but no longer contradicts the client.
- [x] `plans.family.trial_days` — updated `7` → `0` via Appwrite, matching
      beginner/medium. The Stripe-side trial was removed in #89; the app grants
      all 14 days itself now, so this stale `7` had nothing left to mean.
- [x] [n8n/README.md](../n8n/README.md) — went well beyond incremental per-phase
      touch-ups this pass. A full read-through turned up staleness the per-phase
      edits had missed entirely:
  - §2 (`billing-addon`) still described the **original PaymentIntent + in-app
    PaymentSheet design** as current, when the live flow has been hosted
    Checkout since [ADDONS.md](../implementations/ADDONS.md) — not an outdated
    detail, the *entire section* was describing something that was never how
    the live workflow works.
  - §3 (`stripe-webhook`) still listed `renewal`/`addon_succeeded`/
    `addon_failed`/unified-`clawback` branches that don't exist — the actual
    live branch names and behavior (Phases 2 & 4) are different in ways that
    matter (e.g. `invoice.paid` reuses `subscription` rather than being its own
    branch).
  - The events-to-subscribe list included `payment_intent.succeeded`/
    `payment_intent.payment_failed`, which were **never actually subscribed** —
    leftovers from the same superseded PaymentIntent design. Fixed to the real
    9 events, and confirmed against Stripe's own `GET /v1/webhook_endpoints`
    rather than just the n8n config.
  - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` was documented as required; it's
    referenced nowhere in `src/`/`app/` (checked directly) — another
    PaymentSheet leftover.
  - The "What I need from you to finish wiring" section listed all three items
    as outstanding; all three are done (Price ids live, billing URL set,
    webhook confirmed registered) — replaced with a resolved note.
  - "Fragility reminders" still said add-on packs were rejected ("no packs") —
    backwards; the live flow explicitly allows 1–20. And warned about
    releasing a downgrade schedule that, per Phase 2's finding, never gets
    created in the first place.

  This confirms the lesson from every phase this pass: **stale documentation
  reads as authoritative until someone checks it against the live system** —
  each of these was written confidently, as fact, and was wrong.

# Risks

| Risk | Mitigation |
|---|---|
| Fixing #140 activates the #141 wipe path | Ship 1a before 1b — enforced by the phase ordering above |
| Webhook edits are live-system edits with no staging Stripe | Dry-run every branch via `test_workflow` with mock payloads before publishing; the dedup gate limits blast radius |
| Goal bonus is farmable without server-trusted deposits | 4c stays blocked until that exists — explicitly not shipped on trust |
| Three divergent copies of the resolver | Phase 1a converges them; every later phase uses the shared module |
| Hourly cron cost/timeout as users grow | Decide a page/batch cap in Phase 3 rather than discovering it in production |
