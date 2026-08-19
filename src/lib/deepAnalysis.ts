/**
 * Deep Analysis trigger — client → n8n (POST, JSON body) → email.
 *
 * Unlike the AI Coach webhook, this call is NOT fire-and-forget: it must be
 * awaited and confirmed successful before the caller increments quota usage
 * (decision: only count a Deep Analysis against quota on confirmed success).
 *
 * POST + body (not GET + query string) because the request carries a real
 * money figure (savedMoney) — see #133. name/email/wage are looked up
 * server-side in n8n from Appwrite by userId; savedMoney has no server-side
 * representation (goals don't sync saved progress), so it must come from the
 * client's local state.
 */

import { createLogger } from './logger';
import type { SupportedLanguage } from './i18n/detect';

const log = createLogger('deepAnalysis');

const DEEP_ANALYSIS_URL = 'https://n8n.piggnify.com/webhook/cfbc46c0-bc70-4b9b-bdea-a6c881ee9019';

export type DeepAnalysisResult = { status: 'success' | 'error' };

export async function triggerDeepAnalysis(
  userId: string,
  language: SupportedLanguage,
  savedMoney: number
): Promise<DeepAnalysisResult> {
  try {
    const res = await fetch(DEEP_ANALYSIS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, language, saved_money: savedMoney }),
    });
    return { status: res.ok ? 'success' : 'error' };
  } catch (err) {
    log.error('Deep Analysis webhook failed:', err);
    return { status: 'error' };
  }
}
