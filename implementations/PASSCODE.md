# Passcode-First Auth (Option D: Anonymous + PIN, Email Deferred)

> **⚠️ REVERTED (2026-07-07).** After building this out through Phase 6 (real dev-client testing on iOS), the product decision was made to abandon this direction entirely: onboarding now asks for email upfront again and always creates a real, email-linked account immediately — no anonymous accounts. Both the app (onboarding flow, store fields, nudges, upgrade gate, forgot-PIN warning, the `/link-email` screen) and the backend (Appwrite `users.email` required again, `account_state` column dropped, `CLAUDE_link_email` workflow archived, `CLAUDE_billing_checkout`'s anonymous-guard removed) were reverted to their pre-Phase-0 shape. Two general bug fixes discovered along the way were kept regardless, since they're unrelated to the anonymous/linked distinction: native session-secret recovery via the cookie jar (Appwrite never returns `secret` in the response body, for *any* session type) and native/hardware-accelerated PBKDF2 for PIN derivation.
>
> This document is kept as a historical record of the investigation, the real Appwrite behaviors discovered (Phase 0's findings, the session-secret/cookie-conflict bugs in the Phase 2/3 amendments), and why Option D was ultimately not pursued — not as a description of the current app.

**Goal:** New users never type an email at onboarding. They get an anonymous Appwrite account + 6-digit PIN immediately (like unlocking a phone). Email is asked for later as a *backup/recovery* step — softly at value moments, mandatorily before purchase.

**What stays untouched:** the entire PIN machinery (`PinPad`, `LockGate`, `SetPinGate`, PIN-encrypted session secret via PBKDF2 → AES-256-GCM, escalating lockout, biometrics, `devices` table).

**Account states:** `anonymous` (no email, device-bound, unrecoverable) → `linked` (email attached, recoverable, multi-device, purchase-eligible).

---

## Phase 0 — Prototype the one unknown (do this FIRST)

- [x] Spike: create an Appwrite anonymous session on a dev build; confirm we get a real account `$id` usable as `user_id`
- [x] Spike: attempt to attach an email to that logged-in anonymous account via Email OTP — determine whether Appwrite links it to the same account or mints a new user
- [x] If client-side linking doesn't work: prototype server-side attach (Appwrite server API key from n8n: set email on the account, then verify via OTP)
- [x] Decide and document the linking mechanism before touching any app code — everything in Phase 3 depends on it

### Phase 0 findings (verified against the real project, `appwrite.piggnify.com`, 2026-07-03)

Tested with `node-appwrite` in two modes: an unauthenticated "client mode" instance (mirrors what `react-native-appwrite` does — no API key) for the account-holder side, and an admin-keyed instance for server-side operations and to inspect resulting state.

1. **Anonymous session creation works as expected.** `account.createAnonymousSession()` returns a real user with its own `$id` (e.g. `6a47ec00d23deb0aae6a`), confirmed via admin `users.get()`: a genuine user row, `email: ""`, `status: true`. Safe to use as `user_id` everywhere.

2. **Client-side linking via `createEmailToken` does NOT attach to the current anonymous account — confirmed broken, exactly as predicted (obstacle #1):**
   - Calling `createEmailToken(ID.unique(), email)` while authenticated as the anonymous session **creates a brand-new, separate user** (different `$id`) — the anonymous account is left untouched and orphaned.
   - Calling `createEmailToken(anonUserId, email)` — passing the anonymous account's own `$id` — returns a **500 Server Error** (`general_unknown`). Not a supported operation.
   - Conclusion: there is no client-only path to attach an email to an anonymous account. Do not attempt this in Phase 2/3 app code.

3. **Server-side attach via admin API works correctly and is the chosen linking mechanism:**
   - `users.updateEmail({ userId: anonUserId, email })` (called with an Appwrite server API key, i.e. from n8n) sets the email **on the same account `$id`** — no new user, no data loss, and it creates the expected email `target`/identity record.
   - **Collision is already handled by Appwrite itself**: attempting to `updateEmail` a second account to an email already in use returns `409 user_target_already_exists`. The `link_email` n8n workflow (Phase 1) just needs to catch this and return it as a conflict — no need to pre-check email uniqueness manually.
   - After a server-side attach, a fresh unauthenticated `createEmailToken(ID.unique(), email)` login correctly resolves to the **same** `userId` — confirms the existing-account re-login path (used for linked users and the collision "sign into existing account" flow) works end-to-end.

4. **Decided mechanism:** OTP (`createEmailToken`) is used purely as *proof of ownership* of the email address — the app collects the code, verifies it client-side, and only then calls the n8n `link_email` workflow, which uses the server API key to run `users.updateEmail` against the anonymous account's `$id`. The OTP token itself is never used to establish the session or perform the attach.

5. **Open item carried into Phase 6, not resolved here:** whether the *existing* anonymous session secret stays valid immediately after the server-side `updateEmail` call. The test harness (`node-appwrite` client-mode) did not return a usable session secret in this environment, so an `account.get()` check after the attach couldn't be trusted either way — this needs a real dev-client build to verify (ties into predicted obstacle #2). If the session does get invalidated, Phase 3's "on successful link" step needs to re-establish a session (e.g. via the OTP secret from the login-token call in point 3) rather than assuming the pre-link session secret still works.

   **Resolved in Phase 6 (real dev-client testing):** the empty `secret` seen throughout this test harness turned out to be *real* Appwrite behavior on the actual device too, not a `node-appwrite` test-harness artifact as assumed at the time — see the Phase 2 amendment below and predicted-obstacle #2's resolution note. Unrelated to that, the "existing session stays active" question above did surface as a real bug (`user_session_already_exists`), fixed in Phase 3's amendment.

## Phase 1 — Backend / schema groundwork

- [x] Make `users.email` nullable in Appwrite schema
- [x] Add `account_state` (or `is_anonymous` boolean) to `users` table; backfill existing rows as `linked`
- [x] Update the n8n onboarding/provisioning webhook to accept email-less payloads (keyed on Appwrite account `$id` as today)
- [x] Add a `link_email` n8n workflow (or extend an existing one): attaches email to account, flips `account_state`, handles the collision check (email already exists → return conflict, don't attach)
- [x] Add "email required" precondition to the upgrade/Stripe flow (`entitlements`/checkout path): anonymous users get rejected with a distinct error the app can act on

### Phase 1 notes

- `users.email` (Appwrite `piggnify_mobile_db`/`users`, live via MCP): flipped `required: false`, size unchanged (254), no default — matches the "aligned live via MCP" pattern already used for this table (it isn't managed by `scripts/appwrite/setup.mjs`, which only owns the newer billing/entitlement tables).
- Added `account_state` as a new enum column on `users`: `elements: ["anonymous", "linked"]`, `required: false`, `default: "linked"`. Existing rows in the live project: **zero** (`tables_db_list_rows` on `users` returned `total: 0`) — no backfill write was needed. `Appwrite` will apply the `linked` default automatically on read for any row missing the attribute, but since there are no legacy rows at all in this project this is moot for now; Phase 5's backfill item becomes a no-op restated as "verify still zero legacy anonymous-less rows before going live."
- `email` on `users` has no separate index in this schema for lookups (the collision check is handled by Appwrite's own email-uniqueness enforcement at the auth/identity level via `users.updateEmail`, confirmed in Phase 0 — not by an app-level query), so no index change was needed here.

### n8n changes (live, verified against production webhooks)

- **`CLAUDE_onboarding`** (`FiA67LUzb5BF6csa`, `POST /webhook/claude-onboarding`): the "Create User Row" node now sends `email: null` (not `""`) when the payload omits it — Appwrite's `email`-typed column rejects `""` as an invalid email format even when `required: false`, so the null-vs-empty-string distinction actually matters. Also now sets `account_state: "linked"` when email is present, `"anonymous"` when absent. Verified live: an email-less POST creates a `users` row with `email: null, account_state: "anonymous"`; a POST with email creates `account_state: "linked"`. (Hit and fixed an unrelated tooling snag along the way: n8n's `setNodeParameter` op needs the path relative to the node's own parameter bag, e.g. `/jsonBody`, not `/parameters/jsonBody` — the latter silently created a nested dead param that the live/published version never picked up. Republishing after `updateNodeParameters` with `replace: true` is what actually took effect.)
- **`CLAUDE_link_email`** (new workflow, `POST /webhook/claude-link-email`, id `aTQpnTBLre1g4y3e`): body `{ userID, email }` (email already OTP-verified client-side per Phase 0's decision). Calls Appwrite's admin `PATCH /users/{userId}/email` (server API key) to attach the email to the *same* account `$id`, then flips `account_state: "linked"` (+ `email`) on the corresponding `users` TablesDB row. On Appwrite's `409 user_target_already_exists`, responds `409 { error: "email_conflict", message: "..." }` without touching any row — the app can show the "sign into existing account vs. use a different email" dialog from Phase 3. Any other attach failure responds `500 { error: "link_failed", message }`. **Verified live end-to-end**: real anonymous account + pre-seeded `users` row → link succeeds, `account_state` flips to `linked`, email attached at the Auth level; a second anonymous account attempting the same email → clean `409` conflict response, no partial state change.
- **Known limitation, not fixed here**: if the Auth-level `updateEmail` succeeds but the following TablesDB flip fails (e.g. transient network error), the email is attached at the Auth level but `account_state` stays `anonymous` and `email` stays unset in the `users` row — a partial-failure state with no rollback or retry. This matches the existing bar in this codebase (`CLAUDE_onboarding` has the same non-transactional multi-step-write pattern, e.g. `Create Goal Row` failing after `Create User Row` succeeds isn't rolled back either), so left as-is for Phase 1; worth a retry/reconcile pass if it shows up in practice.
- Both onboarding and `link_email` reuse the existing `Appwrite Header Auth` n8n credential (`httpHeaderAuth`, id `TaDrV35EzjGhssHS`) already used by all other `CLAUDE_*` workflows — no new credential was created.
- Confirmed via code review of `n8n/code-nodes/*.js` and `billing-checkout.template.json` (per the research pass): none of the billing/entitlements code reads `users.email` — everything is keyed on `user_id`. So this is a *new* guard, not a fix to an existing dependency.
- **`CLAUDE_billing_checkout`** (`Hss4ze1RGtT0PuJ6`, currently inactive/not yet live — `POST /webhook/billing-checkout`): inserted a "Get User" (`GET .../collections/users/documents/{userId}`) + "Is Anonymous?" IF node between the webhook and the existing "Get Plans" step. `account_state === "anonymous"` short-circuits to a `403 { error: "email_required", message: "Add and verify an email before upgrading." }` response before any Stripe call; anything else (`"linked"`) falls through to the unchanged existing chain (`Get Plans` → `Pick Price + Trial` → Stripe Checkout → `Respond url`). Since the workflow isn't active yet (no live traffic to disturb), verified both branches with n8n's pinned-data test runner instead of live webhook calls: anonymous input stopped at `Respond Email Required` without touching `Get Plans`/Stripe; linked input flowed untouched through to `Respond url`. Left the workflow's active/inactive state as it was — did not activate it, since that wasn't asked for and this workflow isn't otherwise wired into the live app flow yet.
- `CLAUDE_billing_addon` (also inactive) and the always-active `CLAUDE_entitlements_get` / `CLAUDE_billing_sync` / `CLAUDE_stripe_webhook` were left untouched — none of them create new subscriptions for a user, so an anonymous-user guard isn't needed there; `billing_addon` would need the same guard whenever it's wired up for real, worth remembering for whoever activates it.

## Phase 2 — App: anonymous-first onboarding

- [x] Add anonymous-session creation to `src/lib/auth.ts` (called silently during onboarding)
- [x] Remove the Email OTP step from onboarding screen 7; PIN setup handoff on step 8 stays as-is
- [x] Ensure the session secret from the anonymous session goes through the same PIN-encryption path in `secureStorage`/`pin`
- [x] Register the device in `devices` table exactly as today (anonymous accounts still get a devices row)
- [x] Add an account-state helper (anonymous vs linked) readable by UI components
- [x] Verify `AuthGate` routing: anonymous user with PIN set → `LockGate`, never `LoginGate`

### Phase 2 notes

- **`src/lib/auth.ts`**: added `createAnonymousSession()`, calling `account.createAnonymousSession()` + `applySession(...)` and returning the same `{userId, secret}` shape as `verifyEmailOtp`, so downstream code (`onLoggedIn`, `setPin`, `registerDevice`) doesn't need to branch on how the session was established.
- **`app/onboarding.tsx`**: gutted the email/OTP UI and `handleRequestCode`/`handleVerifyAndCreate` logic in step 7 (`AccountFinalization`). Replaced with `handleCreateAccount()`, auto-triggered via `useEffect` on entering the step (no user input needed) — creates the anonymous session, POSTs the onboarding webhook with `email: null`, then follows the exact same `addGoal`/`updateProfile`/`unlockAchievement`/`setPendingSession`/`setStep(Success)` sequence as before. Step 8 (PIN handoff via `onLoggedIn`) is untouched. On failure, the step shows a "Try Again" button that re-runs `handleCreateAccount`.
- **`src/lib/pin.ts`, `src/lib/secureStorage.ts`, `src/lib/device.ts`, `authLock.ts`'s `registerDevice` call sites**: confirmed via code read — all are keyed purely on `userId`/the session secret string, with zero awareness of how the account was created. No changes needed; the anonymous session's secret flows through `setPin`/`SetPinGate` and `registerDevice` identically to an OTP session's secret.
- **Correction from Phase 6 real-device testing**: the claim just above ("no changes needed") was true for *how the secret flows*, but wrong about *what the secret actually was*. On a real device, `account.createSession()`/`createAnonymousSession()` return `secret: ""` — Appwrite deliberately omits it from the response body (confirmed upstream: sessions are meant to live in cookies, not JS-readable strings — [appwrite/appwrite#8673](https://github.com/appwrite/appwrite/issues/8673)). This was masked earlier because the Phase 0 spike's empty `secret` was misattributed to a `node-appwrite` test-harness quirk rather than real Appwrite behavior. Fixed in `src/lib/auth.ts`: a `resolveSessionSecret()` helper reads the actual session token from the native cookie jar (via `react-native-nitro-cookies`, already added for an unrelated fix — see Phase 3 amendment) when the SDK's own field is blank, using it verbatim as the value passed to `applySession()`/encrypted by `setPin()`. This was necessary for the whole "PIN-encrypted session secret" model in this phase's own checklist item to actually work at all on-device.
- **`src/lib/store.ts`**: added `AccountState = 'anonymous' | 'linked'` and `UserProfile.accountState`, plus `email: string | null` (was a required `string`) to match the backend's nullable column. Added `isAnonymousAccount(profile)` helper for UI components. **Also fixed a local-migration gap this surfaced**: zustand's default `persist` merge shallow-replaces the whole `profile` object, so an existing installed app's persisted profile (pre-dating `accountState`) would rehydrate with `accountState: undefined` after this update ships. Added an explicit `merge` function: if the persisted profile has no `accountState` but has an `email`, it's backfilled to `'linked'` (existing users always went through email OTP) — mirrors Phase 5's "existing users are linked from day one" invariant, just applied to local device storage instead of the Appwrite `users` row.
- **`AuthGate.tsx`**: verified, no code change needed — `status === 'locked'` (PIN present locally) is checked before `status === 'unauthenticated'` (which is what renders `LoginGate`), so an anonymous user who still has a device PIN set always hits `LockGate` first, structurally never reaching `LoginGate`. Updated the file's doc comment for accuracy only.
- `tsc --noEmit` clean on all touched files (one pre-existing, unrelated error in `index.ts` confirmed present on `main` too, not introduced here).

## Phase 3 — App: email linking flow

- [x] Build the "Add your email" screen — reuse the existing OTP entry UI from `LoginGate`
- [x] Wire it to the linking mechanism decided in Phase 0
- [x] Handle the collision response: dialog offering "Sign into existing account (replaces this device's data)" vs "Use a different email"
- [x] Collision + existing account has an active subscription → force the sign-into-existing path (never orphan a paid account)
- [x] On successful link: flip local + server account state, no change to PIN/session/user_id

### Phase 3 notes

- **New screen**: [app/link-email.tsx](app/link-email.tsx), registered as a modal route in [app/_layout.tsx](app/_layout.tsx). UI/flow copied from `LoginGate`'s email→OTP stages. Entry point added to [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx): a dismissed-free "Protect your progress" card shown only when `isAnonymousAccount(profile)`.
- **New module**: [src/lib/accountLinking.ts](src/lib/accountLinking.ts) — `linkEmail(userID, email)` POSTs to `claude-link-email`, returning a structured `{status: 'linked'|'conflict'|'error', ...}` result rather than throwing, so the UI can branch on 409 vs other failures (matches `billing.ts`'s per-flow-typed-response convention, but as its own module since this isn't a billing concern).
- **OTP-hazard handled**: `verifyEmailOtp` always calls `applySession` internally and, per Phase 0, either mints a brand-new throwaway Appwrite user (new email) or resolves to the *existing* account (collision case) — never the current anonymous account. The screen captures the anonymous session's `{userId, secret}` from `useAuthLock` *before* the OTP round-trip, and calls `applySession(originalSecret)` immediately after `verifyEmailOtp` returns, restoring the anonymous session before ever calling `linkEmail`. This was flagged by research as a real correctness hazard, not spelled out in the original plan — fixed here rather than deferred.
- **Amendment from Phase 6 real-device testing — the above fix was necessary but not sufficient.** Restoring the session *after* the OTP round-trip doesn't help if Appwrite refuses to even start that round-trip: `account.createSession()` 401s with `user_session_already_exists` whenever a session is already active on the client — which is *always* true here, since reaching this screen requires already being logged in as the anonymous account. Root cause went one level deeper than the JS session header: `react-native-appwrite` sends every request with `credentials: 'include'`, so the native cookie jar (not our own `client.setSession()` state) re-attaches the prior session's cookie regardless of what we clear in JS. Fixed by adding `react-native-nitro-cookies` and calling both `clearClientSession()` *and* `NitroCookies.clearAll()` immediately before every `verifyEmailOtp()` call in `link-email.tsx` and `LoginGate.tsx`. This same native-cookie mechanism is also what Phase 2's amendment above uses to recover the real session secret.
- **Collision flow reuses the OTP session, no second round-trip**: since Appwrite's `createEmailToken`/`createSession` resolves to the *existing* account when the email is already claimed, the `{userId, secret}` returned by `verifyEmailOtp` in the collision case is already a valid, proven session for that existing account. "Sign into existing account" just calls `onLoggedIn(provenUserId, provenSecret)` directly — no extra email/code entry needed. `AuthGate` wraps the whole `Stack` (confirmed in `_layout.tsx`), so this immediately swaps the entire app to `SetPinGate` regardless of which screen triggered it.
- **Subscription-check backend addition**: the original Phase 1 `claude-link-email` 409 response only carried `{error, message}` — no way for the app to know if the colliding account has an active subscription (required by this phase's item 4). Extended the live n8n workflow's conflict branch: on `user_target_already_exists`, it now looks up the existing user by email (`GET /v1/users?queries[]=equal("email",...)`), reads that user's `entitlements` row, and adds `existingAccountHasActiveSubscription: boolean` to the 409 body (`true` when `effective_plan_id !== 'beginner'` and `status` isn't `canceled`/`incomplete`). Verified live: seeded two real anonymous accounts + a paid (`medium`/`active`) entitlements row for one, confirmed collision returns `existingAccountHasActiveSubscription: true`; flipped the entitlements row to `beginner`/`canceled` and confirmed it flips to `false`. Test rows cleaned up afterward.
- **Forced path**: when `existingAccountHasActiveSubscription` is true, the app shows a single-button ("Sign In") dialog instead of the normal two-choice dialog — there is no "use a different email" escape hatch in that case, satisfying "never orphan a paid account."
- **On success**: `updateProfile({ email, accountState: 'linked' })` — no `onLoggedIn`/session/PIN changes, matching the requirement exactly. The server side (n8n) already flipped `account_state` on the `users` row as part of the same call.
- `tsc --noEmit` and the full `vitest` suite (20 tests) both pass clean after these changes.

## Phase 4 — Nudges & guardrails

- [x] Soft, dismissible backup nudge after first goal created / first contribution logged ("Protect your progress — add an email")
- [x] Milestone re-nudge (e.g. 7 days of use); never blocking, respects dismissals
- [x] Show the nudge after a lockout event ("nearly locked out? add an email")
- [x] Hard gate on upgrade: anonymous user taps upgrade → "First, secure your account" interstitial → link email → then Stripe checkout
- [x] Forgot-PIN screen: for anonymous users, hard warning that reset = permanent data loss; for linked users, existing email re-login path unchanged

### Phase 4 notes

- **`src/lib/store.ts`**: added `EmailNudgeState` (`dismissedAt`, `firstActionShown`, `milestoneShown`, `lockoutPending`) + `UserProfile.emailNudge`, and `accountCreatedAt: string | null` as the day-7 milestone anchor (set once in `onboarding.tsx` alongside `onboardingCompleted: true`). Both live inside `UserProfile`/`DEFAULT_PROFILE`, so they're automatically wiped by the existing "Reset Data" button (`resetForDemo`) and safely backfilled for existing installs by the custom persist `merge` added in Phase 2 — no new migration code needed.
- **New component**: [src/components/EmailNudgeBanner.tsx](src/components/EmailNudgeBanner.tsx) — a single reusable dismissible card (styled after the existing `incomeSkipped` banner pattern on the dashboard) that picks at most one active reason (`lockout` > `firstAction` > `milestone`, in priority order), shows reason-specific copy, marks that reason "shown" so it won't re-fire, and offers an X button that sets `dismissedAt` — once dismissed, no automatic nudge shows again (the permanent "Add email" card on the Profile tab, added in Phase 3, is unaffected and always available). Mounted at the top of the dashboard ([app/(tabs)/index.tsx](app/(tabs)/index.tsx)).
  - "First goal created" and "first contribution logged" collapse into a single `firstActionShown` trigger keyed on `goals.length > 0` — since onboarding itself always creates the first goal, that condition already covers both phrasings from the plan without separate detection logic.
  - Milestone: `accountCreatedAt` + 7 days, checked on render (no background/cron infra exists in this client-only app, so it's opportunistic on next app open — acceptable for a soft nudge).
  - Lockout: **`src/lib/authLock.ts`** now sets `emailNudge.lockoutPending = true` at the exact moment a PIN-attempt cycle tips into a timed lockout (`after.locked === true`, i.e. the same "locked" branch `LockGate.tsx` already displayed a countdown for) — not on every subsequent blocked attempt while still locked, and not on full lockout-exhaustion (`forceRelogin`, which wipes and force-logs-out instead). This required importing `useStore` into the separate `authLock` zustand store to call `updateProfile` as a side effect — confirmed no circular import (`store.ts` doesn't reference `authLock.ts`).
- **Hard upgrade gate**: [app/plans.tsx](app/plans.tsx)'s `onSelectPlan`, inside the existing `isUpgrade` branch, now checks `isAnonymousAccount(profile)` before ever calling `startCheckout` and shows an `Alert.alert` interstitial ("First, secure your account") with a "Cancel"/"Add email" choice — matches the existing `Alert.alert`-based confirmation pattern already used elsewhere in this file (downgrade confirm, checkout-unavailable simulate) rather than building a dedicated screen. Tapping "Add email" pushes `/link-email`; after linking, the user returns to Plans and taps upgrade again themselves — a deliberate choice over auto-resuming checkout, so a completed subscription purchase is never silently chained onto an unrelated action.
- **Forgot-PIN warning**: [src/components/auth/LockGate.tsx](src/components/auth/LockGate.tsx)'s "Forgot PIN?" link now branches on `isAnonymousAccount(profile)`. Anonymous: `Alert.alert` hard warning ("This will permanently delete your data...") with a destructive-styled confirm before calling `resetToLogin()`. Linked: unchanged — calls `resetToLogin()` directly exactly as before, which routes to `LoginGate`'s existing email re-login path.
- `tsc --noEmit` and the full `vitest` suite (20 tests) both pass clean after these changes.

## Phase 5 — Migration & existing users

- [x] Existing users (email already on account) are `linked` from day one — verify no behavior change for them
- [x] Backfill script/workflow for `account_state` on existing `users` rows
- [x] Reconcile: confirm the old n8n `userID` → Appwrite `$id` mapping still holds for email-less provisioning

### Phase 5 notes

- **Verified live against the real Appwrite project**: a `users` row created with the pre-migration shape (no `account_state` field at all, just `first_name`/`last_name`/`email`/`country`/`currency`) is resolved as `account_state: "linked"` **both on plain reads AND on `equal("account_state", "linked")` queries** — Appwrite applies the column default (`linked`) at the index/query level, not just at read-time serialization. This means existing users are correctly treated as `linked` today with zero code changes required for correctness; test row deleted after confirming.
- **Client-side migration made testable**: extracted the inline zustand `persist` `merge` function (added in Phase 2) into a standalone exported `mergePersistedState()` in [src/lib/store.ts](src/lib/store.ts), and added [src/lib/store.test.ts](src/lib/store.test.ts) with 4 cases covering: backfilling `accountState` to `linked` for a pre-Phase-2 profile with an email, defaulting to `anonymous` for one with no email, respecting an already-explicit `accountState`, and the fresh-install no-op case. `DEFAULT_PROFILE` exported to support the test.
- **Backfill script**: [scripts/appwrite/backfill-account-state.mjs](scripts/appwrite/backfill-account-state.mjs), following `setup.mjs`'s existing dry-run/`--apply` convention. Since Appwrite transparently resolves missing `account_state` to the default on every read (there's no way to query for "attribute physically absent" vs "defaulted"), the script instead writes an explicit `account_state: "linked"` to every row that currently *resolves* to `"linked"` — idempotent for rows that already have it stored, and a real backfill for rows relying on the default. It deliberately never touches rows resolving to `"anonymous"`, so it can't affect anonymous accounts or any other data already carrying that value. Syntax-checked (`node --check`) and its query/write operations were validated live via direct Appwrite calls earlier in this session, but I could not execute a live dry run in this session — the API key's scope was reduced mid-session (flagged back in Phase 1) and now returns 401 on all calls, including this one. Run it yourself with a fresh key when ready; it's safe to re-run.
- **`userID` ↔ Appwrite `$id` reconciliation**: confirmed by re-reading `CLAUDE_entitlements_get` and `CLAUDE_billing_sync` (in addition to `CLAUDE_onboarding`/`CLAUDE_link_email`/`CLAUDE_billing_checkout` already reviewed in earlier phases) — every live `CLAUDE_*` n8n workflow keys strictly on `user_id`/`userId`, which is always the Appwrite account `$id` used directly as the `users`/`entitlements`/`subscriptions`/`devices` row id or denormalized FK. There is no separate legacy "userID" concept anywhere that could diverge from the Appwrite `$id` — client (`profile.userID`), onboarding, link-email, billing, and sync all reference the exact same value. The only email-based lookup in the entire system is the one I added intentionally in Phase 3 (`link_email`'s collision-detection step) — everything else is, and remains, email-agnostic.
- **Unrelated finding, flagged and left untouched per your direction**: the live `users` table currently has 8 rows with fixture-looking data (Faker-style names/gibberish) and 2 extra columns (`days_left`, `free_trial`) that weren't there in Phase 1 and weren't created by this work — added by unrelated concurrent activity on the shared dev project. Not touched by anything in this phase.
- `tsc --noEmit` and the full `vitest` suite (24 tests, up from 20) both pass clean.

## Phase 6 — Verification

- [x] `tsc --noEmit` clean
- [x] Dev build: fresh install → onboarding with zero email prompts → PIN set → app usable
- [x] Kill/relaunch → PIN unlock works, no email prompt
- [ ] Link email → OTP → account state flips; PIN and data unchanged
- [ ] Collision path: link an email that already has an account → dialog appears, both choices behave
- [ ] Anonymous user taps upgrade → email gate appears before Stripe
- [x] Forgot PIN as anonymous user → warning shown; reset produces a clean fresh account
- [ ] Forgot PIN as linked user → email OTP re-login works (existing flow)
- [ ] New device as linked user → OTP login, fresh PIN, new `devices` row

### Phase 6 progress so far (real dev-client testing, iOS Simulator)

This phase turned up three real bugs that no amount of backend/logic review in Phases 0-5 could have caught — all three only surface with an actual native client talking to the actual server:

1. **Appwrite platform not registered** — first blocker, a one-time Appwrite Console config step (Add Platform → Apple App → `com.piggy.app`), not a code bug.
2. **Empty session secret** (Phase 2 amendment above) — Appwrite never returns it; recovered via native cookie jar instead. Required adding `react-native-nitro-cookies` + `react-native-nitro-modules`.
3. **`user_session_already_exists` 401** (Phase 3 amendment above) — Appwrite refuses to create a session while one is active on the client, and clearing our own JS-side session header wasn't enough because `react-native-appwrite` sends every request with `credentials: 'include'`, so the native cookie jar kept re-attaching the old session regardless. Fixed by clearing native cookies (not just our header) immediately before every OTP-verify call.

Also fixed, not a correctness bug but a real usability problem: PBKDF2 key derivation (150,000 iterations, deliberately expensive — see `pin.ts`) ran in pure JS and took 5-10s with zero visual feedback on both PIN setup and every unlock, reading as a frozen app. Added `react-native-quick-crypto` (same Nitro-Modules architecture as the cookie fix) to run the *identical* 150k-iteration PBKDF2 natively/hardware-accelerated — same security margin, sub-second instead of multi-second. Also added explicit "Securing your PIN…" / "Unlocking…" loading states to `SetPinGate`/`LockGate` regardless, since silent multi-second waits are a UX bug on their own even when fast.

**Verified working end-to-end on-device**, in order: fresh install → full onboarding (zero email prompts) → PIN set → dashboard reachable → background/kill + relaunch → PIN unlock (no email prompt) → native PBKDF2 confirmed fast on both setup and unlock → "Forgot PIN" as an anonymous user → data-loss warning shown → confirmed → clean reset → fresh anonymous account → new PIN → background/relaunch cycle repeated successfully after the cookie/secret fixes landed.

**Not yet exercised live** (only unit/simulated-backend tested in Phases 3-4, not through the actual app UI on-device): linking an email end-to-end via the `/link-email` screen specifically (as opposed to `LoginGate`, which shares the same fixed code path but was the one actually observed working); the collision dialog; the upgrade hard-gate interstitial; forgot-PIN as a *linked* user; and the new-device OTP-login path. These five remaining checkboxes are what's left before this phase is fully closed out.

---

## Predicted obstacles

1. **Appwrite anonymous→linked conversion (the big one).** Appwrite's Email OTP (`createEmailToken`) is a *login* primitive — it may create a brand-new user instead of attaching the email to the current anonymous account. Appwrite's documented anonymous-conversion path uses email+password, which we don't want. Likely outcome: linking needs a server-side step (n8n with an Appwrite API key sets the email on the account, OTP used purely as proof-of-ownership). This is why Phase 0 exists.

2. **Session lifetime for anonymous accounts.** The whole model assumes the PIN-encrypted session secret stays valid indefinitely. If the Appwrite session expires, a linked user can re-login via email — an anonymous user cannot, and their account is effectively dead even though they know their PIN. Check Appwrite session-length config (max it out) and decide what the app does if it ever hits a 401 while anonymous (best answer: treat like fresh install, with apologetic copy).

   **Resolved (Phase 6, real-device testing) — the actual blocker here wasn't lifetime, it was that the app never had a real secret to begin with.** Appwrite deliberately returns `secret: ""` in the session response body (see Phase 2 amendment) — react-native-appwrite's fallback mechanism for recovering it is web-only and silently no-ops on native, so every PIN-encrypted blob prior to this fix was encrypting an empty string. Fixed via native cookie extraction in `src/lib/auth.ts`. Separately confirmed live: created sessions carry a 1-year `expire` (`Wed, 07-Jul-2027`, i.e. `createdAt + 1 year`) — long enough that expiry isn't a practical near-term concern; the "what if it 401s anyway" fallback behavior (treat like fresh install) is not separately implemented yet and remains a reasonable follow-up if it's ever observed in practice.

3. **Anonymous-account garbage.** Every fresh install/reinstall mints a new Appwrite account + `users` row + `devices` row. Reinstall-happy users and dev/testing will accumulate orphans. Plan a cleanup policy (e.g. n8n cron deleting anonymous accounts with no activity for N days) — but never delete anonymous accounts with data newer than the threshold.

4. **Stripe/entitlements assumed an email exists.** The `stripe_webhook` → DB → `entitlements_get` chain and the checkout website may read `users.email`. Grep the n8n workflows for email assumptions; nullable email must not break entitlement resolution (it's keyed on user_id, but verify).

5. **Collision UX corrupting paid state.** If "sign into existing account" replaces local state, make sure the abandoned anonymous account can't hold entitlements (it can't buy without linking first — but double-check the ordering guarantees that).

6. **Data-loss complaints are guaranteed.** Some anonymous users *will* reinstall or forget PINs and lose data. This is the accepted cost of Option D — the mitigation is nudge placement and honest copy, not engineering. Decide upfront what support/refund stance to take.

7. **Onboarding webhook ordering.** Today provisioning happens with an email in the payload. Anonymous provisioning at onboarding + a later `link_email` call means two writes to the same row from different workflows — make both idempotent and keyed strictly on account `$id`.

8. **Testing requires a custom dev build.** The native modules (secure-store, local-authentication, etc.) don't run in Expo Go; every verification pass in Phase 6 needs a dev-client build. Budget for that loop being slow.

9. **Rate limiting on anonymous session creation.** Appwrite rate-limits anonymous session creation per IP. Normal users won't hit it; CI/dev iteration might. Not a blocker, just don't be surprised.

---

## Revert record (2026-07-07) — what actually changed to undo Option D

This section is the detailed counterpart to the notice at the top of this file. Everything above describes the anonymous-first system as it was *built and tested*; this section describes exactly what was reverted, kept, and why, for any future LLM/engineer trying to understand the current (post-revert) codebase without re-reading the whole history above.

**Trigger:** after Phase 6 real-device testing confirmed anonymous-first worked end-to-end, the product decision was made to abandon it anyway — onboarding should always ask for email upfront and always create a real, email-linked account immediately, with no anonymous accounts at all. This was a deliberate product reversal, not a bug report, and was confirmed to include reverting the backend (Appwrite schema + n8n), not just the app UI.

### Two fixes kept regardless (unrelated to anonymous/linked)

These are real bugs discovered during Phase 6 device testing that apply to *any* session type, so they were kept as-is:

1. **Native session-secret recovery** — `resolveSessionSecret()` in [src/lib/auth.ts](src/lib/auth.ts), still used inside `verifyEmailOtp`. Appwrite returns `secret: ""` in every session response body regardless of how the session was created (see Phase 2/obstacle-2 notes above); the real secret is read from the native cookie jar (`react-native-nitro-cookies`) as a raw string when the SDK field is blank.
2. **Native PBKDF2** — [src/lib/pin.ts](src/lib/pin.ts) still derives the PIN key via `react-native-quick-crypto`'s `pbkdf2` (same 150,000 iterations / SHA-256 / 32-byte key as before) instead of the pure-JS `@noble/hashes` implementation, to avoid the 5-10s UI freeze. `SetPinGate`/`LockGate` also keep their "Securing your PIN…" / loading-spinner UX additions from this same pass.
3. Related native deps kept in `package.json`/`app.json`: `react-native-nitro-cookies`, `react-native-nitro-modules`, `react-native-quick-crypto`, `react-native-quick-base64`, `expo-build-properties` (+ its config plugin entry in `app.json`).

### App changes reverted

- **[app/onboarding.tsx](app/onboarding.tsx)** — step 7 (`AccountFinalization`) restored to the original mandatory email + 6-digit OTP UI (`Input` + `TextInput`, `handleRequestCode`/`handleVerifyAndCreate` calling `requestEmailOtp`/`verifyEmailOtp`). The silent `handleCreateAccount()` + auto-triggering `useEffect` from Phase 2 was removed. Onboarding webhook payload and `updateProfile(...)` always carry a real `email`; `accountState`/`accountCreatedAt` fields dropped from the call.
- **[src/lib/auth.ts](src/lib/auth.ts)** — `createAnonymousSession()` deleted (no longer called anywhere).
- **[src/lib/store.ts](src/lib/store.ts)** — removed `AccountState` type, `UserProfile.accountState`, `isAnonymousAccount()`, `EmailNudgeState`/`UserProfile.emailNudge`, `accountCreatedAt`; `email: string | null` reverted to `email: string`; removed the custom `merge`/`mergePersistedState` migration entirely (no account-state migration needed anymore) — persist config back to the library's default merge.
- **Deleted files**: `app/link-email.tsx`, `src/lib/accountLinking.ts`, `src/components/EmailNudgeBanner.tsx`, `src/lib/store.test.ts` (only tested the removed `mergePersistedState`), `scripts/appwrite/backfill-account-state.mjs`.
- **[app/_layout.tsx](app/_layout.tsx)** — removed the `link-email` route registration.
- **[app/(tabs)/index.tsx](app/(tabs)/index.tsx)** — removed `EmailNudgeBanner` import/usage.
- **[app/(tabs)/profile.tsx](app/(tabs)/profile.tsx)** — removed the "Protect your progress" card and `isAnonymousAccount` import.
- **[app/plans.tsx](app/plans.tsx)** — removed the anonymous upgrade-gate interstitial from `onSelectPlan`; upgrade goes straight to `startCheckout` again.
- **[src/components/auth/LockGate.tsx](src/components/auth/LockGate.tsx)** — `handleForgotPin` reverted to call `resetToLogin()` directly, no anonymous/linked branching or data-loss `Alert`.
- **[src/lib/authLock.ts](src/lib/authLock.ts)** — removed the `emailNudge.lockoutPending` update and the `useStore` import that existed only for it; removed diagnostic `console.log`s added during Phase 6 debugging.
- **[src/components/auth/AuthGate.tsx](src/components/auth/AuthGate.tsx)** — doc comment reverted to non-anonymous wording (no functional change; the `locked`-before-`unauthenticated` check predates this feature).
- **[src/components/auth/LoginGate.tsx](src/components/auth/LoginGate.tsx)** — kept the `clearClientSession()` + `NitroCookies.clearAll()` fix before `verifyEmailOtp` (general session-conflict fix, see below); removed diagnostic logging and a stale comment referencing the deleted `link-email.tsx`.

### Backend changes reverted (Appwrite + n8n, live)

- **Appwrite schema** (`piggnify_mobile_db`/`users`, via MCP): `email` set back to `required: true`; `account_state` column dropped entirely (`tables_db_delete_column`). This is a table-wide change, so it also removed `account_state` from unrelated fixture rows in the same table — their other columns/data were untouched, and since their emails were already non-null, making email required didn't break them.
- **`CLAUDE_onboarding`** (`FiA67LUzb5BF6csa`) — "Create User Row" node reverted to plain `email` (no `account_state`); republished and verified live via curl (row created with plain `email`, no `account_state` field).
- **`CLAUDE_link_email`** (`aTQpnTBLre1g4y3e`) — unpublished and archived (no hard-delete tool was available via MCP, so this is the closest available state to "deleted"; the workflow no longer runs and the app no longer calls it).
- **`CLAUDE_billing_checkout`** (`Hss4ze1RGtT0PuJ6`) — removed the "Get User" / "Is Anonymous?" / "Respond Email Required" nodes and their connections; `Checkout Webhook → Get Plans` reconnected directly. Workflow remains inactive, as it was before this whole feature started.
- **[scripts/appwrite/schema.mjs](scripts/appwrite/schema.mjs)** — trimmed the Phase-1-era doc-comment additions about nullable `email`/`account_state` from the `LEGACY_TABLES_ALIGNED` block.

### Verification performed after the revert

- `tsc --noEmit` clean (same pre-existing, unrelated `index.ts` error as before this whole feature; nothing new).
- `npx vitest run` — 20/20 passing (down from 24; the 4 removed tests were `store.test.ts`'s migration-merge cases, which no longer apply).
- Grep sweep confirmed zero leftover references to every removed symbol (`AccountState`, `isAnonymousAccount`, `EmailNudgeState`, `createAnonymousSession`, `accountLinking`, `EmailNudgeBanner`, `mergePersistedState`).
- `git status --short` confirmed most touched files are byte-identical to their pre-Phase-0 baseline, with the remaining diffs matching exactly the "kept regardless" fixes listed above.
- Live device pass (fresh install → onboarding now asks for email + OTP → PIN setup → dashboard) was confirmed working end-to-end on iOS Simulator in a follow-up session (2026-07-08) — see "Post-revert fixes" below for the two real bugs that pass surfaced and fixed.

### What this means for reading the rest of this document

Everything in Phases 0-6 and "Predicted obstacles" above describes the anonymous-first system **as designed and tested**, not the current app. It remains useful for: the real Appwrite behaviors it uncovered (empty session secrets, cookie-jar session conflicts, platform registration) which generalize beyond this feature, and as a record of why Option D was tried and abandoned if anonymous-first ever comes up again as an idea.

---

## Post-revert fixes (2026-07-08)

A live device-testing pass of the reverted (mandatory-email) onboarding flow, done in a follow-up session, surfaced two real local-auth bugs. Neither is specific to the anonymous/linked distinction — both are general bugs in the PIN/session-lock machinery that happened to only become visible once real fresh-install/reset testing resumed post-revert. A third change is copy-only.

1. **Stale Keychain PIN survives both "Reset Data" and a full app delete.**
   - **Symptom:** after resetting data and even fully deleting + reinstalling the app, the user was still prompted for their old device PIN on next launch, for an account that no longer existed (it had been wiped from Appwrite earlier in testing).
   - **Root cause:** the PIN-encrypted session blob lives in the iOS Keychain via `expo-secure-store` ([src/lib/secureStorage.ts](src/lib/secureStorage.ts)). Apple's Keychain is designed to survive app deletion (so a reinstalled app can recover credentials) — deleting the app only clears AsyncStorage, not Keychain. Separately, the "Reset Data" button ([app/(tabs)/profile.tsx](app/(tabs)/profile.tsx)) only ever reset the zustand/AsyncStorage profile via `resetForDemo()` — it never touched the Keychain-backed PIN at all.
   - **Fix:** "Reset Data" now also calls `useAuthLock.resetToLogin()`, which wipes the Keychain PIN/session/lockout state. Additionally, [src/lib/authLock.ts](src/lib/authLock.ts)'s `bootstrap()` now treats "a PIN exists in the Keychain but the local profile shows `onboardingCompleted: false`" as a stale/orphaned PIN (from a reset or app-delete that predates this fix, or any future case where the two stores diverge) — it wipes the orphaned PIN and Appwrite client session and starts at `unauthenticated` instead of locking the user out on a passcode for an account this install has no record of. This required importing `useStore` into `authLock.ts` (read-only; no circular dependency, `store.ts` does not import `authLock.ts`).
   - **Note:** power-cycling the iOS Simulator does *not* clear the Keychain (same as a real device reboot) — only "Device → Erase All Content and Settings" or `xcrun simctl erase` does a true factory reset. This fix removes the need for that during normal dev iteration.

2. **Onboarding briefly hijacked into a second, unwanted Email OTP round-trip before PIN setup.**
   - **Symptom:** right after verifying the onboarding email code and reaching the Success/confetti screen, tapping through to PIN setup instead showed `LoginGate` ("Welcome back"), demanding a *second* email OTP (a real second email, with a new code) before finally reaching PIN setup.
   - **Root cause:** [app/onboarding.tsx](app/onboarding.tsx)'s `handleVerifyAndCreate` set `updateProfile({ onboardingCompleted: true, ... })` immediately after the first OTP verified, but deliberately deferred calling `onLoggedIn()` (which moves auth status out of `'unauthenticated'`) until the user tapped the Success screen's button, so the summary/confetti screen could be shown first. In that window, [src/components/auth/AuthGate.tsx](src/components/auth/AuthGate.tsx) observed `status === 'unauthenticated'` **and** `onboardingCompleted === true` at the same time — its exact signal for "returning user whose PIN was wiped, show `LoginGate`" — and hijacked the whole app over to `LoginGate` before or during the Success screen, regardless of which screen was actually mounted in the `Stack` underneath.
   - **Fix:** `onboardingCompleted: true` is no longer set inside `handleVerifyAndCreate`. It's now set in the Success screen's button `onPress`, in the same tick as the `onLoggedIn()` call, so `AuthGate` never observes the two flags disagreeing.

3. **Success-screen button copy.** Changed from "Go to my dashboard" to "Secure my account" — the button actually leads straight into PIN setup, not the dashboard, and the old copy read as a bug (a "go to dashboard" button that instead demands a passcode).

**Verified live end-to-end (iOS Simulator, 2026-07-08):** Reset Data → immediate re-lock with a fresh/no PIN (no stale-PIN prompt); full app delete + `npx expo run:ios` reinstall → straight to onboarding (no stale-PIN prompt); onboarding email OTP → Success screen → "Secure my account" → PIN setup directly, no second OTP screen in between.
