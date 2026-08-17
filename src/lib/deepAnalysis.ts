/**
 * Deep Analysis trigger — client → n8n (GET, userId query param) → email.
 *
 * Unlike the AI Coach webhook, this call is NOT fire-and-forget: it must be
 * awaited and confirmed successful before the caller increments quota usage
 * (decision: only count a Deep Analysis against quota on confirmed success).
 */

import { createLogger } from './logger';
import type { SupportedLanguage } from './i18n/detect';

const log = createLogger('deepAnalysis');

const DEEP_ANALYSIS_URL = 'https://n8n.piggnify.com/webhook/cfbc46c0-bc70-4b9b-bdea-a6c881ee9019';

export type DeepAnalysisResult = { status: 'success' | 'error' };

export async function triggerDeepAnalysis(
  userId: string,
  language: SupportedLanguage
): Promise<DeepAnalysisResult> {
  try {
    const url = `${DEEP_ANALYSIS_URL}?userId=${encodeURIComponent(userId)}&language=${encodeURIComponent(language)}`;
    const res = await fetch(url, { method: 'GET' });
    return { status: res.ok ? 'success' : 'error' };
  } catch (err) {
    log.error('Deep Analysis webhook failed:', err);
    return { status: 'error' };
  }
}
