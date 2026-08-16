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
   `plans` table / `PLAN_PRICES` env. **No `trial_period_days`** — the 14 free
   days are granted by the app at signup and tracked in
   `entitlements.trial_ends_at`, so a Stripe-side trial would double-count them
   (Family used to add 7 more, i.e. 21 free days). Anyone reaching checkout has
   already had their trial, so billing starts immediately.
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

## Stripe webhook — events to subscribe
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`,
`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`,
`charge.dispute.created`.

## App config (set in the Expo env / app.json `extra`)
- `EXPO_PUBLIC_N8N_BILLING_URL` = your n8n webhook base, e.g. `https://n8n.piggnify.com/webhook`
- `EXPO_PUBLIC_N8N_CHECKOUT_PATH` / `_ADDON_PATH` / `_SYNC_PATH` / `_ACCOUNT_DELETE_PATH`
  (defaults: `billing-checkout` / `billing-addon` / `billing-sync` / `account-delete`)
  — set to the n8n webhook ids.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for the PaymentSheet (add-on confirm), used
  in the enforcement/client phase.
- `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_SUPPORT_EMAIL` —
  optional; the Settings → Support & About rows only render when set (see
  `app/settings.tsx`). Not billing-related, just documented here alongside the
  other client env vars.

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
