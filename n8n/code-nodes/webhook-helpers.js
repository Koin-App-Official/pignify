/**
 * n8n Code-node helpers for the Stripe webhook workflow.
 *
 * Flow per event (architecture §8):
 *   Stripe Trigger (verifies signature)
 *     → Code: routeEvent  (decide branch; build dedup row)
 *     → HTTP: query webhook_events by stripe_event_id  (idempotency)
 *     → IF already processed → stop
 *     → branch handler (refetch object → write subscriptions → resolve → write entitlements)
 *     → HTTP: create webhook_events row (result=processed)
 */

/**
 * Map a Stripe event type to an internal branch key (or 'ignore').
 *
 * NOTE (2026-08-22, #136): this reference implementation predates the add-on
 * flow's pivot from PaymentIntent to hosted Checkout Session (implementations/
 * ADDONS.md) — the live `Route Event` code in `CLAUDE_stripe_webhook` does NOT
 * use `payment_intent.*` for add-ons; a `checkout.session.completed` event
 * branches into 'subscription' vs 'addon' by `mode`/`metadata.type` instead.
 * Kept here updated to match the live inline logic for reference, but the
 * live workflow is the source of truth — this file is not executed by it.
 */
function routeEvent(event) {
  const t = event.type;
  const obj = (event.data && event.data.object) || {};
  switch (t) {
    case 'checkout.session.completed':
      return obj.mode === 'payment' || (obj.metadata && obj.metadata.type === 'extra_ai_message')
        ? 'addon'
        : 'subscription';
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return 'subscription'; // mirror + resolve
    case 'invoice.paid':
      // A renewal reuses the 'subscription' branch as-is: refetching moves
      // current_period_start/end forward, which is all "roll the period"
      // requires (usage counters reset lazily elsewhere off that same field).
      // Applying a scheduled downgrade is NOT done here -- nothing in this
      // codebase writes subscriptions.pending_plan_id today.
      return 'subscription';
    case 'invoice.payment_failed':
      // Informational only -- Stripe already flips subscription.status to
      // past_due via customer.subscription.updated, already handled above.
      return 'payment_failed';
    case 'charge.refunded':
      // Only one-time (add-on) charges are actionable here -- a charge tied to
      // a subscription invoice (obj.invoice truthy) is left alone; its status
      // effects already flow through customer.subscription.updated/deleted.
      return obj.invoice ? 'ignore' : 'clawback_addon_refund';
    case 'charge.dispute.created':
      // Recorded as needs_review, not auto-revoked -- a dispute is provisional
      // and this workflow doesn't subscribe to its resolution event.
      return 'clawback_dispute';
    case 'customer.subscription.trial_will_end':
      return 'trial_will_end'; // notify only, recorded for a future feature
    default:
      return 'ignore';
  }
}

/** Payload for the idempotency ledger row in `webhook_events`. */
function eventRow(event, result) {
  return {
    stripe_event_id: event.id,
    type: event.type,
    result: result || 'processed',
    processed_at: new Date().toISOString(),
  };
}

/**
 * Build the atomic increment for a confirmed add-on (extra AI message).
 * In n8n: read the current usage_counters row for (user_id, period_key,
 * 'ai_messages'), then PATCH allowance_bonus = current + quantity. Returns the
 * new value to write. `current` is 0 if the counter row doesn't exist yet (the
 * handler should create it first).
 */
function addonAllowanceUpdate(currentAllowance, quantity) {
  return { allowance_bonus: (currentAllowance || 0) + (quantity || 1) };
}

module.exports = { routeEvent, eventRow, addonAllowanceUpdate };
