/**
 * n8n Code-node logic: build the deletion plan for the `account-delete` webhook.
 *
 * The client (src/lib/billing.ts `requestAccountDeletion`) POSTs { userId } and
 * awaits a synchronous result — the caller only wipes local device state after
 * this confirms the server-side delete succeeded (see app/delete-account.tsx).
 *
 * This node runs AFTER an Appwrite GET on `subscriptions` by user_id (may be
 * empty if the user never subscribed). It decides whether a live Stripe
 * subscription needs canceling and lists every Appwrite table row that must be
 * removed before the Auth user itself is deleted.
 *
 * Row deletion happens per-table in the workflow (one HTTP Request node per
 * table in `tables`, using the Appwrite TablesDB REST `deleteRow`/list-then-
 * delete pattern) — this node only returns the plan, it does not call out.
 */

/** Tables holding rows keyed by user_id that must be purged before Auth deletion. */
const USER_KEYED_TABLES = [
  'subscriptions',
  'entitlements',
  'devices',
  'addon_purchases',
  'goals',
  'users',
];

function buildDeletionPlan({ userId, subscriptionRow }) {
  if (!userId) {
    throw new Error('account-delete: missing userId');
  }

  const stripeSubscriptionId = subscriptionRow ? subscriptionRow.stripe_subscription_id : null;
  const cancelableStatuses = ['trialing', 'active', 'past_due', 'cancel_scheduled'];
  const needsStripeCancel =
    !!stripeSubscriptionId && cancelableStatuses.includes(subscriptionRow.status);

  return {
    userId,
    needsStripeCancel,
    stripeSubscriptionId: needsStripeCancel ? stripeSubscriptionId : null,
    tables: USER_KEYED_TABLES,
  };
}

module.exports = { buildDeletionPlan, USER_KEYED_TABLES };
