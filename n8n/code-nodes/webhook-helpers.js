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

/** Map a Stripe event type to an internal branch key (or 'ignore'). */
function routeEvent(event) {
  const t = event.type;
  switch (t) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return 'subscription'; // mirror + resolve
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return 'renewal'; // roll period, apply pending downgrade, eval bonuses/loyalty
    case 'invoice.payment_failed':
      return 'payment_failed';
    case 'payment_intent.succeeded':
      return event.data.object.metadata && event.data.object.metadata.type === 'extra_ai_message'
        ? 'addon_succeeded'
        : 'ignore';
    case 'payment_intent.payment_failed':
      return event.data.object.metadata && event.data.object.metadata.type === 'extra_ai_message'
        ? 'addon_failed'
        : 'ignore';
    case 'charge.refunded':
    case 'charge.dispute.created':
      return 'clawback';
    case 'customer.subscription.trial_will_end':
      return 'trial_will_end'; // notify only
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
