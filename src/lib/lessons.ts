/**
 * Local financial-literacy content for the "money quiz" mission (#67, Phase 4
 * of Missions v2). Deliberately static and local — no AI coach call, no
 * network, no per-plan quota. General financial literacy facts only, never
 * personalized or prescriptive advice (Piggy is not a licensed advisor).
 */

/**
 * Options are keyed rather than positional (Phase 4,
 * implementations/I18N_SCALE.md): a translator reordering `content.json`'s
 * `lessons.<id>.options` used to silently change which answer
 * `correctIndex` pointed at — the worst failure mode in this app's i18n
 * surface, wrong answers marked correct in a financial-literacy quiz.
 * `correctKey` names the answer directly instead of by position.
 */
export type LessonOptionKey = 'a' | 'b' | 'c';

/** Fixed, deterministic render order — never derive option order from `Object.keys()`/`Object.values()` on a translated `options` object, whose key order a JSON edit could reorder without anyone noticing. */
export const LESSON_OPTION_KEYS: readonly LessonOptionKey[] = ['a', 'b', 'c'];

/**
 * `topic`/`question`/`options`/`explanation` are not stored here — they live
 * entirely in `content.json`'s `lessons.<id>` (Phase 6,
 * implementations/I18N_SCALE.md), keyed on the raw `id` (LessonQuizModal.tsx
 * doesn't slugify, unlike missions). `id` and `correctKey` are the only
 * fields that are genuinely data rather than copy: `correctKey` is shared
 * across every locale and content.json's `contentParity.test.ts`
 * (`lessons: every locale's correctKey names one of that locale's own option
 * keys`) is what keeps it honest.
 */
export interface Lesson {
  id: string;
  correctKey: LessonOptionKey;
}

export const LESSONS: readonly Lesson[] = [
  { id: 'emergency-fund', correctKey: 'a' },
  { id: 'apy', correctKey: 'b' },
  { id: 'needs-vs-wants', correctKey: 'a' },
  { id: '50-30-20', correctKey: 'c' },
  { id: 'compound-interest', correctKey: 'a' },
  { id: 'budgeting-basics', correctKey: 'b' },
  { id: 'credit-score', correctKey: 'a' },
  { id: 'diversification', correctKey: 'b' },
  { id: 'inflation', correctKey: 'b' },
  { id: 'debt-snowball', correctKey: 'a' },
  { id: 'opportunity-cost', correctKey: 'b' },
  { id: 'net-worth', correctKey: 'b' },
  { id: 'automatic-savings', correctKey: 'a' },
  { id: 'high-yield-savings', correctKey: 'b' },
  { id: 'index-funds', correctKey: 'b' },
] as const;

/** FNV-1a — deterministic, dependency-free. Mirrors the hash in missions.ts (kept separate on purpose: lessons.ts stays a fully standalone module). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The lesson assigned to a given calendar day — stable for that date (same
 * input always returns the same lesson), independent of completion state.
 * Cycles back through the list roughly every LESSONS.length days.
 *
 * Deliberately NOT completion-aware: keeping the day→lesson mapping fixed
 * means eligibility and verification (see missions.ts's money-quiz def) agree
 * on which lesson "today" means, even at the exact moment completing it
 * changes what would otherwise be excluded.
 */
export function lessonForDate(dateStr: string): Lesson {
  const index = hashSeed(dateStr) % LESSONS.length;
  return LESSONS[index];
}
