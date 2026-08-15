import { describe, it, expect } from 'vitest';
import { LESSONS, lessonForDate } from './lessons';

describe('LESSONS', () => {
  it('has at least 15 items', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(15);
  });

  it('every lesson has a unique id', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every lesson has exactly 3 non-empty options', () => {
    for (const lesson of LESSONS) {
      expect(lesson.options).toHaveLength(3);
      for (const option of lesson.options) {
        expect(option.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every correctIndex is a valid index into options', () => {
    for (const lesson of LESSONS) {
      expect([0, 1, 2]).toContain(lesson.correctIndex);
    }
  });

  it('every lesson has a non-empty question and explanation', () => {
    for (const lesson of LESSONS) {
      expect(lesson.question.trim().length).toBeGreaterThan(0);
      expect(lesson.explanation.trim().length).toBeGreaterThan(0);
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
