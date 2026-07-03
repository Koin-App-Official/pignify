/**
 * n8n Code-node logic for the incentive system (referrals, goal bonus, loyalty).
 *
 * Pure + idempotent. These run in n8n: the referral/goal-bonus grants in the
 * renewal pipeline (invoice.paid) and goal-completion path; the loyalty decision
 * in a sweep cron + renewal. Stripe is the money truth (coupons); `bonuses` is
 * the idempotency ledger; nothing here trusts the client.
 *
 * Bonus row shape (Appwrite `bonuses`):
 *   { user_id, type, status, free_months, percent_off, source,
 *     stripe_coupon_id, applies_to_period_key, granted_at, expires_at }
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 182 * DAY_MS; // ~6 months
const YEAR_MS = 365 * DAY_MS;

// ─── Referral ────────────────────────────────────────────────────────────────

/**
 * Decide the referral reward when the INVITEE completes their first paid month.
 * Call on the invitee's first non-trial invoice.paid.
 *
 * @param referral  the `referrals` row for this invitee, or null
 * @param isFirstPaidInvoice  true iff this is the invitee's first settled cycle
 * @param now Date
 * @returns { grant: boolean, referralUpdate, bonuses: [inviterBonus, inviteeBonus] }
 *          grant=false (no-op) when ineligible or already rewarded (idempotent).
 */
function evaluateReferralReward(referral, isFirstPaidInvoice, now = new Date()) {
  if (!referral || !isFirstPaidInvoice) return { grant: false };
  if (referral.status !== 'signed_up') return { grant: false }; // already rewarded / wrong state
  if (!referral.inviter_id || !referral.invitee_id) return { grant: false };
  if (referral.inviter_id === referral.invitee_id) return { grant: false }; // self-referral

  const mkBonus = (userId) => ({
    user_id: userId,
    type: 'referral',
    status: 'pending',
    free_months: 1,
    percent_off: 0,
    source: referral.$id, // idempotency: one referral → at most one bonus per user
    granted_at: now.toISOString(),
  });

  return {
    grant: true,
    referralUpdate: { status: 'rewarded', qualified_at: now.toISOString() },
    bonuses: [mkBonus(referral.inviter_id), mkBonus(referral.invitee_id)],
  };
}

// ─── Goal-achievement bonus ─────────────────────────────────────────────────

/**
 * Decide a goal-achievement bonus. Call from the server goal-completion path when
 * a non-archived goal first crosses saved_amount >= target.
 *
 * @param ctx {
 *   userId, goalId,
 *   featGoalBonus,            // Family-only feature flag from entitlements
 *   savedAmount, targetAmount,
 *   targetMinCents,           // anti-farming floor (config), e.g. 5000
 *   priorGoalBonuses,         // bonuses rows of type goal_achievement for user
 *   alreadyGrantedForGoal,    // bool: a bonus with source=goalId exists
 *   now }
 * @returns { grant, reason?, bonus? }
 */
function evaluateGoalBonus(ctx) {
  const now = ctx.now || new Date();
  if (!ctx.featGoalBonus) return { grant: false, reason: 'not_family' };
  if (ctx.savedAmount < ctx.targetAmount) return { grant: false, reason: 'incomplete' };
  if (ctx.targetMinCents && ctx.targetAmount < ctx.targetMinCents) {
    return { grant: false, reason: 'below_min_target' }; // anti-farming
  }
  if (ctx.alreadyGrantedForGoal) return { grant: false, reason: 'duplicate_goal' };

  // Once per rolling 365 days.
  const lastGrant = (ctx.priorGoalBonuses || [])
    .map((b) => new Date(b.granted_at).getTime())
    .sort((a, b) => b - a)[0];
  if (lastGrant && now.getTime() - lastGrant < YEAR_MS) {
    return { grant: false, reason: 'annual_cap' };
  }

  return {
    grant: true,
    bonus: {
      user_id: ctx.userId,
      type: 'goal_achievement',
      status: 'pending',
      free_months: 1,
      percent_off: 0,
      source: ctx.goalId, // idempotency: one bonus per goal completion
      granted_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 90 * DAY_MS).toISOString(),
    },
  };
}

// ─── Loyalty discount ───────────────────────────────────────────────────────

/**
 * Decide loyalty-discount state. Call from the sweep cron + renewal pipeline.
 * Tenure is measured from `active_since` (survives plan changes; reset on lapse).
 *
 * @param ctx { activeSince, status, featLoyaltyDiscount, hasActiveLoyaltyBonus, now }
 * @returns 'attach' | 'detach' | 'noop'
 *   attach = create 10%-forever coupon + bonuses(active)
 *   detach = remove coupon + bonus->expired (suspended when not active/not Family)
 */
function loyaltyDecision(ctx) {
  const now = (ctx.now || new Date()).getTime();
  const eligibleStatus = ctx.status === 'active';
  const tenureMet = ctx.activeSince && now - new Date(ctx.activeSince).getTime() >= SIX_MONTHS_MS;
  const shouldHave = eligibleStatus && !!ctx.featLoyaltyDiscount && tenureMet;

  if (shouldHave && !ctx.hasActiveLoyaltyBonus) return 'attach';
  if (!shouldHave && ctx.hasActiveLoyaltyBonus) return 'detach';
  return 'noop';
}

/**
 * Compute the loyalty anchor when activation state changes.
 * - first activation / restart after lapse → set active_since = now
 * - continued active (incl. plan change) → keep existing
 * - canceled/incomplete → clear (null) so a restart re-earns the 6 months
 */
function nextActiveSince(prevActiveSince, newStatus, now = new Date()) {
  const active = ['trialing', 'active', 'past_due', 'cancel_scheduled'].includes(newStatus);
  if (!active) return null;
  return prevActiveSince || now.toISOString();
}

// ─── Clawback (refund / dispute) ────────────────────────────────────────────

/**
 * Reverse an incentive on refund/dispute. Only unconsumed value is clawed back;
 * an already-consumed free month (a settled $0 invoice) is left as-is unless the
 * settled invoice itself is refunded.
 */
function clawbackBonus(bonus) {
  if (bonus.status === 'consumed') return { action: 'none', reason: 'already_consumed' };
  return { action: 'revoke', bonusUpdate: { status: 'expired' }, detachCoupon: !!bonus.stripe_coupon_id };
}

module.exports = {
  evaluateReferralReward,
  evaluateGoalBonus,
  loyaltyDecision,
  nextActiveSince,
  clawbackBonus,
};
