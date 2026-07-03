/**
 * Declarative TablesDB schema for the subscription & entitlement system.
 *
 * Target: the EXISTING database `piggnify_mobile_db` (Appwrite TablesDB API).
 * This file defines the new, additive tables for billing/entitlements (the
 * `tables` array below). The pre-existing `users` and `goals` tables are not
 * managed by createTable here (they predate this script), but as of 2026-06-15
 * they have been aligned to these same conventions — see LEGACY_TABLES_ALIGNED
 * at the bottom for their final shape. The legacy `ai_chat` table was dropped
 * (unused).
 *
 * Conventions (aligned to the live project):
 *  - snake_case keys (matches existing `user_id`, `first_name`, ...).
 *  - Money stored as INTEGER MINOR UNITS (cents) — no floats for money.
 *  - Per-user access via an indexed `user_id` string column (NOT relationships,
 *    which do not scale in Appwrite).
 *  - Quota integers use -1 to mean "unlimited".
 *  - Appwrite forbids a default on a REQUIRED column; columns that carry a
 *    `default` are therefore declared `required: false`.
 */

export const UNLIMITED = -1;

/** The existing live database. Override via APPWRITE_DATABASE_ID if needed. */
export const DEFAULT_DATABASE_ID = 'piggnify_mobile_db';

export const SUBSCRIPTION_STATES = [
  'trialing', 'active', 'past_due', 'cancel_scheduled', 'canceled', 'incomplete',
];

const PLAN_IDS = ['beginner', 'medium', 'family'];

// Column builders ---------------------------------------------------------------
const str = (key, size, required = false, def = undefined, array = false) =>
  ({ type: 'string', key, size, required, default: def, array });
const int = (key, required = false, def = undefined, array = false) =>
  ({ type: 'integer', key, required, default: def, array });
const flt = (key, required = false, def = undefined) =>
  ({ type: 'float', key, required, default: def });
const bool = (key, required = false, def = undefined) =>
  ({ type: 'boolean', key, required, default: def });
const dt = (key, required = false) => ({ type: 'datetime', key, required });
const en = (key, elements, required = false, def = undefined, array = false) =>
  ({ type: 'enum', key, elements, required, default: def, array });

/**
 * Plan catalog seed (canonical plan ids). NOTE the naming seam: the live
 * `users.plan` currently holds "free" — that maps to canonical "beginner".
 * Reconciling/migrating that value is an open decision (Q-naming).
 * Prices are in CENTS.
 */
export const PLAN_SEED = [
  {
    plan_id: 'beginner', display_name: 'Beginner', rank: 0, price_cents: 599,
    quota_incomes: 1, quota_goals: 1, quota_devices: 1, quota_ai_messages: 0, quota_email_reports: 0,
    extra_message_price_cents: null,
    feat_ai_coach: false, feat_email_reports: false, feat_exclusive_protection: false,
    feat_referral: false, feat_deep_analysis: false, feat_goal_bonus: false, feat_loyalty_discount: false,
    email_report_soft_cap: 0, trial_days: 0, version: 1, active: true,
  },
  {
    plan_id: 'medium', display_name: 'Medium', rank: 1, price_cents: 799,
    quota_incomes: 1, quota_goals: 2, quota_devices: 1, quota_ai_messages: 6, quota_email_reports: 3,
    extra_message_price_cents: 199,
    feat_ai_coach: true, feat_email_reports: true, feat_exclusive_protection: true,
    feat_referral: false, feat_deep_analysis: false, feat_goal_bonus: false, feat_loyalty_discount: false,
    email_report_soft_cap: 0, trial_days: 0, version: 1, active: true,
  },
  {
    plan_id: 'family', display_name: 'Family', rank: 2, price_cents: 999,
    quota_incomes: 3, quota_goals: UNLIMITED, quota_devices: UNLIMITED, quota_ai_messages: 20,
    quota_email_reports: UNLIMITED, extra_message_price_cents: 99,
    feat_ai_coach: true, feat_email_reports: true, feat_exclusive_protection: true,
    feat_referral: true, feat_deep_analysis: true, feat_goal_bonus: true, feat_loyalty_discount: true,
    email_report_soft_cap: 100, trial_days: 7, version: 1, active: true,
  },
];

export const tables = [
  {
    id: 'plans',
    name: 'Plans',
    permissions: ['read("users")'], // public catalog
    rowSecurity: false,
    columns: [
      en('plan_id', PLAN_IDS, true),
      str('display_name', 64, true),
      int('rank', true),
      str('stripe_product_id', 128, false),
      str('stripe_price_id', 128, false),
      int('price_cents', true),
      int('quota_incomes', true), int('quota_goals', true), int('quota_devices', true),
      int('quota_ai_messages', true), int('quota_email_reports', true),
      int('extra_message_price_cents', false),
      str('extra_message_stripe_price_id', 128, false),
      bool('feat_ai_coach', true), bool('feat_email_reports', true),
      bool('feat_exclusive_protection', true), bool('feat_referral', true),
      bool('feat_deep_analysis', true), bool('feat_goal_bonus', true),
      bool('feat_loyalty_discount', true),
      int('email_report_soft_cap', false, 0),
      int('trial_days', true),
      int('version', true),
      bool('active', false, true),
    ],
    indexes: [
      { key: 'idx_plan_id', type: 'unique', columns: ['plan_id'] },
      { key: 'idx_stripe_price_id', type: 'key', columns: ['stripe_price_id'] },
    ],
  },

  {
    id: 'subscriptions',
    name: 'Subscriptions',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      str('stripe_customer_id', 128, false),
      str('stripe_subscription_id', 128, false),
      str('stripe_schedule_id', 128, false),
      en('plan_id', PLAN_IDS, true),
      en('status', SUBSCRIPTION_STATES, true),
      en('pending_plan_id', PLAN_IDS, false),
      dt('current_period_start', false),
      dt('current_period_end', false),
      bool('cancel_at_period_end', false, false),
      dt('trial_ends_at', false),
      dt('plan_since', false),
      // Loyalty tenure anchor: set on first activation, survives upgrades/
      // downgrades, reset only on cancellation/lapse. Drives the 10% discount.
      dt('active_since', false),
      dt('updated_at', false),
    ],
    indexes: [
      { key: 'idx_user_id', type: 'unique', columns: ['user_id'] },
      { key: 'idx_stripe_customer_id', type: 'key', columns: ['stripe_customer_id'] },
      { key: 'idx_stripe_subscription_id', type: 'key', columns: ['stripe_subscription_id'] },
      { key: 'idx_current_period_end', type: 'key', columns: ['current_period_end'] },
    ],
  },

  {
    id: 'entitlements',
    name: 'Entitlements',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      en('effective_plan_id', PLAN_IDS, true),
      en('status', SUBSCRIPTION_STATES, true),
      int('quota_incomes', true), int('quota_goals', true), int('quota_devices', true),
      int('quota_ai_messages', true), int('quota_email_reports', true),
      bool('feat_ai_coach', true), bool('feat_email_reports', true),
      bool('feat_exclusive_protection', true), bool('feat_referral', true),
      bool('feat_deep_analysis', true), bool('feat_goal_bonus', true),
      bool('feat_loyalty_discount', true),
      int('device_limit', true),
      bool('discount_active', false, false),
      int('discount_percent', false, 0),
      en('pending_plan_id', PLAN_IDS, false),
      dt('current_period_end', false),
      bool('locked', false, false),
      int('resolver_version', true),
      dt('computed_at', true),
    ],
    indexes: [
      { key: 'idx_user_id', type: 'unique', columns: ['user_id'] },
    ],
  },

  {
    id: 'usage_counters',
    name: 'Usage Counters',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      str('period_key', 32, true),
      en('resource', ['ai_messages', 'email_reports'], true),
      int('used', false, 0),
      int('allowance_bonus', false, 0),
      int('limit_snapshot', false, 0),
    ],
    indexes: [
      { key: 'idx_user_period_resource', type: 'unique', columns: ['user_id', 'period_key', 'resource'] },
      { key: 'idx_user_id', type: 'key', columns: ['user_id'] },
    ],
  },

  {
    id: 'addon_purchases',
    name: 'Add-on Purchases',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      en('type', ['extra_ai_message'], true),
      int('quantity', false, 1),
      str('stripe_payment_intent_id', 128, false),
      en('status', ['pending', 'confirmed', 'failed'], true),
      str('period_key', 32, true),
      dt('created_at', true),
    ],
    indexes: [
      { key: 'idx_payment_intent', type: 'key', columns: ['stripe_payment_intent_id'] },
      { key: 'idx_user_period', type: 'key', columns: ['user_id', 'period_key'] },
    ],
  },

  {
    id: 'devices',
    name: 'Devices',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      str('device_id', 128, true),
      str('name', 128, false),
      str('platform', 32, false),
      dt('registered_at', true),
      dt('last_seen', false),
      bool('active', false, true),
    ],
    indexes: [
      { key: 'idx_user_device', type: 'unique', columns: ['user_id', 'device_id'] },
      { key: 'idx_user_active', type: 'key', columns: ['user_id', 'active'] },
    ],
  },

  {
    id: 'bonuses',
    name: 'Bonuses',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      en('type', ['referral', 'goal_achievement', 'loyalty_discount'], true),
      en('status', ['pending', 'active', 'consumed', 'expired'], true),
      int('free_months', false, 0),
      int('percent_off', false, 0),
      str('source', 128, false),
      str('stripe_coupon_id', 128, false),
      str('stripe_balance_txn_id', 128, false),
      str('applies_to_period_key', 32, false),
      dt('granted_at', false),
      dt('expires_at', false),
    ],
    indexes: [
      { key: 'idx_user_status', type: 'key', columns: ['user_id', 'status'] },
      { key: 'idx_type_status', type: 'key', columns: ['type', 'status'] },
    ],
  },

  {
    id: 'referrals',
    name: 'Referrals',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('code', 32, true),
      str('inviter_id', 64, true),
      str('invitee_id', 64, false),
      en('status', ['invited', 'signed_up', 'first_month_completed', 'rewarded'], true),
      dt('created_at', true),
      dt('qualified_at', false),
    ],
    indexes: [
      { key: 'idx_code', type: 'unique', columns: ['code'] },
      { key: 'idx_inviter_id', type: 'key', columns: ['inviter_id'] },
      { key: 'idx_invitee_id', type: 'key', columns: ['invitee_id'] },
    ],
  },

  {
    id: 'plan_change_requests',
    name: 'Plan Change Requests',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      en('from_plan_id', PLAN_IDS, true),
      en('to_plan_id', PLAN_IDS, true),
      en('type', ['upgrade', 'downgrade', 'cancel'], true),
      str('keep_goal_ids', 64, false, undefined, true),
      str('keep_income_ids', 64, false, undefined, true),
      str('keep_device_ids', 128, false, undefined, true),
      en('status', ['scheduled', 'applied', 'canceled', 'awaiting_selection'], true),
      dt('requested_at', true),
      dt('effective_at', false),
    ],
    indexes: [
      { key: 'idx_user_status', type: 'key', columns: ['user_id', 'status'] },
    ],
  },

  {
    id: 'webhook_events',
    name: 'Webhook Events',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('stripe_event_id', 128, true),
      str('type', 64, false),
      en('result', ['processed', 'ignored', 'error'], false),
      dt('processed_at', true),
    ],
    indexes: [
      { key: 'idx_event_id', type: 'unique', columns: ['stripe_event_id'] },
    ],
  },

  // Per-user income sources (Family allows up to 3; others 1). Replaces the single
  // `users.income` scalar so income limits + archived-exclusion can be enforced.
  // Money as integer cents. Denormalized indexed user_id (no relationship).
  {
    id: 'incomes',
    name: 'Incomes',
    permissions: [],
    rowSecurity: true,
    columns: [
      str('user_id', 64, true),
      str('label', 64, false),
      int('amount_cents', true),
      bool('archived', false, false),
      dt('created_at', true),
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', columns: ['user_id'] },
      { key: 'idx_user_archived', type: 'key', columns: ['user_id', 'archived'] },
    ],
  },

  // Append-only audit trail (security/ops §3). Server-write only (no client perms);
  // every subscription/bonus/device/admin mutation is logged with a redacted diff.
  // NOTE: `change_redacted` is capped at 8000 chars — a single 8000 utf8mb4 column
  // (~32KB) plus the id/meta columns fits MariaDB's ~64KB row-size limit; two large
  // before/after columns do NOT (hit column_limit_exceeded), so we store one diff.
  {
    id: 'audit_log',
    name: 'Audit Log',
    permissions: [],
    rowSecurity: true,
    columns: [
      en('actor', ['system', 'user', 'admin', 'stripe'], true),
      str('user_id', 64, false),
      str('action', 128, true),
      str('entity', 64, false),
      str('entity_id', 128, false),
      str('change_redacted', 8000, false), // JSON { before, after }, PII/secrets redacted
      str('source', 128, false),
      str('stripe_event_id', 128, false),
      str('n8n_execution_id', 128, false),
      dt('created_at', true),
    ],
    indexes: [
      { key: 'idx_user_created', type: 'key', columns: ['user_id', 'created_at'] },
      { key: 'idx_entity', type: 'key', columns: ['entity', 'entity_id'] },
      { key: 'idx_action', type: 'key', columns: ['action'] },
      { key: 'idx_stripe_event', type: 'key', columns: ['stripe_event_id'] },
    ],
  },
];

/**
 * Final shape of the pre-existing `users` and `goals` tables after aligning them
 * to the billing-era conventions (denormalized user_id, no relationships, money as
 * integer cents, rowSecurity on). Not managed by createTable above — documented
 * here as the source of truth. Applied live via MCP on the dates noted.
 *
 * `goals` (rowSecurity: true):
 *   - 2026-06-13: + user_id (string 64, optional, denormalized FK), + archived
 *     (boolean, default false), + indexes idx_user_id and idx_user_archived,
 *     backfilled user_id from the (now-removed) `users` relationship.
 *   - 2026-06-15: retired the two-way `users` relationship in favor of user_id;
 *     dropped the `price` float and replaced it with `price_cents` (integer, req,
 *     min 1) per the money-as-cents convention; enabled rowSecurity. Rows purged.
 *   Columns: deadline (datetime, req), goal_name (string 50, req), user_id
 *     (string 64), archived (boolean, default false), price_cents (integer, req).
 *
 * `users` (rowSecurity: true) — 2026-06-15: trimmed to identity-only. Dropped the
 *   `goals` relationship plus the legacy `income`, `estimated_monthly_savings`,
 *   `free_trial_left`, and `plan` columns (now owned by the `incomes`,
 *   `subscriptions`, and `entitlements` tables respectively).
 *   Columns: first_name, last_name, email, country, currency (all string, req).
 *
 * The legacy `ai_chat` table was dropped on 2026-06-15 (unused by the client).
 *
 * FOLLOW-UP (n8n, not yet applied): onboarding webhook must write goals.price_cents
 * (integer cents) and set per-row owner permissions on new goals rows now that
 * rowSecurity is on, and stop writing the dropped users columns; the sync endpoint
 * must source the plan from entitlements.effective_plan_id instead of users.plan.
 */
export const LEGACY_TABLES_ALIGNED = true;
