/**
 * n8n Code-node logic: resolve effective entitlements → the `entitlements` row.
 *
 * Server-authoritative twin of src/lib/subscription.ts `resolveEntitlements`,
 * adapted to the Appwrite flattened schema (snake_case, -1 = unlimited integers).
 * Input `plan` is the row read from the Appwrite `plans` table for the active
 * plan id. Output is the upsert payload for the `entitlements` table.
 *
 * Decisions baked in: cancellation/incomplete = FULL LOCKOUT (everything zeroed,
 * locked=true); loyalty discount only while status === 'active'.
 */
const RESOLVER_VERSION = 1;
const ENTITLED = ['trialing', 'active', 'past_due', 'cancel_scheduled'];

function resolveEntitlements({ plan, userId, status, pendingPlanId, currentPeriodEnd, loyaltyActive, addonAllowance }) {
  const locked = !ENTITLED.includes(status);
  const allowance = Math.max(0, addonAllowance || 0);

  if (locked) {
    return {
      user_id: userId,
      effective_plan_id: plan.plan_id,
      status,
      quota_incomes: 0, quota_goals: 0, quota_devices: 0,
      quota_ai_messages: 0, quota_email_reports: 0,
      feat_ai_coach: false, feat_email_reports: false, feat_exclusive_protection: false,
      feat_referral: false, feat_deep_analysis: false, feat_goal_bonus: false,
      feat_loyalty_discount: false,
      device_limit: 0,
      discount_active: false, discount_percent: 0,
      pending_plan_id: pendingPlanId || null,
      current_period_end: currentPeriodEnd || null,
      locked: true,
      resolver_version: RESOLVER_VERSION,
      computed_at: new Date().toISOString(),
    };
  }

  // -1 (unlimited) stays -1; otherwise add confirmed add-on allowance to AI quota.
  const aiQuota = plan.quota_ai_messages === -1
    ? -1
    : plan.quota_ai_messages + allowance;

  const discountActive = !!loyaltyActive && status === 'active' && !!plan.feat_loyalty_discount;

  return {
    user_id: userId,
    effective_plan_id: plan.plan_id,
    status,
    quota_incomes: plan.quota_incomes,
    quota_goals: plan.quota_goals,
    quota_devices: plan.quota_devices,
    quota_ai_messages: aiQuota,
    quota_email_reports: plan.quota_email_reports,
    feat_ai_coach: !!plan.feat_ai_coach,
    feat_email_reports: !!plan.feat_email_reports,
    feat_exclusive_protection: !!plan.feat_exclusive_protection,
    feat_referral: !!plan.feat_referral,
    feat_deep_analysis: !!plan.feat_deep_analysis,
    feat_goal_bonus: !!plan.feat_goal_bonus,
    feat_loyalty_discount: !!plan.feat_loyalty_discount,
    device_limit: plan.quota_devices,
    discount_active: discountActive,
    discount_percent: discountActive ? 10 : 0,
    pending_plan_id: pendingPlanId || null,
    current_period_end: currentPeriodEnd || null,
    locked: false,
    resolver_version: RESOLVER_VERSION,
    computed_at: new Date().toISOString(),
  };
}

module.exports = { resolveEntitlements, RESOLVER_VERSION };
