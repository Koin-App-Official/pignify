import { describe, it, expect } from 'vitest';
import { formatNumber, formatMoney, formatDate, formatMonthYear } from './format';

const NBSP = ' ';

describe('formatNumber', () => {
  it('groups thousands with a comma for en', () => {
    expect(formatNumber(1000, 'en')).toBe('1,000');
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });

  it('groups thousands with NBSP for pl, including below 10,000', () => {
    // Phase 0 found Hermes' Intl.NumberFormat('pl-PL') only groups above
    // 9999 — this must group correctly at every magnitude.
    expect(formatNumber(1000, 'pl')).toBe(`1${NBSP}000`);
    expect(formatNumber(9999, 'pl')).toBe(`9${NBSP}999`);
    expect(formatNumber(1234567, 'pl')).toBe(`1${NBSP}234${NBSP}567`);
  });

  it('uses the real NBSP codepoint (U+00A0), not a lookalike space', () => {
    const formatted = formatNumber(1000, 'pl');
    const separatorIndex = 1; // '1' | separator | '000'
    expect(formatted.charCodeAt(separatorIndex)).toBe(0xa0);
  });

  it('does not force trailing decimal zeros on whole numbers', () => {
    expect(formatNumber(1000, 'en')).toBe('1,000');
    expect(formatNumber(1000, 'pl')).toBe(`1${NBSP}000`);
  });

  it('uses a period decimal separator for en and a comma for pl', () => {
    expect(formatNumber(1000.5, 'en')).toBe('1,000.5');
    expect(formatNumber(1000.5, 'pl')).toBe(`1${NBSP}000,5`);
  });

  it('handles small numbers with no grouping needed', () => {
    expect(formatNumber(1, 'en')).toBe('1');
    expect(formatNumber(999, 'pl')).toBe('999');
  });

  it('handles zero and negative amounts', () => {
    expect(formatNumber(0, 'en')).toBe('0');
    expect(formatNumber(-1000, 'en')).toBe('-1,000');
    expect(formatNumber(-1000, 'pl')).toBe(`-1${NBSP}000`);
  });
});

describe('formatMoney', () => {
  it('formats USD with the symbol before the amount (en)', () => {
    expect(formatMoney(1000, { symbol: '$', symbolAfter: false }, 'en')).toBe('$1,000');
  });

  it('formats PLN with the symbol after the amount (pl), grouped correctly below 10,000', () => {
    expect(formatMoney(1000, { symbol: 'zł', symbolAfter: true }, 'pl')).toBe(`1${NBSP}000 zł`);
  });
});

describe('formatMonthYear', () => {
  it('formats an English month/year', () => {
    expect(formatMonthYear('2026-08-16', 'en')).toBe('August 2026');
  });

  it('formats a Polish month/year with the correct standalone nominative name', () => {
    expect(formatMonthYear('2026-08-16', 'pl')).toBe('sierpień 2026');
  });
});

describe('formatDate', () => {
  it('formats a full date for en', () => {
    expect(formatDate('2026-08-16', 'en', { month: 'long', day: 'numeric', year: 'numeric' })).toBe(
      'August 16, 2026'
    );
  });

  it('formats a full date for pl', () => {
    expect(formatDate('2026-08-16', 'pl', { month: 'long', day: 'numeric', year: 'numeric' })).toBe(
      '16 sierpnia 2026'
    );
  });

  it('accepts a Date object as well as an ISO string', () => {
    expect(formatDate(new Date(2026, 7, 16), 'en', { month: 'long', year: 'numeric' })).toBe('August 2026');
  });
});
