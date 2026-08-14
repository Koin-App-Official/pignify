/**
 * I/O for CLAUDE_entitlements_get. Kept separate from entitlements.ts, which is
 * intentionally pure (no React, no store, no I/O) — see its header.
 */
import type { UserPlan } from './store';

const ENTITLEMENTS_URL = 'https://n8n.piggnify.com/webhook/claude-plan';

export interface EntitlementsSyncResult {
  plan?: UserPlan;
  quotaAiMessages?: number;
  aiMessagesUsed?: number;
}

/** Best-effort fetch — returns null on any failure (including abort) and never throws. */
export async function fetchEntitlementsSync(
  userID: string,
  signal?: AbortSignal
): Promise<EntitlementsSyncResult | null> {
  try {
    const res = await fetch(`${ENTITLEMENTS_URL}?user_id=${encodeURIComponent(userID)}`, { signal });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}
