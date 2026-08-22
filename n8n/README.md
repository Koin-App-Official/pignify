# Billing backend (n8n) — Stripe ⇄ Appwrite

Implements the billing architecture. The billing logic runs in **n8n** (same as
onboarding + AI coach). The React Native client talks only to these n8n webhooks
via `src/lib/billing.ts`; authoritative state flows **Stripe → n8n → Appwrite**
(`subscriptions` / `entitlements`), which the app reads.

> n8n workflows are built in your n8n UI — this folder gives you the **import-ready
> structure + the real Code-node logic** to drop in. The `code-nodes/*.js` files are
> validated, self-contained logic for the n8n **Code** nodes.

## Workflows

### 1. `billing-checkout` (client → checkout URL)

**Corrected here 2026-08-22** — this section previously described creating/
reusing a Stripe Customer and picking a price by country currency
(USD/PLN/HUF); neither is how the live workflow actually works. There is no
Customer object at all — each checkout is a bare Session — and `plans` has
exactly one `stripe_price_id` per plan, no per-currency variants; `country` is
read from the request and uppercased but never used to select a different price.

HTTP webhook `POST /billing-checkout` `{ userId, plan, country }`
1. **Appwrite GET** `plans` (list) → find `price_id` for `plan`.
2. **Appwrite GET** `users` row by id = `userId` (`neverError` — a failed/missing
   lookup degrades to no prefill, not a broken checkout).
3. **Code** (`Pick Price`): builds the Checkout Session body. **No
   `trial_period_days`** — the 14 free days are granted by the app at signup and
   tracked in `entitlements.trial_ends_at`, so a Stripe-side trial would
   double-count them (Family used to add 7 more, i.e. 21 free days). Anyone
   reaching checkout has already had their trial, so billing starts immediately.
   Includes `customer_email` from the `users` lookup when available — **prefills,
   does not lock**, the user can still edit it on Stripe's page.
4. **Stripe** create Checkout Session (`mode=subscription`,
   `subscription_data[metadata][user_id]`, `automatic_tax[enabled]=true`,
   `client_reference_id`, `customer_email` if resolved, success/cancel URLs).
5. **Respond** `{ url }`.

### 2. `billing-addon` (client → hosted Checkout for extra AI messages)
**Superseded design, corrected here 2026-08-22** — this section used to describe
a PaymentIntent + in-app PaymentSheet flow that was never how the live workflow
actually works; see [implementations/ADDONS.md](../implementations/ADDONS.md) for
the full pivot history.

HTTP webhook `POST /billing-addon` `{ userId }`
1. **Code**: fixed price `price_1ThcgbDzaXFFTsX5awf5NooM` ($2.99, one-time) — the
   same flat price for every plan, no `plans` lookup needed.
2. **Stripe** create Checkout Session (`mode=payment`, that price,
   `adjustable_quantity` 1–20 — Stripe's own hosted page handles the quantity
   stepper), `metadata={user_id,type:extra_ai_message}`, `client_reference_id`.
3. **Respond** `{ url }` — same shape as `billing-checkout`.

Crediting happens entirely in `stripe-webhook` on `checkout.session.completed`
(the `addon` branch below), not here — no `pending` `addon_purchases` row is
created upfront.

**Two Appwrite `plans` columns from the old per-plan-pricing design are now dead**
([cross-cutting cleanup](../implementations/STRIPE_BILLING_HARDENING.md#cross-cutting-cleanup)):
`extra_message_price_cents` is reconciled to `299` on medium/family (was
stale `199`/`99`) so it at least reads true even though nothing live consumes it;
`extra_message_stripe_price_id` stays `null` on all three plans — there's no
per-plan Stripe Price to store since the single price above is hardcoded in the
Code node, matching the same convention already used for it. Left as documented
dead columns rather than dropped, since a schema change wasn't warranted for a
cosmetic cleanup pass.

### 3. `stripe-webhook` (Stripe → Appwrite sync) — the core

**Stripe Trigger** node (auto-verifies signature) →
1. **Code** `Route Event` (inline in the workflow; `code-nodes/webhook-helpers.js`
   is kept as a matching pure-logic reference, not actually executed by n8n) →
   branch key.
2. **Appwrite GET** `webhook_events` by `stripe_event_id` → **IF exists, stop**
   (idempotency) — every branch below passes through this gate first.
3. Branch (as actually built, [#136](https://github.com/Koin-App-Official/pignify/issues/136)/[#139](https://github.com/Koin-App-Official/pignify/issues/139)):
   - **`subscription`** (`checkout.session.completed` [subscription mode],
     `customer.subscription.created/updated/deleted`, **and `invoice.paid`** —
     a renewal reuses this branch as-is, see the events section below) →
     **Stripe GET** subscription (refetch) + **Appwrite GET** the existing
     `subscriptions` row (for the loyalty tenure anchor) → **Code**
     `Build Subscription Row` → **Appwrite upsert** `subscriptions` →
     **Appwrite GET** `plans` → **Code** `Resolve Entitlements` (decides the
     loyalty coupon action too) → **Appwrite upsert** `entitlements` → loyalty
     attach/detach Stripe call if needed → **Appwrite POST** `webhook_events`.
   - **`addon`** (`checkout.session.completed` [payment mode]) → credit
     `subscriptions.addon_balance` + re-resolve entitlements + record an
     `addon_purchases` row, all inline (no separate `addon_succeeded`/
     `addon_failed` split — that was never how the live add-on flow works,
     see §2 above).
   - **`payment_failed`** (`invoice.payment_failed`) → recorded only, no
     entitlements write. `past_due` already flows via `customer.subscription.
     updated`, handled by the `subscription` branch above.
   - **`trial_will_end`** (`customer.subscription.trial_will_end`) → recorded only.
   - **`clawback_addon_refund`** (`charge.refunded`, non-invoice charge) →
     decrements `addon_balance` + re-resolves entitlements through a dedicated
     chain. A refund of a subscription-invoice charge is left alone (`ignore`).
   - **`clawback_dispute`** (`charge.dispute.created`) → recorded as
     `needs_review`, not auto-revoked.
4. **Appwrite POST** `webhook_events` (`eventRow`, `result=processed` /
   `needs_review` / `ignored`) at the end of every branch.

No `renewal`/`addon_succeeded`/`addon_failed`/unified-`clawback` branches exist —
those were the original design; what's actually live is simpler, see above and
the events section below for exactly why.

### 4. `billing-sync` (client/cron → recompute) — recovery
HTTP webhook `POST /billing-sync` `{ userId }`: refetch the user's Stripe
subscription → same mirror+resolve as the `subscription` branch. Backstop for
lost/delayed webhooks.

**Hourly cron ([#137](https://github.com/Koin-App-Official/pignify/issues/137),
live 2026-08-22):** a second trigger, `Hourly Sync Trigger` (Schedule, every hour),
on the *same workflow*. Lists `subscriptions` with `status` in
`active`/`past_due`/`cancel_scheduled` (capped at 100 per run — explicit choice,
not yet paginated; revisit if the active-user count approaches that), splits into
one item per subscription, refetches each from Stripe (paced 10/sec via the HTTP
node's batching option), and writes `subscriptions` + `entitlements` per user.

This is a **separate, dedicated node chain** from the webhook path above, not a
reuse of it. The webhook path's nodes use `$('Node').first().json` throughout,
which is correct there because a webhook execution always carries exactly one
Stripe event — but `.first()` always reads item 0 regardless of which item is
currently being processed, so reusing those same nodes for a multi-subscription
batch would have silently applied subscription #1's data to every user in the
run. The cron chain uses `$json` (immediate predecessor) for per-item data and
named `.item.json` references for paired-item lookups instead, with `.first()`
reserved for the two genuinely-global fetches (the subscription list and the
plans list, each fetched once per run regardless of batch size).

The per-item resolver (`Resolve Sync Row`) is an `n8n-nodes-base.code` node
explicitly set to `mode: runOnceForEachItem` — Code nodes default to
`runOnceForAllItems` (execute once total, no matter how many items arrive), which
is why every *other* Code node in this file omits the `mode` param: they only
ever see one item. This one doesn't, and needed it set. Caught via `test_workflow`
before publish — a two-item test batch was silently collapsed to one output item
until this was fixed, which would otherwise have looked like success while
dropping every subscription but the first on every real run.

### 5. `account-delete` (client → permanent delete) — Settings → Delete account
Import-ready: `workflows/account-delete.template.json`.

HTTP webhook `POST /account-delete` `{ userId }`, called synchronously by
`src/lib/billing.ts` `requestAccountDeletion()` — the client only wipes local
device state (PIN/session/store) after this responds success.
1. **Appwrite GET** `subscriptions` by `user_id` → existing row, if any.
2. **Code** `buildDeletionPlan` (`code-nodes/account-deletion.js`) → decides
   whether a live Stripe subscription needs canceling and lists the
   user-keyed tables to purge (`subscriptions`, `entitlements`, `devices`,
   `addon_purchases`, `goals`).
3. If `needsStripeCancel` → **Stripe** cancel the subscription immediately
   (not `cancel_at_period_end` — this is account deletion, not a downgrade).
4. For each table in the plan → **Appwrite** list rows by `user_id` then
   delete each (TablesDB REST has no delete-by-query).
5. **Appwrite** delete the `users` row directly by id — unlike the other
   tables, `users` rows are keyed by `$id` == the Appwrite Auth user id
   (no `user_id` column), so no list step is needed there.
6. **Appwrite** delete the Auth user via the **Users REST API**
   (`DELETE {APPWRITE_ENDPOINT}/users/{userId}`, server API key) — this is
   not possible from the client SDK, which is why deletion must go through
   n8n, same reason billing does.
7. **Respond** `{ ok: true }`.

⚠️ **Trust model**: like `billing-checkout`/`billing-addon`, this trusts the
client-supplied `userId` with no additional server-side session check —
consistent with the rest of this backend, but worth re-examining before
launch since deletion is higher-stakes than checkout.

## Trial entitlements (Onboarding v2, issue E)

> Live in `CLAUDE_onboarding` + `CLAUDE_entitlements_get`, not in the templates in
> this folder.

Every new signup gets a **14-day, no-card trial**. This is deliberately *not* a
transaction: there is no store product, no checkout, no receipt and no payment
provider involved. It is an entitlement the backend grants itself and lets lapse
on a timer, which is why it can ship before the payment rail (issue H) exists.

**Grant — `CLAUDE_onboarding` → `Build Trial Entitlements`**
Seeds the `entitlements` row as `status: trialing`, `effective_plan_id: family`,
`trial_started_at: now`, `trial_ends_at: now + 14d`, with Family's quotas and
features. The trial grants the *top* tier so the first two weeks show the product
at its best; the drop at day 15 is the conversion argument. `TRIAL_PLAN_ID` in
that node is the single place to change it. Falls back to `beginner` then to the
first plan row, so a missing plan degrades to a working account rather than
throwing mid-onboarding.

**Expiry — `CLAUDE_entitlements_get` → `Map Plan to App` → `Trial Just Expired?`**
There is **no cron**. A `trialing` row whose `trial_ends_at` has passed is
reported as `expired` + `locked` on the next read, mirroring the lazy period-key
pattern in `src/lib/quota.ts`.

The read also **writes the lapse back** to Appwrite (zeroing quotas and features
exactly as `code-nodes/resolve-entitlements.js` does for its locked branch).
Without that write-back, consumers that read the `entitlements` row directly —
`CLAUDE_coach_reply` — would keep seeing a stale `trialing` row and keep spending
against a Family AI allowance the user no longer has. The write-back node is set
to `neverError`, so a failed reconcile degrades to a stale row rather than 500ing
a plan read the app depends on.

**Response shape** (`GET /webhook/claude-plan?user_id=`):
`{ plan, quotaAiMessages, aiMessagesUsed, status, locked, trialEndsAt }`. The
first three are unchanged; the last three are additive, so older clients keep
working. `plan` still maps `beginner` → `free` for the app — that rename is
Onboarding v2 issue F.

**Schema added to `entitlements`** (2026-08-16): `trial_started_at` (datetime,
optional), `trial_ends_at` (datetime, optional), and `expired` appended to the
`status` enum so a lapsed trial is distinguishable from a cancelled paid
subscription — the win-back copy in issue G depends on that distinction.

## n8n credentials to configure
- **Stripe API** credential (secret key) — for Stripe nodes.
- **Appwrite** via **HTTP Request** nodes (no native n8n Appwrite node): base
  `{APPWRITE_ENDPOINT}/databases/piggnify_mobile_db/...` TablesDB REST, headers
  `X-Appwrite-Project`, `X-Appwrite-Key` (server key), `Content-Type: application/json`.
- **Stripe webhook signing secret** — on the Stripe Trigger node.

**Live-vs-sandbox credential audit (2026-08-22, [#140](https://github.com/Koin-App-Official/pignify/issues/140)):**
every Stripe node across `CLAUDE_billing_checkout`, `CLAUDE_billing_addon`,
`CLAUDE_stripe_webhook`, and `CLAUDE_account_delete` is bound to the live `Piggy`
credential (`GAKHJYvu6ypjNHRF`, also aliased `Piggy | Onboarding` on some nodes —
same credential id). `CLAUDE_billing_sync`'s `Stripe Search Subscription` node was
found bound to the test-mode `piggySandbox` credential and has been rebound to
`Piggy`. Re-run this sweep whenever a new Stripe node is added.

## Stripe webhook — events subscribed (live, 2026-08-22)

`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`,
`charge.refunded`, `charge.dispute.created` — 9 events, exactly matching
`CLAUDE_stripe_webhook`'s live Stripe Trigger node
([#136](https://github.com/Koin-App-Official/pignify/issues/136)).
**No `payment_intent.*` events** — an earlier draft of this doc listed
`payment_intent.succeeded`/`payment_intent.payment_failed`, left over from a
design where the add-on flow used a raw PaymentIntent; the live add-on flow uses
a full Checkout Session instead (§2 above), so those two were never subscribed
and never needed. Confirmed registered and `enabled` in live mode via
`GET /v1/webhook_endpoints` ([#138](https://github.com/Koin-App-Official/pignify/issues/138)
verification pass) — not just published in n8n, actually receiving events from Stripe.

See §3 above for what each event's branch does. Two bugs were found and fixed
while wiring this up:
- **[#142](https://github.com/Koin-App-Official/pignify/issues/142):** the
  pre-existing add-on branch referenced `$json` fields that only existed on an
  earlier node's output (`$json` is scoped to the immediate predecessor only) —
  would have credited `addon_balance` then failed the entitlements write,
  double-crediting on every Stripe retry. Zero executions had ever occurred, so
  no data was affected.
- **[#143](https://github.com/Koin-App-Official/pignify/issues/143):** the
  `subscription` branch sourced `userId` only from the triggering event, which
  `invoice.paid` never populates — every renewal would have written to
  `.../rows/undefined`. Fixed to source from the refetched subscription's own
  metadata instead.
- **[#141](https://github.com/Koin-App-Official/pignify/issues/141):** the
  `subscription` branch's `Resolve Entitlements` (§3) used to overwrite
  `quota_ai_messages` with the plan default on every `customer.subscription.*`
  event, dropping any `addon_balance` the `addon` branch had credited. Now reads
  it from the `Upsert Subscription` response and adds it in.
- **[#140](https://github.com/Koin-App-Official/pignify/issues/140):** see the
  credential-audit note above.

## App config (set in the Expo env / app.json `extra`)
- `EXPO_PUBLIC_N8N_BILLING_URL` = your n8n webhook base, e.g. `https://n8n.piggnify.com/webhook`
- `EXPO_PUBLIC_N8N_CHECKOUT_PATH` / `_ADDON_PATH` / `_SYNC_PATH` / `_ACCOUNT_DELETE_PATH`
  (defaults: `billing-checkout` / `billing-addon` / `billing-sync` / `account-delete`)
  — set to the n8n webhook ids.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — **dead, not referenced anywhere in
  `src/`/`app/`** (checked 2026-08-22). Was for an in-app PaymentSheet design;
  the live add-on flow uses hosted Checkout instead (§2 above), which needs no
  client-side Stripe SDK at all. Safe to remove from env config whenever
  convenient — not urgent, just unused.
- `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_SUPPORT_EMAIL` —
  optional; the Settings → Support & About rows only render when set (see
  `app/settings.tsx`). Not billing-related, just documented here alongside the
  other client env vars.

## Setup status — resolved

The three items this section used to list as outstanding are all done: Stripe
Price ids are live in the `plans` table for all three tiers (confirmed 2026-08-22),
`EXPO_PUBLIC_N8N_BILLING_URL` is set (`eas.json`/`.env`), and the webhook is
confirmed registered and `enabled` in live mode (see the events section above) —
which wouldn't be possible without a working signing secret on the Stripe Trigger
node, so that's implicitly confirmed too.

## Incentive workflows (referrals, goal bonus, loyalty)

Logic lives in `code-nodes/incentives.js` (pure, validated). `bonuses` is the
idempotency ledger; `referrals` tracks the relationship. `active_since` (loyalty
tenure anchor) was added to `subscriptions` (2026-06-13).

**Live status ([#139](https://github.com/Koin-App-Official/pignify/issues/139), 2026-08-22) — loyalty only, the other two are descoped:**

- **Stripe coupons created** (live mode, via a one-time throwaway workflow, since
  archived): `piggy_free_month_100off_once` (100% off, once) and
  `piggy_loyalty_10off_forever` (10% off, forever).
- **Loyalty — live.** `subscriptions.active_since` is now maintained by both the
  `subscription` branch in `CLAUDE_stripe_webhook` (via a new `Get Existing
  Subscription` lookup — set on activation, kept while continuously active,
  cleared on lapse) and `CLAUDE_billing_sync`'s cron path (which already has the
  pre-sync row, so no extra lookup needed there). `Resolve Entitlements` decides
  `attach` / `detach` / `noop` using **Stripe's own `subscription.discount`** as
  the current-state source of truth — no separate `bonuses`-table lookup needed —
  and a dedicated Stripe API call (`POST .../subscriptions/{id}` with `coupon=…`,
  or `DELETE .../subscriptions/{id}/discount`) attaches/detaches it. Only the
  webhook path mutates the Stripe-side discount; the cron path mirrors the
  resulting state read-only, so there's exactly one writer. `entitlements.
  discount_active`/`discount_percent` are populated for real now, matching what
  the client's pure mirror (`src/lib/subscription.ts`) already expected.
  **No standalone loyalty cron workflow was built** — `invoice.paid` already
  retriggers the `subscription` branch every renewal, giving every active
  subscriber a monthly evaluation heartbeat for free.
- **Referral — NOT built, descoped.** `evaluateReferralReward` needs a `referrals`
  row to evaluate, but nothing in the client creates one — there is no invite
  flow, no referral code entry, no way to link an inviter to an invitee anywhere
  in the app (`referral` only appears as a plan-comparison feature-flag label in
  `app/plans.tsx`). Wiring the backend reward logic against a table nothing
  populates would be dead code, the same shape of gap `pending_plan_id` turned
  out to be for downgrade scheduling. Building the actual referral feature (an
  invite UI + a way to create `referrals` rows) is separate, larger scope.
- **Goal bonus — NOT built, still blocked.** Confirmed again while building this:
  `src/lib/goalsSync.ts` states directly *"there is no server representation for
  saved progress or deposit history."* `evaluateGoalBonus` needs a server-trusted
  `saved_amount` to guard against a user editing their own savings total to mint
  free months — that trust boundary doesn't exist yet.
- **Clawback — not wired for loyalty.** The `clawback_dispute`/`needs_review` path
  from #136 already flags disputes for manual review; a human can revoke a
  loyalty bonus by hand for the rare case of an upheld dispute on a loyalty-
  discounted subscription. Automatic wiring was judged not worth the added
  complexity for a feature (loyalty) that, by construction, can't affect a real
  user for 6 months from whenever `active_since` starts being tracked.

## Fragility reminders
- **F-ADDON (superseded 2026-08-22):** originally per-message PaymentIntent +
  on-session confirm, "no packs." The live flow is hosted Checkout with
  adjustable quantity 1–20 instead (§2 above) — packs *are* allowed now, the
  opposite of the original decision. EU SCA/3DS still applies on Stripe's
  hosted page same as any card payment; no client-side handling needed either way.
- **F-SCHED — not applicable, no scheduling mechanism exists.** This originally
  warned about releasing/replacing a Stripe subscription schedule on a second
  downgrade. There is no schedule to manage: nothing in this codebase ever
  creates one — `pending_plan_id` is written by nothing and stays hardcoded
  `null` (see the events section above). Revisit this warning if a real
  downgrade-scheduling feature ever gets built.
- Always **refetch from Stripe** in the webhook; never trust payload state — this
  one's still true everywhere and worth keeping front and center.
