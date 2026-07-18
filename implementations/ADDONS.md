# Buy More AI Coach Messages (Stripe hosted checkout)

## Context

The AI Coach screen already has a quota-exhausted branch that routes straight to the "Upgrade your plan" modal — the code even has a comment flagging this as a stopgap ("Add-on message purchase is a separate flow; for now we route to the upgrade path", [coach.tsx:96-100](app/(tabs)/coach.tsx:96)). We're now building that deferred add-on purchase flow.

Decisions already made in conversation:
- Only **medium/family** users can buy add-ons (Beginner/`free` has `extraMessagePriceUSD: null` and must upgrade instead — confirmed still correct in [entitlements.ts:67](src/lib/entitlements.ts:67)).
- Payment happens on a **Stripe-hosted Checkout page** (same external-browser rail already used for subscription checkout), not in-app PaymentSheet, not native IAP.
- Stripe Price already created: `price_1ThcgbDzaXFFTsX5awf5NooM`, one-time, **adjustable quantity 1–20** (Stripe's own hosted page handles the quantity stepper — no app-side quantity picker needed).
- Purchased messages **roll over indefinitely** (no monthly expiry), unlike the plan's monthly quota.
- I will build the n8n workflow myself via the n8n MCP connection.

## Current architecture (confirmed by reading the code + live n8n/Appwrite state)

- **Subscriptions already work this way**: [billing.ts:70-101](src/lib/billing.ts:70) `createCheckoutSession`/`startCheckout` → POSTs to n8n workflow `CLAUDE_billing_checkout` → creates a Stripe Checkout Session (`mode: subscription`) → returns `{url}` → app does `Linking.openURL`. This is the exact pattern to mirror for the add-on, swapping `mode: subscription` for `mode: payment`.
- **The old add-on flow is dead code, unused, and wrong-shaped**: `createAddonPaymentIntent` ([billing.ts:118](src/lib/billing.ts:118)) and n8n workflow `CLAUDE_billing_addon` (id `r34lKDZcHITmbRLg`) create a Stripe **PaymentIntent** for in-app PaymentSheet confirmation — that assumption no longer applies now that we're using hosted checkout. I'll repurpose this same n8n workflow (same webhook path `billing-addon`, so no client env var changes needed) into a Checkout Session creator instead.
- **Stripe webhook receiver already exists and is live**: n8n workflow `CLAUDE_stripe_webhook` (id `CH8BNqTucylUhHBC`, **active**) listens to `checkout.session.completed` + subscription lifecycle events, dedupes via a `webhook_events` collection, and on subscription events upserts `subscriptions` + recomputes `entitlements`. Its own description says *"Renewal/addon/incentive branches deferred"* — this is exactly where the add-on credit branch belongs. Today, `checkout.session.completed` is unconditionally routed to the "subscription" branch (`Route Event` node), which would break on a one-time payment session (no `obj.subscription`). I need to add a real branch split.
- **Appwrite schema**: `subscriptions` table (one row per user, not period-scoped) is the right place for a persistent add-on balance — unlike `usage_counters`/`addon_purchases`, which are period-keyed (`idx_user_period`) and would reset with the period, contradicting "roll over indefinitely." I'll add a new `addon_balance` (integer, default 0) column to `subscriptions`.
- **Entitlements resolution has an unused hook for exactly this**: [subscription.ts:101,148,174](src/lib/subscription.ts:101) `resolveEntitlements()` already accepts `addonAllowance` and adds it to the AI-message quota. [quota.ts:35-51](src/lib/quota.ts:35) `evaluatePeriodicQuota(limit, used, allowanceBonus)` already does the same math. Neither is currently wired into the live client hook — `useEntitlements.ts` uses the simpler `checkQuota()` (no allowance param) instead. I'll switch it to `evaluatePeriodicQuota` and thread the new balance through, which is a small, already-designed-for change rather than new logic.
- **No live "pull fresh entitlements from Appwrite" path exists on the client today** — plan changes apply optimistically via `store.changePlan()` ([store.ts:292](src/lib/store.ts:292)), and `requestSubscriptionSync()` ([billing.ts:130](src/lib/billing.ts:130)) is dead code, never called. I'll follow the same established pattern (optimistic local update after a confirmed browser return) rather than inventing a new server-read pattern, but since we can't safely *guess* the purchased quantity from a redirect URL alone, I'll do one authoritative read via the already-configured `tablesDB` client ([appwrite.ts:33](src/lib/appwrite.ts:33)) right after return, not a blind optimistic increment.
- **App already supports deep links via Expo Router** — `app.json:5` sets `"scheme": "piggy"`, and Expo Router auto-maps `piggy://coach?...` to `app/(tabs)/coach.tsx` with query params readable via `useLocalSearchParams()`. No custom `Linking` listener needs to be built.

## Implementation checklist

### 1. Appwrite schema
- [x] Add `addon_balance` column (integer, required: false, default: 0) to the `subscriptions` table — persistent, non-expiring credit balance.

### 2. n8n: repurpose `CLAUDE_billing_addon` → Checkout Session creator
- [x] Edit workflow `r34lKDZcHITmbRLg` to mirror `CLAUDE_billing_checkout`'s `Stripe Create Checkout Session` node instead of creating a PaymentIntent.
- [x] Keep webhook path `billing-addon` (POST `{userId}` — no plan lookup needed, price is fixed).
- [x] Drop `Get Plans`/`Compute Addon`/`Create Addon Purchase` (pending-row) steps — not needed for Checkout Session flow.
- [x] New Stripe call: `mode=payment`, `line_items[0][price]=price_1ThcgbDzaXFFTsX5awf5NooM`, `line_items[0][adjustable_quantity][enabled]=true` (min 1, max 20), `client_reference_id`/`metadata[user_id]=userId`, `metadata[type]=extra_ai_message`, `success_url`/`cancel_url`. Note: this n8n instance has `N8N_BLOCK_ENV_ACCESS_IN_NODE` set, so `$env` expressions are rejected — `success_url`/`cancel_url` are hardcoded literals (`piggy://coach?addon=success|canceled`) instead of env vars.
- [x] Respond `{url}` (same shape as `CLAUDE_billing_checkout`).
- [x] (Found during hardening) Both this workflow's and `CLAUDE_billing_checkout`'s Stripe nodes had no credential bound / were bound to the test-mode `piggySandbox` credential while the Price IDs are live-mode — switched both to the live `Piggy | Onboarding` credential.

### 3. n8n: extend `CLAUDE_stripe_webhook` with an add-on branch
- [x] Edit `Route Event` code node to branch `checkout.session.completed` into `'addon'` vs `'subscription'` based on `metadata.type === 'extra_ai_message'`, capturing purchased `quantity` (derived from `amount_total / 299`).
- [x] Add a router branch for `branch === 'addon'`.
- [x] Upsert `subscriptions.addon_balance = current + quantity` (read-then-write).
- [x] Insert an `addon_purchases` record (`user_id`, `type: extra_ai_message`, `quantity`, `status: completed`, `period_key`) for historical record, written post-payment.
- [x] Re-run `Resolve Entitlements` → `Upsert Entitlements` including `addon_balance` in `quota_ai_messages`.
- [x] Record the event as processed in `webhook_events` (existing dedup pattern).
- [x] (Found during hardening) The `Stripe Event` trigger + `Refetch Subscription` nodes had no Stripe credential bound at all, meaning the live webhook was never actually registered with Stripe — fixed by binding the live credential and re-publishing; confirmed via Stripe's `/v1/webhook_endpoints` that registration succeeded.

### 4. Client: `src/lib/billing.ts`
- [x] Replace `createAddonPaymentIntent`/`AddonPaymentIntent` with `createAddonCheckoutSession(userId)` and `startAddonCheckout(userId?)`, mirroring `createCheckoutSession`/`startCheckout`. Same `ENDPOINTS.addon` path (`billing-addon`).
- [x] (Added during hardening) `console.warn` logging on every failure branch of `startCheckout`/`startAddonCheckout` — these silently swallowed errors before, making the "unavailable" fallback impossible to debug.

### 5. Client: `src/lib/store.ts`
- [x] Add `addonMessageBalance: number` (default 0, not month-keyed, no reset logic) + `setAddonMessageBalance` action.
- [x] Update `incrementCoachMessages` ([store.ts:448](src/lib/store.ts:448)) to draw from `addonMessageBalance` once the monthly plan quota is exhausted.

### 6. Client: `src/hooks/useEntitlements.ts`
- [x] Swap `checkQuota(plan, 'aiMessages', coachMessagesUsed)` for `evaluatePeriodicQuota(config.quotas.aiMessages, coachMessagesUsed, addonMessageBalance)` from `src/lib/quota.ts`.

### 7. Client: `app/(tabs)/coach.tsx`
- [x] Replace the upgrade-only branch at [coach.tsx:96-100](app/(tabs)/coach.tsx:96) with logic that also offers "buy more" when the plan has `extraMessagePriceUSD` (medium/family), calling `startAddonCheckout(userId)`.
- [x] Read `useLocalSearchParams()` for `addon=success|canceled`. On `success`: call `requestSubscriptionSync(userId)`, then read fresh `addon_balance` via `tablesDB.getRow(DATABASE_ID, 'subscriptions', userId)`, call `setAddonMessageBalance(...)`, then clear the query param via `router.setParams`.
- [x] Confirm header badge ("N messages left") reflects the updated `aiMessages` value once step 6 lands.

### 8. Client: `src/components/UpgradeModal.tsx`
- [x] Add optional `secondaryAction?: { label: string; onPress: () => void }` prop, rendered as a lower-emphasis second button below the main "Upgrade to X" button.
- [x] `coach.tsx` passes `{ label: 'Buy 1 more message · $2.99', onPress: onBuyMore }` only for the `aiMessages` gate on medium/family plans; omitted for the `aiCoach` gate (Beginner tier stays upgrade-only).

### 9. Client: `src/lib/entitlements.ts`
- [x] Update `extraMessagePriceUSD` for `medium` and `family` from `1.99`/`0.99` to `2.99` (single fixed Stripe price now). These values currently render on [plans.tsx:34-36](app/plans.tsx:34).

### 10. Config
- [x] Success/cancel URLs: hardcoded as `piggy://coach?addon=success` / `piggy://coach?addon=canceled` directly in the n8n node (not env vars — see note in section 2).
- [x] Stripe Price ID hardcoded in the `Build Checkout Params` code node: `price_1ThcgbDzaXFFTsX5awf5NooM`.

### 11. Critical bug found + fixed during testing (out of original scope, discovered via manual QA)
- [x] `app/plans.tsx`'s `onSelectPlan` applied the plan change the instant `startCheckout` returned `'completed'` — which only means the browser opened, not that payment succeeded. This caused the plan to switch even when the user backed out of Stripe Checkout without paying. Fixed: the plan is now only applied after a confirmed `checkout=success` deep-link return + a real sync/read from Appwrite, mirroring the add-on flow's pattern.
- [x] Fixed the resulting `router.back()` crash (`GO_BACK not handled`) on the Plans screen when reached via a deep link with no prior screen in the stack — now checks `router.canGoBack()` and falls back to the tabs home.

## Verification
- [x] Dry-run both edited n8n workflows via `test_workflow`/`execute_workflow` MCP tools with mock payloads before publishing.
- [ ] Manual end-to-end QA of a fully completed (real, live-mode) add-on purchase: exhaust AI Coach quota on a medium/family account → tap "Buy 1 more message" → complete Stripe checkout → confirm redirect back into the app → confirm `addon_balance` increments in Appwrite and a `webhook_events` row is recorded as `processed` → confirm the coach screen's counter updates and a blocked send now succeeds, drawing from the add-on balance. **Deferred until other cleanup is finished.**
- [x] Confirm the `aiCoach`-gated (Beginner) flow still shows only "Upgrade your plan" with no buy-more option.
- [x] Confirmed the plan-checkout flow no longer applies a plan change when the user backs out of Stripe Checkout without paying (critical bug found during manual QA — see section 11).
