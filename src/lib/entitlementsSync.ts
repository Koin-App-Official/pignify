/**
 * I/O for CLAUDE_entitlements_get. Kept separate from entitlements.ts, which is
 * intentionally pure (no React, no store, no I/O) — see its header.
 */
import type { UserPlan, PlanStatus } from './store';

const ENTITLEMENTS_URL = 'https://n8n.piggnify.com/webhook/claude-plan';

export interface EntitlementsSyncResult {
  plan?: UserPlan;
  quotaAiMessages?: number;
  aiMessagesUsed?: number;
  /** Subscription lifecycle as the server sees it, including a lapsed trial. */
  status?: PlanStatus;
  /** True when the server has zeroed entitlements — expired trial or cancellation. */
  locked?: boolean;
  /** ISO timestamp the 14-day trial ends, or null once there's no trial. */
  trialEndsAt?: string | null;
}

/**
 * The webhook currently maps `beginner` → `free` on the way out, a leftover from
 * when the client used a different word for the entry tier (#83). Accept both so
 * the client doesn't depend on that mapping being removed in lockstep — once the
 * `Map Plan to App` node stops rewriting it, this keeps working unchanged.
 */
function normalizePlan(raw: unknown): UserPlan | undefined {
  if (raw === 'free' || raw === 'beginner') return 'beginner';
  if (raw === 'medium' || raw === 'family') return raw;
  return undefined;
}

const KNOWN_STATUSES: PlanStatus[] = ['active', 'trialing', 'canceled', 'expired', 'past_due'];

/**
 * The Appwrite enum carries states the client has no separate handling for
 * (`cancel_scheduled`, `incomplete`). Rather than widen `PlanStatus` for states
 * nothing branches on, anything unrecognised is dropped and the stored status
 * is left as-is; `locked` still comes through and is what actually gates
 * access.
 */
function normalizeStatus(raw: unknown): PlanStatus | undefined {
  return KNOWN_STATUSES.includes(raw as PlanStatus) ? (raw as PlanStatus) : undefined;
}

/** Best-effort fetch — returns null on any failure (including abort) and never throws. */
export async function fetchEntitlementsSync(
  userID: string,
  signal?: AbortSignal
): Promise<EntitlementsSyncResult | null> {
  try {
    const res = await fetch(`${ENTITLEMENTS_URL}?user_id=${encodeURIComponent(userID)}`, { signal });
    if (!res.ok) return null;
    const raw = await res.json().catch(() => null);
    if (!raw || typeof raw !== 'object') return null;

    const result: EntitlementsSyncResult = {};

    const plan = normalizePlan(raw.plan);
    if (plan) result.plan = plan;

    if (typeof raw.quotaAiMessages === 'number') result.quotaAiMessages = raw.quotaAiMessages;
    if (typeof raw.aiMessagesUsed === 'number') result.aiMessagesUsed = raw.aiMessagesUsed;

    const status = normalizeStatus(raw.status);
    if (status) result.status = status;

    if (typeof raw.locked === 'boolean') result.locked = raw.locked;

    // Explicit null is meaningful (no trial), so it's forwarded rather than dropped.
    if (typeof raw.trialEndsAt === 'string' || raw.trialEndsAt === null) {
      result.trialEndsAt = raw.trialEndsAt;
    }

    return result;
  } catch {
    return null;
  }
}
