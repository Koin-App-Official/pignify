/**
 * n8n Code-node logic: derive the billing-anchored period key.
 *
 * Mirrors src/lib/quota.ts `periodKeyFromStart`. The period key is the date part
 * (YYYY-MM-DD) of the Stripe subscription's current_period_start — usage counters
 * reset lazily when this changes. Stripe gives current_period_start as a UNIX
 * epoch (seconds).
 *
 * Pure function so it can be unit-tested; in an n8n Code node call it with the
 * value from the refetched Stripe subscription, e.g.:
 *   const key = periodKeyFromUnix($json.subscription.current_period_start);
 */
function periodKeyFromUnix(currentPeriodStartUnixSeconds) {
  if (!currentPeriodStartUnixSeconds) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return new Date(currentPeriodStartUnixSeconds * 1000).toISOString().slice(0, 10);
}

module.exports = { periodKeyFromUnix };
