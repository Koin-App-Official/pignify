import { describe, it, expect } from 'vitest';
import { LESSONS, LESSON_OPTION_KEYS, lessonForDate } from './lessons';

// Copy (topic/question/options/explanation) lives entirely in content.json
// now (Phase 6, implementations/I18N_SCALE.md) — its own presence/shape
// checks are contentParity.test.ts's job (`lessons: every content.json
// lesson has topic, question, explanation, and exactly options a/b/c`,
// `lessons: every locale's correctKey names one of that locale's own option
// keys`). This file only owns what's actually data: ids and correctKey.
describe('LESSONS', () => {
  it('has at least 15 items', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(15);
  });

  it('every lesson has a unique id', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every correctKey is one of the valid option keys", () => {
    for (const lesson of LESSONS) {
      expect(LESSON_OPTION_KEYS, lesson.id).toContain(lesson.correctKey);
    }
  });
});

describe('lessonForDate', () => {
  it('is deterministic for the same date', () => {
    expect(lessonForDate('2026-08-15').id).toBe(lessonForDate('2026-08-15').id);
  });

  it('returns a lesson that is actually in LESSONS', () => {
    const lesson = lessonForDate('2026-08-15');
    expect(LESSONS.some((l) => l.id === lesson.id)).toBe(true);
  });

  it('varies across different dates', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(lessonForDate(`2026-08-${String(1 + i).padStart(2, '0')}`).id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never throws and always returns a defined lesson', () => {
    for (let i = 0; i < 60; i++) {
      const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-15`;
      expect(() => lessonForDate(date)).not.toThrow();
      expect(lessonForDate(date)).toBeDefined();
    }
  });
});
