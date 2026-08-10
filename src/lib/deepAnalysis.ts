/**
 * Deep Analysis trigger — client → n8n (GET, userId query param) → email.
 *
 * Unlike the AI Coach webhook, this call is NOT fire-and-forget: it must be
 * awaited and confirmed successful before the caller increments quota usage
 * (decision: only count a Deep Analysis against quota on confirmed success).
 */

import { createLogger } from './logger';

const log = createLogger('deepAnalysis');

// TODO: replace with the real n8n Deep Analysis webhook URL.
const DEEP_ANALYSIS_URL = 'https://n8n1.neuralops.pl/webhook-test/PLACEHOLDER-deep-analysis';

export type DeepAnalysisResult = { status: 'success' | 'error' };

export async function triggerDeepAnalysis(userId: string): Promise<DeepAnalysisResult> {
  try {
    const url = `${DEEP_ANALYSIS_URL}?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url, { method: 'GET' });
    return { status: res.ok ? 'success' : 'error' };
  } catch (err) {
    log.error('Deep Analysis webhook failed:', err);
    return { status: 'error' };
  }
}
