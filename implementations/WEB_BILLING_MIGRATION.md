# Web-only billing migration — remove every Stripe correlation from the app

> **Issue:** [#173](https://github.com/Koin-App-Official/pignify/issues/173) · **Branch:** `feat/issue-173-web-billing-migration`
> **Driver:** App Store readiness audit, Blocker 1 (Guideline 3.1.1 — subscriptions sold through
> external Stripe Checkout opened by the app itself). Chosen remedy is audit **Option 3**: the app
> carries no purchase path at all; subscription management lives on the web.
> **Target surface:** `https://piggnify.com/account/`

---

## 1. Locked decisions

| # | Decision | Consequence |
|---|---|---|
| **D1** | The web billing page already exists at `https://piggnify.com/account/`. | No web code in this repo. Phase 0 still *verifies* it, because piggnify.com currently returns HTTP 200 with the marketing homepage for **every** path (`/account/`, `/zzz-does-not-exist-123`), so its existence could not be confirmed from here. |
| **D2** | `/plans` survives as a **read-only subscription screen**: current plan, status, renewal date, and what each tier includes — **no prices, no purchase buttons**. | Prices + a CTA are exactly what reads as an external purchase flow under 3.1.1. Feature comparison (which the upgrade gates point at) is kept. |
| **D3** | Exactly **one tappable link** to the web account page, in **Settings only**. **Amended by #199 (2026-10-10):** the locked screen gets a second link, since a locked user can't reach Settings. | Upgrade gates explain the situation in text but contain no link and no CTA. The locked screen links to the account page with neutral wording (no prices, no purchase CTA) and re-reads entitlements when the browser is dismissed. |
| **D4** | The Coach's "Buy 1 more message · $2.99" add-on is **removed from the app**. The balance is still read from the server and still spent normally; buying happens on the web. | The add-on rail (`CLAUDE_billing_addon` + the webhook's `addon` branch) stays live for the website. |
| **D5** | **No StoreKit / IAP** is added. | Deliberate. See [Appendix A](#appendix-a--app-review-posture) for what this costs and what it buys. |

**Non-goals:** building or changing the website; adding IAP; changing the Stripe product/price
catalogue; changing entitlement semantics (full lockout on cancel stays — decision D12/C3).

---

## 2. Current state — every Stripe correlation in the app

Verified against the working tree at branch point. This is the complete list; if something is not
here, it does not touch Stripe.

### 2.1 The seam itself

| File | What it does |
|---|---|
| [src/lib/billing.ts](../src/lib/billing.ts) | The only module that talks to the n8n billing webhooks. Exports `isBillingConfigured`, `createCheckoutSession`, `startCheckout`, `createAddonCheckoutSession`, `startAddonCheckout`, `requestSubscriptionSync`, `requestAccountDeletion`. Base URL from `EXPO_PUBLIC_N8N_BILLING_URL`. |

### 2.2 Call sites

| File:line | Call | Fate |
|---|---|---|
| [app/plans.tsx:181](../app/plans.tsx#L181) | `startCheckout(target, userID)` | **Delete** |
| [app/plans.tsx:135](../app/plans.tsx#L135) | `requestSubscriptionSync` after `checkout=success` | **Delete** (whole effect) |
| [app/plans.tsx:136-140](../app/plans.tsx#L136) | `tablesDB.getRow('subscriptions', userID)` — client reads a Stripe-shaped table | **Delete** |
| [app/plans.tsx:190-198](../app/plans.tsx#L190) | `__DEV__` "Simulate payment" branch | **Delete** |
| [app/(tabs)/coach.tsx:182](../app/(tabs)/coach.tsx#L182) | `startAddonCheckout(userID)` | **Delete** |
| [app/(tabs)/coach.tsx:212-220](../app/(tabs)/coach.tsx#L212) | `requestSubscriptionSync` + `subscriptions.addon_balance` read on `addon=success` | **Delete**, replaced by the entitlements read (Phase 2) |
| [src/components/auth/PlanGate.tsx:75](../src/components/auth/PlanGate.tsx#L75) | `startCheckout` from the locked screen | **Delete** |
| [src/components/auth/PlanGate.tsx:98](../src/components/auth/PlanGate.tsx#L98) | `requestSubscriptionSync` in `refreshAfterCheckout` | **Replace** with a forced entitlements refresh |
| [src/components/auth/PlanGate.tsx:57,219](../src/components/auth/PlanGate.tsx#L57) | `isBillingConfigured()` gating lockout + a warning banner | **Replace** (see Phase 4) |
| [app/delete-account.tsx:109](../app/delete-account.tsx#L109) | `requestAccountDeletion(userId)` | **Keep**, moved out of `billing.ts` |
| [src/components/auth/PlanGate.tsx:173](../src/components/auth/PlanGate.tsx#L173) | `requestAccountDeletion(userId)` | **Keep**, moved out of `billing.ts` |

### 2.3 Price / purchase surfaces (D2, D3)

| File:line | What renders |
|---|---|
| [app/plans.tsx:323](../app/plans.tsx#L323) | `$X.XX/mo` on every plan card |
| [app/plans.tsx:57](../app/plans.tsx#L57) | `" (then $2.99/msg)"` appended to the AI-messages bullet |
| [app/settings.tsx:304](../app/settings.tsx#L304) | `planStatus.priceMonthly` — `$5.99/mo` under the plan name |
| [src/components/UpgradeModal.tsx:93](../src/components/UpgradeModal.tsx#L93) | "Recommended plan · Family · $9.99/mo" + an **Upgrade to X** CTA |
| [src/components/auth/PlanGate.tsx:237](../src/components/auth/PlanGate.tsx#L237) | Three tappable priced tiers on the locked screen |
| [app/(tabs)/coach.tsx:137,542-544](../app/(tabs)/coach.tsx#L137) | `canBuyMore` → "Buy 1 more message · $2.99" secondary CTA |

### 2.4 Client-side plan mutation (must not survive a server-authoritative model)

| Store action | Callers today | Fate |
|---|---|---|
| `changePlan` | `app/plans.tsx:121,166,234` only | **Delete** |
| `applyDowngradeWithRetention` | `app/downgrade-selection.tsx:75` | **Replace** with archive-only `applyRetentionSelection` |
| `cancelPlan` | *none* (already dead) | **Delete** |
| `clearPendingPlan` | *none* (already dead) | **Delete** |
| `applyPendingPlan` | *none* (already dead) | **Delete** |

### 2.5 Config

- `EXPO_PUBLIC_N8N_BILLING_URL` — [eas.json](../eas.json) (all three profiles) and `.env`.
- `EXPO_PUBLIC_N8N_CHECKOUT_PATH` / `_ADDON_PATH` / `_SYNC_PATH` / `_ACCOUNT_DELETE_PATH` — read in
  `billing.ts`, set nowhere (defaults are used).
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — already dead, documented as such in `n8n/README.md`.

### 2.6 Backend — no schema work needed

Confirmed live via MCP against Appwrite project `6a15741300220ae26d13`, database `piggnify_mobile_db`
(10 tables) and the n8n instance (8 `CLAUDE_*` workflows, all active):

- `subscriptions` (15 columns incl. `stripe_customer_id`, `stripe_subscription_id`, `addon_balance`)
  and `entitlements` (28 columns) **stay exactly as they are**. The app stops reading `subscriptions`
  directly; nothing else changes.
- **Not one Appwrite column is added, removed, or altered by this migration.**
- The only backend edits are two hardcoded Stripe return URLs and one additive field on the
  entitlements read — all in n8n (Phase 1).

---

## 3. Target architecture

```
BEFORE                                    AFTER
------                                    -----
app ──startCheckout()──▶ n8n ──▶ Stripe   app ──(read only)──▶ CLAUDE_entitlements_get ──▶ Appwrite
  ▲                                  │      │
  └── piggy://plans?checkout=success ┘      └── Settings link ──▶ piggnify.com/account (web)
                                                                      │
                                            Appwrite ◀── n8n ◀── Stripe ◀── web checkout
                                               │
                                               └──▶ app reads entitlements on foreground / on return
```

The app becomes a **pure reader** of entitlement state. Every write path to Stripe — checkout,
upgrade, downgrade, cancel, add-on purchase — moves to the website. The one server call the app keeps
that has a Stripe side effect is account deletion (it cancels the subscription server-side), which is
not a purchase and cannot be done from the client SDK.

---

## Phase 0 — Verify the web surface and freeze the contract

No code. This phase exists because the app is about to delete its only payment path, and every
assumption about what replaces it is currently unverified.

- [ ] Open `https://piggnify.com/account/` in a **mobile browser, signed out**. Record what happens
      (sign-in form? redirect? marketing page?).
- [ ] Sign in as a real test user and confirm each action the app is dropping is reachable there:
  - [ ] subscribe from no subscription
  - [ ] upgrade to a higher tier
  - [ ] downgrade to a lower tier
  - [ ] cancel (and confirm it presents as end-of-period, matching constraint C3)
  - [ ] buy extra AI messages (the `$2.99`, quantity 1–20 add-on)
  - [ ] see current plan, status, and renewal/period-end date
- [ ] Confirm **who calls the n8n webhooks** for those actions. `CLAUDE_billing_checkout` and
      `CLAUDE_billing_addon` are `POST` webhooks with **no auth**, taking a client-supplied `userId`
      — if the website calls them from the browser, that `userId` is spoofable and any visitor can
      mint a Checkout Session for another account. Record the finding either way; if it is
      browser-side, open a follow-up issue (do not fix it in this migration).
- [ ] Confirm how the website identifies the Appwrite user id, and that it matches
      `profile.userID` / `entitlements.user_id` exactly (same id space, no email-keyed lookup).
- [ ] Decide and write down the **canonical URL string** the app will ship, including trailing slash:
      `https://piggnify.com/account/`. Confirm it is stable and will not be renamed.
- [ ] Confirm the page is reachable and legible in all four app locales (`en`, `pl`, `hu`, `de`), or
      accept English-only and note it.

**Phase complete when:** every action the app is about to lose has been performed end-to-end on
`https://piggnify.com/account/` from a phone browser by a real test account, the resulting plan
change was observed landing in Appwrite `entitlements`, and the canonical URL is written down here:

> Canonical account URL: `________________________`  · verified on `____-__-__` by `______`

---

## Phase 1 — n8n: move Stripe's return URLs off the app deep link

The two checkout workflows currently send the browser back to `piggy://…`, which only makes sense
when the app started the session. Once the website starts them, those redirects strand the user.

**Workflow: `CLAUDE_billing_checkout`** (id `Hss4ze1RGtT0PuJ6`) — done 2026-09-05

- [x] Node **`Pick Price`** (Code) — last two `pairs.push(...)` lines:
  - `success_url`: `piggy://plans?checkout=success` → `https://piggnify.com/account/?checkout=success`
  - `cancel_url`: `piggy://plans?checkout=canceled` → `https://piggnify.com/account/?checkout=canceled`
- [x] Update the workflow description to say the caller is the website, not the app.

**Workflow: `CLAUDE_billing_addon`** (id `r34lKDZcHITmbRLg`) — done 2026-09-05

- [x] Node **`Stripe Create Checkout Session`** (HTTP Request) — `bodyParameters`:
  - `success_url`: `piggy://coach?addon=success` → `https://piggnify.com/account/?addon=success`
  - `cancel_url`: `piggy://coach?addon=canceled` → `https://piggnify.com/account/?addon=canceled`
- [x] Update the workflow description likewise.

**Workflow: `CLAUDE_entitlements_get`** (id `z63gGIWFASF3ggtP`) — additive only, done 2026-09-05

- [x] Added `addonBalance` to the JSON response. Implemented as a new **`Get Subscription`** node
      (HTTP GET `subscriptions` by `user_id`, `neverError`) inserted between `Get Entitlements` and
      `Map Plan to App`, reading `addon_balance` from it (0 when no row, 0 when locked). This is what
      replaces the app's direct `subscriptions` table read in `coach.tsx`. Additive, so older clients
      are unaffected.
- [x] Established whether `entitlements.quota_ai_messages` **already includes** `addon_balance` —
      confirmed by reading `n8n/code-nodes/resolve-entitlements.js`: `aiQuota = plan.quota_ai_messages
      + allowance` where `allowance` is the addon balance. **Yes, it's already included.**
      `addonBalance` in the new response is a separate, additive figure for the client's own
      rollover spend-down tracking — honour this in Phase 5 (do not add it to `quotaAiMessages` again).

  > `quota_ai_messages` includes `addon_balance`: ☑ yes ☐ no — verified by Claude, reading
  > `n8n/code-nodes/resolve-entitlements.js` line `aiQuota = plan.quota_ai_messages + allowance`

**Left untouched initially, then fixed separately below:** `CLAUDE_stripe_webhook`
(`CH8BNqTucylUhHBC`), `CLAUDE_billing_sync` (`XTlWxBQB0LwkeAKK`), `CLAUDE_account_delete`
(`NejmQWYGvpJDsSaZ`), `CLAUDE_onboarding` (`FiA67LUzb5BF6csa`, still grants the 14-day trial),
`CLAUDE_coach_reply` (`2ZLK31SPSSrplvlO`).

- [x] Ran `test_workflow` on `CLAUDE_entitlements_get` (3 scenarios: active with balance, locked,
      trial-only/no-subscriptions-row — all correct) and inspected `CLAUDE_billing_checkout`'s real
      `Pick Price` output (`test_workflow` with the Stripe node pinned): `success_url` decoded to
      `https://piggnify.com/account/?checkout=success`. `CLAUDE_billing_addon`'s Stripe node has no
      Code node computing its URL — confirmed directly on the saved node parameters instead.
- [x] Published all three workflows.
- [x] Confirmed `CLAUDE_billing_sync`'s hourly cron runs successfully — **required fixing it first**,
      see below.

> **⚠️ Finding, fixed 2026-09-06, not part of this migration's own scope:**
> `CLAUDE_billing_sync`'s hourly cron (`Hourly Sync Trigger` → `List Subscriptions To Sync`) had
> **never succeeded** — `search_workflow_executions` showed 334/334 recorded runs at
> `status: "error"`, zero successes, all failing identically: `400` from Appwrite,
> `"Invalid \`queries\` param..."`.
>
> **Root cause:** the node sent two query-string parameters both named `queries[]` (one `equal`
> status filter, one `limit`) through n8n's HTTP node "keypair" query mode. n8n's underlying `qs`
> serializer defaults to `arrayFormat: 'indices'` for a repeated key, producing
> `queries[][0]=...&queries[][1]=...` — not the bare repeated-key form (`queries[]=...&queries[]=...`)
> Appwrite's PHP-style query parser expects. Appwrite received keys it didn't recognize as `queries`
> at all and rejected the whole param.
>
> **Fix:** rebuilt the request URL manually with the query string pre-encoded
> (`queries%5B%5D=<encoded filter>&queries%5B%5D=<encoded limit>`), bypassing n8n's array
> serialization entirely — the same manual-encoding pattern `CLAUDE_billing_checkout`'s `Pick Price`
> node already uses for its Stripe body, for the same reason (precise control over encoding).
>
> **Verified against live Appwrite, not just logic-checked:** ran `execute_workflow` in `manual`
> mode directly on the `Hourly Sync Trigger` node (execution `3116`) — the real trigger, the real
> credential, a real HTTP call. Result: `{"total":0,"documents":[]}`, a clean 200 instead of a 400.
> Cross-checked against the `subscriptions` table directly (`tables_db_list_rows`): it has **zero
> rows** right now, so the empty result is the correct answer, not a masked second bug. The
> **next real scheduled run (13:00 UTC, this was fixed at ~12:00 UTC) is the first hourly trigger
> execution that will exercise this path end-to-end** — worth a `search_workflow_executions` spot
> check after that time to see `status: "success"` from `mode: "trigger"`, not just `mode: "manual"`.
> Published as workflow version `fd7115e7-2afb-40dc-b889-63e1cf775fba`.
>
> The webhook path (`POST /billing-sync {userId}`, single-user sync) was never affected — separate
> node chain, no shared code with the broken one.

**Phase complete when:** a Checkout Session created by each workflow returns a user to
`piggnify.com/account/` rather than a `piggy://` deep link, verified on the real Stripe session
object; `CLAUDE_entitlements_get` returns `addonBalance`; and the `quota_ai_messages` question above
is answered in writing. **All met** (fully, as of 2026-09-06) — the billing-sync cron health check
surfaced a pre-existing outage that blocked it, which was then fixed and verified against live
Appwrite (see above), so Phase 2's "sole backstop" assumption now actually holds rather than resting
on an unfixed dependency.

---

## Phase 2 — App: build the new seam, delete the old one

- [x] **`src/lib/linking.ts`** — add next to `PRIVACY_URL` / `TERMS_URL` / `AI_TRANSPARENCY_URL`:
  ```ts
  /** Web billing/account management. The app has no purchase path of its own (issue #173). */
  export const ACCOUNT_URL = 'https://piggnify.com/account/';
  ```
  Keep it a plain constant, not an env var: it is a product URL like the other three, and an env var
  that can go missing is how the lockout trap in `planGate.ts` was created in the first place.
- [x] **New `src/lib/account.ts`** — move `requestAccountDeletion` here verbatim, with its own base
      URL so the word "billing" leaves the client entirely:
  ```ts
  const N8N_ACCOUNT_URL = process.env.EXPO_PUBLIC_N8N_ACCOUNT_URL ?? '';
  const ACCOUNT_DELETE_PATH = process.env.EXPO_PUBLIC_N8N_ACCOUNT_DELETE_PATH ?? 'account-delete';
  export function accountEndpointConfigured(): boolean;
  export async function requestAccountDeletion(userId: string): Promise<boolean>;
  ```
- [x] Repoint the two importers: [app/delete-account.tsx:23](../app/delete-account.tsx#L23) and
      [src/components/auth/PlanGate.tsx:34](../src/components/auth/PlanGate.tsx#L34).
- [x] **New `src/lib/entitlementsRefresh.ts`** — one shared refresh used by every caller, so the
      1-hour throttle in `(tabs)/_layout.tsx` can be bypassed on demand:
  ```ts
  /** Reads CLAUDE_entitlements_get and patches the store. `force` skips the hourly throttle —
   *  used when the user returns from managing billing on the web. Never throws. */
  export async function syncEntitlements(opts?: { force?: boolean; signal?: AbortSignal }): Promise<boolean>;
  ```
  Lift the body of `syncUserProfile` out of
  [app/(tabs)/_layout.tsx:54-75](../app/(tabs)/_layout.tsx#L54) into it unchanged (throttle read of
  `lastProfileSync`, the `profilePatch` assembly, `setServerAiMessageUsage`, `setLastProfileSync`),
  plus the new `addonBalance` → `setAddonMessageBalance` from Phase 1.
- [x] **`src/lib/entitlementsSync.ts`** — parse the new field: `if (typeof raw.addonBalance ===
      'number') result.addonBalance = raw.addonBalance;` and widen `EntitlementsSyncResult`.
- [x] **`app/(tabs)/_layout.tsx`** — replace the inlined `syncUserProfile` with
      `syncEntitlements({ signal })`.
- [x] **Delete `src/lib/billing.ts`.**

**Phase complete when:** `npx tsc --noEmit` passes, and
`grep -rniE "stripe|checkout" app/ src/ --include="*.ts" --include="*.tsx"` returns **zero** matches
outside deliberate historical comments (which Phase 8 rewrites anyway).

---

## Phase 3 — `/plans` becomes a read-only subscription screen (D2)

Rewrite [app/plans.tsx](../app/plans.tsx). It keeps its route, its modal presentation, and its
`?highlight=<plan>` parameter (the upgrade gates deep-link into it), and loses every mutation.

- [x] Delete the imports that no longer apply: `startCheckout`, `requestSubscriptionSync`,
      `isBillingConfigured`, `tablesDB`/`DATABASE_ID`, `canSubscribe`, `isUpgrade`, `isDowngrade`,
      `evaluateDowngradeRetention`, `changePlan`, `formatUSD`, `SUPPORT_EMAIL`.
- [x] Delete the `checkout=success` effect (lines 126-159) and the `checkout` search param.
- [x] Delete `onSelectPlan` (lines 161-241), `applyChange` (120-124), and the `busy`/`syncing` state.
- [x] Plan cards: drop the price element (line 322-325) and the `aiMessagesExtra` price suffix
      (line 57). Keep `displayName`, the Family star, and the full feature/quota bullet list.
- [x] Replace the per-card button block (lines 354-372) with a non-interactive state marker:
      current plan → a "Current plan" chip; every other tier → nothing at all. No `Button`, no
      `onPress`, nowhere on this screen.
- [x] Keep the trial banner, the `pendingPlan` banner and the status line — all read-only, all
      already driven by server-synced state.
- [x] Add a single plain-text line under the cards: *"Your subscription is managed on the web."*
      **Not tappable** (D3 puts the only link in Settings).
- [x] Keep [`<BillingTerms />`](../src/components/BillingTerms.tsx) — but reword `terms.cancel`,
      which currently claims *"Cancel anytime from Settings"* and has never been true (there is no
      in-app cancel; `cancelPlan` in the store is dead code). See Phase 7.
- [x] Rename the screen header from "Choose your plan" to "Your subscription" (`plans:header`).

**Phase complete when:** `/plans` renders correctly for each of `trialing` / `active` /
`cancel_scheduled` / `past_due` / `expired` / `canceled`, contains **no** `Button`, no `Pressable`
purchase affordance, and no currency string anywhere in its rendered output.

---

## Phase 4 — Upgrade gates and the locked plan gate

### 4.1 `UpgradeModal` (C13 — gated features stay visible)

- [x] [src/components/UpgradeModal.tsx](../src/components/UpgradeModal.tsx): delete the price block
      (lines 82-97) and `formatUSD`. Keep the recommended-plan name.
- [x] Change the primary CTA from `upgradeModal.upgradeToPlan` ("Upgrade to Family") to a neutral
      "See plan details", still routing to `/plans?highlight=<plan>` — which is now read-only.
- [x] `onUpgrade` prop → rename `onViewPlans` at all three call sites:
      [app/(tabs)/index.tsx:122](../app/(tabs)/index.tsx#L122),
      [app/(tabs)/goals.tsx:540](../app/(tabs)/goals.tsx#L540),
      [app/(tabs)/coach.tsx:157](../app/(tabs)/coach.tsx#L157).

### 4.2 `PlanGate` — the locked screen

This is the delicate one: a locked user cannot reach Settings (the gate replaces the whole navigation
stack), so under D3 they get no tappable link at all.

- [x] [src/components/auth/PlanGate.tsx](../src/components/auth/PlanGate.tsx): delete `subscribe()`
      (71-84), the `PlanChoice` list (230-244), the `PlanChoice` component (352-381), and `busy`.
- [x] Replace the tier list with plain, unlinked text naming the web page:
      *"Your subscription is managed at piggnify.com/account."*
- [x] `refreshAfterCheckout` → rename `refreshSubscriptionState`, drop `requestSubscriptionSync`, and
      call `syncEntitlements({ force: true })`. Keep the `AppState` background→active listener
      (lines 129-143) — it is now the main way a user who just subscribed on the web gets unlocked —
      and keep the manual "I've already subscribed" fallback.
- [x] Lockout enforcement: `lockoutEnforced(isBillingConfigured())` (line 57) →
      `lockoutEnforced(ACCOUNT_URL.length > 0)`. Keep the *structural* shape from
      [src/lib/planGate.ts:36](../src/lib/planGate.ts#L36) — the guarantee it encodes ("never trap a
      user behind an escape hatch that does not exist") is worth preserving even though a constant
      makes it always true today.
- [x] Update `planGate.ts`'s doc comment (lines 22-35), which explains the rule in terms of
      `EXPO_PUBLIC_N8N_BILLING_URL` — an env var that will no longer exist.
- [x] Delete the `!isBillingConfigured()` warning banner (219-225) and its
      `planGate.locked.checkoutNotConfigured` string.
- [x] Keep log out / contact support / delete account untouched — with no in-app purchase path these
      are now the *only* actions on this screen, which makes their correctness load-bearing.
- [x] Re-read [src/components/auth/LoginGate.tsx:139](../src/components/auth/LoginGate.tsx#L139),
      which references `billing.ts`'s simulate fallback in a comment.

**Phase complete when:** a user whose entitlements are `expired` sees the locked screen with no
purchase affordance; subscribing on the web in a phone browser and returning to the foregrounded app
clears the gate within one refresh, with **no** app restart and no deep link involved.

---

## Phase 5 — Coach: remove the add-on purchase, keep the balance (D4)

- [x] [app/(tabs)/coach.tsx](../app/(tabs)/coach.tsx): delete `buyMore` (180-203), the `addon=success`
      effect (212-224), the `addon` search param, `canBuyMore` (137), and the `secondaryAction`
      passed to `UpgradeModal` (542-544).
- [x] Keep `addonMessageBalance`, `setAddonMessageBalance`, and the spend path
      (`incrementCoachMessages` in [store.ts:838-851](../src/lib/store.ts#L838)) exactly as they are.
- [x] The balance is now refreshed **only** by `syncEntitlements` (Phase 2) via the new
      `addonBalance` field — confirm it lands on a fresh install with an existing balance, since the
      previous refresh point (the checkout return) is gone.
- [x] Honour the Phase 1 finding: if `quota_ai_messages` already includes `addon_balance`, make sure
      the client does not add it a second time on top of `serverAiMessagesQuota`.
- [x] The `aiMessages` gate keeps its title/description but loses its buy CTA — the user is told the
      allowance is used up and where more come from, without a purchase button.

**Phase complete when:** a user with a non-zero add-on balance can still spend it, the balance
survives a cold start, and no code path in `app/` or `src/` can increase it.

---

## Phases 2–5 — done 2026-09-05

Implemented as one change (`f18cc2e`..): Phase 2's new seam can't land without its three consumers
moving at the same time, since deleting `billing.ts` while `plans.tsx`/`coach.tsx`/`PlanGate.tsx`
still import it doesn't compile.

**Verified:** `npx tsc --noEmit` clean; `npm test` 390/390 green (4 tests removed with
`canSubscribe`); `grep -rniE "stripe|checkout" app/ src/` returns only accurate historical comments
about the *server-side* rail.

**Done beyond the phase list, because leaving it would have shipped a broken window:**
- **Env renamed early** (Phase 8.2's item): `EXPO_PUBLIC_N8N_BILLING_URL` → `EXPO_PUBLIC_N8N_ACCOUNT_URL`
  in `eas.json` (all 3 profiles) and `.env`. `account.ts` reads the new name, so deferring this to
  Phase 8 would have silently broken account deletion in every build in the meantime.
- **New i18n keys added to all four locales now** (part of Phase 8.1): `currentPlanChip`,
  `managedOnWeb`, `upgradeModal.seePlanDetails`, `planGate.locked.managedOnWeb`, plus reworded
  `header` and `terms.cancel`. `locales.test.ts` enforces en↔all parity, so a key added in `en`
  alone fails the suite — these could not wait for Phase 8. **Dead keys are still to be swept in
  Phase 8.1** (removal doesn't fail any test, so it was left where the plan put it).
- **`canSubscribe` deleted** from `planGate.ts` with its 4 tests — it existed only to decide whether
  to open checkout, so it went dead the moment `plans.tsx` stopped mutating plans.
- **Stale comments corrected** in `LoginGate.tsx` (referenced `billing.ts`'s simulate-payment path),
  `planGate.ts` (`lockoutEnforced` documented in terms of the removed env var; parameter renamed
  `billingConfigured` → `recoveryPathAvailable`), and `store.ts`.

**Gaps this surfaced — carry into Phase 6:**
- **`profile.currentPeriodEnd` now has no writer.** It was set only by the checkout-return path in
  `plans.tsx`. `CLAUDE_entitlements_get` doesn't expose `current_period_end` even though the
  `entitlements` row holds it, so renewal/cancellation dates fall back to the generic "the end of
  your billing period" string, and the trial-ending notification leans entirely on `trialEndsAt`.
  Fix by adding `currentPeriodEnd` to the plan-read response (same additive shape as `addonBalance`)
  and applying it in `syncEntitlements`.
- **`/downgrade-selection` is currently unreachable.** `plans.tsx` was its only entry point. Phase 6
  makes it reactive as planned — until then a web downgrade below the goal limit archives nothing.
- **`changePlan` / `cancelPlan` / `clearPendingPlan` / `applyPendingPlan` / `applyDowngradeWithRetention`
  are now all dead** in `store.ts`, exactly as Phase 6 anticipated. Left in place for that phase.

---

## Phase 6 — Store: delete client-side plan mutation, make retention reactive

The store currently lets the *client* grant itself a plan. With no in-app purchase, that is both dead
and dangerous (it is the same shape of hole as the "Simulate payment" button the audit flagged under
2.3.1).

- [x] [src/lib/store.ts](../src/lib/store.ts): delete `changePlan` (548-573), `cancelPlan`
      (584-586), `clearPendingPlan` (588-590), `applyPendingPlan` (592-607) and their interface
      declarations (362-379). The last three already have zero callers.
- [x] Replace `applyDowngradeWithRetention` (575-582) with an **archive-only**
      `applyRetentionSelection(keepGoalIds: string[])` — same archiving behaviour, no plan mutation.
- [x] `plan`, `planStatus`, `pendingPlan`, `currentPeriodEnd`, `trialEndsAt` stay as persisted
      fields, written only by `updateProfile` from the entitlements sync. **No persisted shape
      changes, so no `storeMigrations.ts` version bump.** Confirm this by re-running
      `src/lib/storeMigrations.test.ts`.
- [x] **Downgrade retention becomes reactive.** Today [app/plans.tsx:226-236](../app/plans.tsx#L226)
      calls `evaluateDowngradeRetention` *before* scheduling a downgrade. Downgrades now happen on
      the web, so the app learns about them after the fact — and constraint C4/C7 (never auto-delete;
      block until the user chooses what to keep) still has to hold.
  - [x] After `syncEntitlements` applies a plan change, evaluate
        `evaluateDowngradeRetention(newPlan, currentCounts)`. If `selectionRequired`, route to
        `/downgrade-selection` with the new plan as `target`.
  - [x] [app/downgrade-selection.tsx](../app/downgrade-selection.tsx): reword from "you are about to
        downgrade" to "your plan changed — choose what stays active", and call
        `applyRetentionSelection` instead of `applyDowngradeWithRetention`.
  - [x] [src/lib/retention.ts](../src/lib/retention.ts) is pure and needs **no** change; its tests
        stay green untouched.

**Phase complete when:** nothing in `app/` or `src/` can change `profile.plan` except the entitlements
sync; a plan downgraded on the web while the app is backgrounded prompts for a retention selection on
return; and `src/lib/retention.test.ts` + `src/lib/storeMigrations.test.ts` pass unchanged.
**Met** (done 2026-09-05) — `tsc` clean, 390/390 tests green, and a grep for all five removed actions
returns nothing.

### How the reactive prompt actually works

`syncEntitlements` evaluates `evaluateDowngradeRetention(profile.plan, …)` after applying server
state and writes the answer to a new `retentionRequiredFor: UserPlan | null` on the store. The tabs
layout watches it and pushes `/downgrade-selection`; `applyRetentionSelection` archives and clears it.

Three properties worth keeping in mind if this is touched again:
- **It's evaluated against the current plan, not a diff**, so it self-heals: upgrade back above the
  limit and the flag clears on the next sync without anything special.
- **Dismissing archives nothing.** The flag stays set, and a ref keeps the prompt to once per plan
  per session, so the ask returns on the next launch instead of fighting the user (C4/C7: no silent
  auto-archive, ever).
- **A locked user is never prompted** — `PlanGate` replaces the whole stack, so the tabs layout that
  watches the flag isn't mounted. The prompt lands after they subscribe again, which is the correct
  moment: the trial grants Family (unlimited goals), so someone who made five goals on trial and
  later subscribes to Beginner genuinely does need to choose.

### Deviations from the plan as written

- **One persisted field was added** (`retentionRequiredFor`), so the claim above that there are "no
  persisted shape changes" isn't quite true anymore. It still needs **no migration**: zustand's
  persist merges the stored blob over the initial state, so an older blob simply keeps the `null`
  default. `storeMigrations.test.ts` passes untouched, and `PIGGY_STORE_VERSION` stays at 8.
- **`currentPeriodEnd` was fixed here rather than left as a gap** (it was carried into this phase
  from Phases 2–5). `CLAUDE_entitlements_get` now returns `currentPeriodEnd` from the entitlements
  row — same additive shape as `addonBalance`, tested and published — and `syncEntitlements` applies
  it. Renewal and cancellation dates are real again instead of falling back to "the end of your
  billing period". Nothing on the client derives the date anymore.
- **`downgradeSelection.keepBody` reworded in all four locales** to lead with "Your plan is now
  {{plan}}…", since the screen now opens *after* the change rather than before it. Plural variants
  (`_one`/`_other`, and `_one`/`_few`/`_many` for `pl`) all updated.

---

## Phase 7 — Settings: the one link (D3)

- [x] [app/settings.tsx:280-313](../app/settings.tsx#L280): the Subscription card keeps its plan name
      and status line but **drops the price fallback** (`planStatus.priceMonthly`, line 304) — replace
      with a neutral status (e.g. "Active") so no currency renders in Settings.
- [x] Split the card into two rows:
  1. **Subscription** → `router.push('/plans')` (read-only detail) — unchanged behaviour.
  2. **Manage subscription** → `safeOpenURL(ACCOUNT_URL, …)`, which already routes https through
     `expo-web-browser` ([src/lib/linking.ts:27-30](../src/lib/linking.ts#L27)) so it opens in-app
     rather than switching to Safari. This is the **only** tappable billing link in the product.
- [x] Give it `accessibilityRole="link"` and a translated `accessibilityLabel` (consistent with
      `BillingTerms`, and it costs nothing toward the audit's VoiceOver item).
- [x] On return from that browser session, call `syncEntitlements({ force: true })` so a change made
      on the web is reflected immediately rather than up to an hour later.

**Phase complete when:** tapping "Manage subscription" opens `piggnify.com/account/` in the in-app
browser, and a plan change made there is visible in the app within seconds of dismissing it.
**Met** (done 2026-09-05) — `tsc` clean, 390/390 green.

**Shape as built:** the Subscription card (plan name + status, tap → read-only `/plans`) with a
separate **Manage subscription on the web** row beneath it. `grep -rn "ACCOUNT_URL" app/ src/`
confirms `safeOpenURL(ACCOUNT_URL, …)` appears exactly **once** in the whole app — decision D3 holds
mechanically, not just by intent. `PlanGate` references the constant only for the `lockoutEnforced`
check and renders `ACCOUNT_URL_DISPLAY` as unlinked text.

> **Superseded by #199:** `safeOpenURL(ACCOUNT_URL, …)` now appears **twice** — Settings and
> `PlanGate`'s locked screen, where `ACCOUNT_URL_DISPLAY` is the label of a link.

`openWebBilling` awaits `safeOpenURL` — which routes https through `expo-web-browser`, so it
resolves on dismissal — then calls `syncEntitlements({ force: true })`. That dismissal is the exact
moment a change made on the web should appear, and the forced read is what stops the hourly throttle
sitting on it.

**Also done here:** `Row` gained optional `accessibilityRole`/`accessibilityLabel` (the web row is a
`link`, everything else stays a `button`), and **`formatUSD` was deleted** from `entitlements.ts` —
its only job was rendering a plan price, so it died with the last paywall. `priceUSD` stays as
catalogue data mirroring the `plans` table, but nothing renders it; **that is now dead data worth a
decision in Phase 8** rather than something to delete silently.

---

## Phase 8 — Strings, config, and docs

### 8.1 i18n — all four locales (`en`, `pl`, `hu`, `de`)

`src/lib/i18n/locales.test.ts` enforces key-for-key parity with `en`, so every add/remove below must
land in all four files or the suite fails. Full delta in [Appendix B](#appendix-b--i18n-key-delta).

- [x] `plans.json` — remove 9 keys, reword 4, add 2 (×4 locales)
- [x] `coach.json` — remove 6 keys (×4 locales)
- [x] `settings.json` — remove 1, add 2 (×4 locales)
- [x] `common.json` — add 1 accessibility label (×4 locales)
- [x] Run `npx vitest run src/lib/i18n` — `locales.test.ts` and `contentParity.test.ts` must both pass.

### 8.2 Config

- [x] [eas.json](../eas.json): rename `EXPO_PUBLIC_N8N_BILLING_URL` → `EXPO_PUBLIC_N8N_ACCOUNT_URL`
      in **all three** profiles (`development`, `preview`, `production`). Same value.
- [x] `.env`: same rename.
- [x] `.env.appwrite.example`: check for and update any billing entries.
- [x] Confirm nothing else reads the old name:
      `grep -rn "N8N_BILLING\|CHECKOUT_PATH\|ADDON_PATH\|SYNC_PATH" . --exclude-dir=node_modules`.

### 8.3 Documentation

- [x] [n8n/README.md](../n8n/README.md): §1, §2, §4, and the entitlements response-shape section
      updated 2026-09-05 with dated notes matching the file's existing "corrected here" style
      (caller is now the website; `addonBalance` documented). **Still open:** the "App config"
      section still lists `EXPO_PUBLIC_N8N_BILLING_URL`/etc — those are app-side env vars renamed in
      Phase 8.2, not a Phase 1 (n8n-only) change; update this section together with 8.2.
- [x] [n8n/workflows/billing-checkout.template.json](../n8n/workflows/billing-checkout.template.json):
      return URLs updated to match live, 2026-09-05.
- [x] [implementations/APP_REVIEW_BLOCKERS.md](APP_REVIEW_BLOCKERS.md): record that Blocker 1 is
      resolved via Option 3 and link here.
- [x] [implementations/ADDONS.md](ADDONS.md): add a closing note — the add-on rail survives on the
      web, the in-app purchase path is gone.
- [x] [implementations/STRIPE_BILLING_HARDENING.md](STRIPE_BILLING_HARDENING.md): mark the
      client-side sections superseded.
- [x] [docs/ONBOARDING_FLOW.md](../docs/ONBOARDING_FLOW.md): re-check its billing references.
- [x] [README.md](../README.md): update if it describes an in-app payment path.

**Phase complete when:** `npm test` and `npx tsc --noEmit` both pass, and no document in the repo
still tells a reader the app opens Stripe Checkout. **Met** (done 2026-09-05).

### What the sweep actually removed

A script flattened every key in `en/{plans,coach,settings,common}.json`, stripped plural suffixes,
and checked each base key against the full text of `app/` + `src/`. **22 dead keys in `plans.json`**
(including the whole `buttons` object) and **6 in `coach.json`**, removed from all four locales — 112
deletions in total. A re-run reports **0 possibly-unused keys across all four namespaces**, so this
is verified rather than eyeballed. `settings.json`/`common.json` were already clean after Phase 7.

### Docs corrected beyond the list

Three more files made claims that had become false, so they were fixed rather than left to rot:
- [REVIEWER_DEMO_LOGIN.md](REVIEWER_DEMO_LOGIN.md) — said lockout is enforced "whenever billing is
  configured (`EXPO_PUBLIC_N8N_BILLING_URL` is set)". Now keyed on `ACCOUNT_URL`.
- [APP_REVIEW_SHOULD_FIX.md](APP_REVIEW_SHOULD_FIX.md) — its whole "Simulate payment" section
  describes code that no longer exists; marked moot, kept as history.
- [ONBOARDING_V2.md](ONBOARDING_V2.md) — carried an open task to set a variable that has since been
  renamed away, and a device-check item for a subscribe flow that no longer exists.

[ONBOARDING_FLOW.md](../docs/ONBOARDING_FLOW.md)'s billing paragraph was already accurate ("the app
only ever reads it") and is now literally true; its trust-model warning about browsers was upgraded
from hypothetical to live, since the checkout webhooks are browser-driven now.

### `priceUSD` — decided: keep

`PLAN_CONFIG[*].priceUSD` ($5.99/$7.99/$9.99) has no readers left after `formatUSD` went in Phase 7.
**Kept deliberately**, with a comment in `entitlements.ts` saying nothing renders it: it is catalogue
data mirroring the `plans` table's `price_cents`, not dead code, and it's what any future paywall or
IAP work would start from. Deleting a subscription product's price catalogue to satisfy a lint is the
wrong trade.

---

## Phase 9 — Verification

### 9.1 Automated — all four pass, 2026-09-05

- [x] `npx tsc --noEmit` — clean.
- [x] `npm test` — **390 passed / 19 files**. (The plan said 385/18 at audit time: +9 from the AI
      consent work that landed in between, −4 from `canSubscribe`'s tests removed in Phase 5.)
- [x] `npm run check:bundle-size` — **6.38 MB / 7.63 MB budget, within budget.** The reported
      "+0.60 MB vs baseline" is drift from the 2026-08-05 baseline, **not** from this branch: `main`
      measures 6.39 MB (+0.61) at `adb5a7f`, so this work is ~0.01 MB *smaller* than what it
      branched from. Checked by actually building both rather than assuming, since a deletion-heavy
      branch reporting +0.60 MB looks alarming until you know where the baseline sits.
      Worth ratcheting the baseline separately — that drift is someone else's to explain.
- [x] `grep -rniE "stripe|startCheckout|billing\.ts" app/ src/` → **4 matches, all comments, zero
      functional**: `plans.tsx`'s header (what the screen used to be), `account.ts`'s provenance
      note (split out of the old `billing.ts`), and two in `subscription.ts`/`store.ts` describing
      the *server* rail, which is still Stripe and still accurate.
- Also confirmed incidentally: the Metro build logs `env: export … EXPO_PUBLIC_N8N_ACCOUNT_URL`,
  so the Phase 8.2 rename resolves correctly through the real bundler pipeline, not just in tsc.

### 9.2 Manual, on a **production-profile** build (both platforms — Google Play polices external
purchase links too, and this change ships to Android as well)

- [ ] Fresh install → onboarding → trial granted → `/plans` shows the trial banner, no prices, no buttons
- [ ] Settings → "Manage subscription" opens the web page in the in-app browser and returns cleanly
- [ ] Subscribe on the web → return to app → plan updates without a restart
- [ ] Downgrade on the web to a tier with fewer goals → app prompts for retention selection
- [ ] Cancel on the web → app shows `cancel_scheduled`, then locks out at period end
- [ ] Locked screen → "I've already subscribed" refreshes; log out, contact support and delete
      account all still work
- [ ] Coach: quota exhausted shows the gate with no buy button; an existing add-on balance still spends
- [ ] Reviewer demo account: confirm the whole flow with the account seeded per
      [implementations/REVIEWER_DEMO_LOGIN.md](REVIEWER_DEMO_LOGIN.md)
- [ ] Airplane mode: no screen offers a broken purchase button (there are none left to break)

### 9.3 Close-out (per `/github-issues-prs`)

- [ ] Tick every checklist item on [#173](https://github.com/Koin-App-Official/pignify/issues/173)
- [ ] Completion comment on the issue
- [ ] PR `feat(#173): Remove in-app Stripe billing, move management to web` with `Closes #173`
- [ ] Add the App Review note from [Appendix A](#appendix-a--app-review-posture) to the submission
      notes in App Store Connect

**Phase complete when:** all of the above are ticked and the branch is merged.

---

## Appendix A — App Review posture

What this migration fixes and what it does not, so the submission notes can be written honestly.

**Fixed.** The app no longer creates Stripe Checkout Sessions, never calls `Linking.openURL` with a
payment URL, displays no prices, and contains no purchase button. Guideline 3.1.1's core objection —
*selling* subscriptions outside IAP — no longer describes the app.

**Residual risk 1 — the Settings link.** 3.1.1 also covers *"buttons, external links, or other calls
to action that direct customers to purchasing mechanisms other than IAP."* One neutral "Manage
subscription" row is the mildest form of this, and is how reader-model apps have long behaved, but it
is not zero risk outside the US. Since #199 there are two such links (Settings and the locked screen), both
neutral, with no prices and no purchase CTA. If review pushes back, the smallest possible retreat is
D3's third option: make them plain text rather than links. Decide that *before* submitting, not
during an appeal.

**Residual risk 2 — a locked user has no in-app path forward.** This is the known cost of Option 3
and was called out in the audit: an iPhone user who has not subscribed elsewhere cannot use the app,
which can attract 2.1 or 4.2. #199 softens this: the locked screen now links to the account page,
so getting the subscription back is one tap away rather than a URL to type. Mitigations already in place: the 14-day no-card trial means a new
reviewer is never locked; the reviewer demo account must be seeded with an **active entitlement**;
and the review notes should state plainly that subscriptions are sold only on the web and the app is
a client for an existing subscription.

**Unchanged by this work:** the audit's other two blockers (3.1.2 subscription disclosure — partly
mooted since there is no purchase screen left, though `BillingTerms` still needs the reworded cancel
copy from Phase 3; and 5.1.2(i) AI consent, already shipped in #166) and the "should fix" list.

---

## Appendix B — i18n key delta

All four locales: `src/lib/i18n/locales/{en,pl,hu,de}/`.

### `plans.json`

**Remove (9):** `checkoutNotConfiguredTitle`, `checkoutNotConfiguredBody`, `simulatePayment`,
`checkoutFailedTitle`, `checkoutFailedBody`, `buttons.openingCheckout`, `buttons.upgradeTo`,
`buttons.switchTo`, `planGate.locked.checkoutNotConfigured`

**Also remove if unused after Phase 3:** `planUpdatedTitle`, `planUpdatedBody`,
`downgradeCanceledTitle`, `downgradeCanceledBody`, `switchToTitle`, `switchToBody`,
`keepCurrentPlan`, `buttons.keepThisPlan`, `quota.aiMessagesExtra`, `perMonth`,
`upgradeModal.perMonth` — verify each with a grep before deleting.

**Reword (4):**
| Key | From | To |
|---|---|---|
| `header` | "Choose your plan" | "Your subscription" |
| `terms.cancel` | "Cancel anytime from Settings — …" | Cancel on the web; access continues to period end |
| `planGate.locked.pickPlan` | "Pick a plan to carry on" | Points at the web page, no CTA |
| `upgradeModal.upgradeToPlan` | "Upgrade to {{plan}}" | "See plan details" |

**Add (2):** `managedOnWeb` (the plain line on `/plans`), `planGate.locked.managedOnWeb`

### `coach.json`

**Remove (6):** `checkoutNotConfiguredTitle`, `checkoutNotConfiguredBody`, `simulatePurchase`,
`checkoutFailedTitle`, `checkoutFailedBody`, `buyMoreMessage`

### `settings.json`

**Remove (1):** `planStatus.priceMonthly`
**Add (2):** `manageOnWeb` (row label), `planStatus.active` (the neutral status replacing the price)

### `common.json`

**Add (1):** `a11y.manageSubscription` — accessibility labels live here, not in `settings.json`
(`common.json:46`, the namespace `app/settings.tsx` already reads via `t('common:a11y.back')`).

---

## Appendix C — Touched-artifact index

**Deleted:** `src/lib/billing.ts`

**New:** `src/lib/account.ts`, `src/lib/entitlementsRefresh.ts`

**Modified (app):** `app/plans.tsx`, `app/settings.tsx`, `app/delete-account.tsx`,
`app/downgrade-selection.tsx`, `app/(tabs)/coach.tsx`, `app/(tabs)/_layout.tsx`,
`app/(tabs)/index.tsx`, `app/(tabs)/goals.tsx`

**Modified (src):** `src/lib/linking.ts`, `src/lib/entitlementsSync.ts`, `src/lib/planGate.ts`,
`src/lib/store.ts`, `src/components/UpgradeModal.tsx`, `src/components/BillingTerms.tsx`,
`src/components/auth/PlanGate.tsx`, `src/components/auth/LoginGate.tsx` (comment only),
16 locale files (`plans.json`, `coach.json`, `settings.json`, `common.json` × 4)

**Modified (config/docs):** `eas.json`, `.env`, `.env.appwrite.example`, `n8n/README.md`,
`n8n/workflows/billing-checkout.template.json`, `README.md`, `docs/ONBOARDING_FLOW.md`,
`implementations/APP_REVIEW_BLOCKERS.md`, `implementations/ADDONS.md`,
`implementations/STRIPE_BILLING_HARDENING.md`

**n8n workflows modified:** `CLAUDE_billing_checkout` (`Hss4ze1RGtT0PuJ6`),
`CLAUDE_billing_addon` (`r34lKDZcHITmbRLg`), `CLAUDE_entitlements_get` (`z63gGIWFASF3ggtP`)

**n8n workflows unchanged:** `CLAUDE_stripe_webhook`, `CLAUDE_billing_sync`,
`CLAUDE_account_delete`, `CLAUDE_onboarding`, `CLAUDE_coach_reply`

**Appwrite:** no schema changes. The app stops reading the `subscriptions` table directly; every
other read/write path is untouched.
