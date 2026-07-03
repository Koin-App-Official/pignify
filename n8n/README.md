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
HTTP webhook `POST /billing-checkout` `{ userId, plan, country }`
1. **Appwrite GET** `subscriptions` by `user_id` → existing customer id (if any).
2. **Stripe** create Customer if none (`metadata.appwrite_user_id=userId`).
3. **Code**: pick `price_id` by `plan` + country currency (USD/PLN/HUF) from the
   `plans` table / `PLAN_PRICES` env; set `trial_period_days=7` iff `plan=family`.
4. **Stripe** create Checkout Session (mode=subscription, `metadata.user_id`,
   `automatic_tax.enabled=true`, success/cancel URLs).
5. **Respond** `{ url }`.

### 2. `billing-addon` (client → PaymentIntent for 1 extra AI message)
HTTP webhook `POST /billing-addon` `{ userId }`
1. **Appwrite GET** `subscriptions` (customer id, plan) + `entitlements` (period).
2. **Code**: amount = `plans.extra_message_price_cents` for the plan; `period_key`
   from current period (`code-nodes/period-key.js`).
3. **Appwrite POST** `addon_purchases` row (`status=pending`, `period_key`).
4. **Stripe** create PaymentIntent (`amount`, currency, `customer`,
   `metadata={user_id,type:extra_ai_message,addon_id,period_key}`,
   idempotencyKey = addon row id).
5. **Respond** `{ clientSecret, paymentIntentId, amountCents, currency }`.

### 3. `stripe-webhook` (Stripe → Appwrite sync) — the core
**Stripe Trigger** node (auto-verifies signature) →
1. **Code** `routeEvent` (`code-nodes/webhook-helpers.js`) → branch key.
2. **Appwrite GET** `webhook_events` by `stripe_event_id` → **IF exists, stop**
   (idempotency).
3. Branch:
   - `subscription` → **Stripe GET** subscription (refetch!) → **Code**
     `buildSubscriptionRow` → **Appwrite upsert** `subscriptions` → **Appwrite GET**
     `plans` → **Code** `resolveEntitlements` → **Appwrite upsert** `entitlements`.
   - `renewal` (`invoice.paid`) → refetch subscription → roll period → apply
     `pending_plan_id` (+ validate `plan_change_requests` retention) → new
     `period_key` → re-eval loyalty (≥6mo tenure), goal bonus (annual), referral
     first-month → resolve + write.
   - `addon_succeeded` → **Appwrite** upsert `usage_counters` (`+allowance_bonus`,
     `addonAllowanceUpdate`) + set `addon_purchases.status=confirmed`.
   - `addon_failed` → `addon_purchases.status=failed`.
   - `payment_failed` → status `past_due` + resolve.
   - `clawback` (refund/dispute) → revoke add-on/bonus/access as applicable.
   - `trial_will_end` → notification only.
4. **Appwrite POST** `webhook_events` (`eventRow`, `result=processed`).

### 4. `billing-sync` (client/cron → recompute) — recovery
HTTP webhook `POST /billing-sync` `{ userId }` (also run by a **Schedule** trigger
hourly over all active subs): refetch the user's Stripe subscription → same
mirror+resolve as the `subscription` branch. Backstop for lost/delayed webhooks.

## n8n credentials to configure
- **Stripe API** credential (secret key) — for Stripe nodes.
- **Appwrite** via **HTTP Request** nodes (no native n8n Appwrite node): base
  `{APPWRITE_ENDPOINT}/databases/piggnify_mobile_db/...` TablesDB REST, headers
  `X-Appwrite-Project`, `X-Appwrite-Key` (server key), `Content-Type: application/json`.
- **Stripe webhook signing secret** — on the Stripe Trigger node.

## Stripe webhook — events to subscribe
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`,
`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`,
`charge.dispute.created`.

## App config (set in the Expo env / app.json `extra`)
- `EXPO_PUBLIC_N8N_BILLING_URL` = your n8n webhook base, e.g. `https://n8n.piggnify.com/webhook`
- `EXPO_PUBLIC_N8N_CHECKOUT_PATH` / `_ADDON_PATH` / `_SYNC_PATH` (defaults:
  `billing-checkout` / `billing-addon` / `billing-sync`) — set to the n8n webhook ids.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for the PaymentSheet (add-on confirm), used
  in the enforcement/client phase.

## ⚠️ What I need from you to finish wiring
1. **Stripe IDs** (Products already created): per-plan **Price ids** for **USD / PLN /
   HUF**, the **extra-message Price-or-amount** per plan, and the **coupon ids**
   (loyalty 10% forever, free-month 100% once). → I'll write these into the Appwrite
   `plans` table (`stripe_price_id`, `extra_message_stripe_price_id`, ...) via MCP.
2. **n8n billing webhook base URL** (+ the three webhook ids) → into the app env above.
3. Confirm the **Stripe webhook signing secret** is set on the Stripe Trigger node.

## Incentive workflows (referrals, goal bonus, loyalty)

Logic lives in `code-nodes/incentives.js` (pure, validated). Stripe coupons:
free-month = `100% off, once`; loyalty = `10% off, forever`. `bonuses` is the
idempotency ledger; `referrals` tracks the relationship.

- **Referral reward** — extend the `stripe-webhook` **renewal** branch: on the
  invitee's first non-trial `invoice.paid`, call `evaluateReferralReward(referral,
  isFirstPaidInvoice)`. If `grant`, create the two `bonuses` rows, set
  `referrals.status=rewarded`, and attach a free-month coupon to each user's next
  invoice. Idempotent via `referrals.status` + `bonuses.source=referralId`.
- **Goal bonus** — in the **server goal-completion path** (deposit ledger crossing
  target; ⚠️ requires server-trusted `saved_amount`), call `evaluateGoalBonus(...)`
  with the user's prior goal bonuses + `targetMinCents` floor. Annual cap + per-goal
  idempotency built in. On `grant`, create the `bonuses` row + free-month coupon.
- **Loyalty** — a **Schedule (cron)** workflow + the renewal branch: per active
  user call `loyaltyDecision({activeSince, status, featLoyaltyDiscount,
  hasActiveLoyaltyBonus})` → `attach` (create 10%-forever coupon + `bonuses`
  active) / `detach` (remove coupon + `bonuses` expired) / `noop`. Maintain
  `subscriptions.active_since` via `nextActiveSince(...)` in the `subscription`
  branch (set on activation, cleared on cancel/lapse).
- **Clawback** — in the `clawback` branch (`charge.refunded`/dispute) call
  `clawbackBonus(bonus)` to revoke unconsumed bonuses + detach coupons.

`active_since` (loyalty tenure anchor) was added to `subscriptions` (2026-06-13).

## Fragility reminders (from the billing doc)
- **F-ADDON:** per-message PaymentIntent + on-session confirm → EU SCA (PL/HU) will
  prompt 3DS on most add-on charges. Accepted (no packs).
- **F-SCHED:** a cancel or a second change while a downgrade schedule exists must
  release/replace the schedule — handle in the `subscription` branch.
- Always **refetch from Stripe** in the webhook; never trust payload state.
