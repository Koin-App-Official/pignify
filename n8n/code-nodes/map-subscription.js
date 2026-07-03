/**
 * n8n Code-node logic: map a (refetched) Stripe Subscription → internal status +
 * the `subscriptions` table payload for Appwrite.
 *
 * Mirrors the state machine in src/lib/subscription.ts. ALWAYS feed this the
 * object refetched from Stripe (GET /subscriptions/:id) inside the webhook, never
 * the raw webhook payload — this is what makes out-of-order events safe.
 *
 * Plan id mapping: Stripe Price id → canonical plan id is resolved from the
 * `plans` table (price columns) or the PLAN_BY_PRICE map injected via n8n env.
 */

/** Map Stripe subscription.status (+ flags) to our internal status enum. */
function toInternalStatus(stripeSub) {
  const s = stripeSub.status; // trialing|active|past_due|canceled|unpaid|incomplete|incomplete_expired|paused
  if (s === 'trialing') return 'trialing';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  if (s === 'incomplete' || s === 'paused') return 'incomplete';
  // active:
  if (stripeSub.cancel_at_period_end) return 'cancel_scheduled';
  return 'active';
}

function isoOrNull(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

/**
 * Build the Appwrite `subscriptions` row payload.
 * @param stripeSub refetched Stripe Subscription
 * @param userId    appwrite user id (from subscription.metadata.user_id)
 * @param planId    canonical plan id resolved from the active price
 * @param pendingPlanId canonical plan id of a scheduled downgrade, or null
 * @param existing  current Appwrite row (for plan_since preservation), or null
 */
function buildSubscriptionRow(stripeSub, userId, planId, pendingPlanId, existing) {
  const status = toInternalStatus(stripeSub);
  // plan_since: keep existing unless this is a new/upgraded plan starting now.
  const planChanged = !existing || existing.plan_id !== planId;
  const planSince = planChanged ? new Date().toISOString() : existing.plan_since;

  return {
    status,
    payload: {
      user_id: userId,
      stripe_customer_id: stripeSub.customer,
      stripe_subscription_id: stripeSub.id,
      stripe_schedule_id: stripeSub.schedule || null,
      plan_id: planId,
      status,
      pending_plan_id: pendingPlanId || null,
      current_period_start: isoOrNull(stripeSub.current_period_start),
      current_period_end: isoOrNull(stripeSub.current_period_end),
      cancel_at_period_end: !!stripeSub.cancel_at_period_end,
      trial_ends_at: isoOrNull(stripeSub.trial_end),
      plan_since: planSince,
      updated_at: new Date().toISOString(),
    },
  };
}

module.exports = { toInternalStatus, buildSubscriptionRow, isoOrNull };
