import { describe, it, expect } from 'vitest';
import { detectDeviceLanguage, matchSupportedLanguage, SUPPORTED_LANGUAGES } from './detect';

describe('detectDeviceLanguage', () => {
  it('never throws, and always returns a supported language', () => {
    // expo-localization isn't available under vitest (no native module
    // registry) — this asserts the function degrades to its 'en' fallback
    // rather than crashing store.ts's module-level DEFAULT_PROFILE.
    expect(() => detectDeviceLanguage()).not.toThrow();
    expect(SUPPORTED_LANGUAGES).toContain(detectDeviceLanguage());
  });
});

describe('matchSupportedLanguage', () => {
  // The actual device-code-matching logic, tested directly (Phase 7,
  // implementations/I18N_SCALE.md) — detectDeviceLanguage() itself can't
  // exercise these cases under vitest, since expo-localization always
  // throws there and every path falls through to 'en'.
  it('matches a bare supported language code', () => {
    expect(matchSupportedLanguage('pl')).toBe('pl');
    expect(matchSupportedLanguage('en')).toBe('en');
  });

  it('strips a region suffix before matching', () => {
    expect(matchSupportedLanguage('pl-PL')).toBe('pl');
    expect(matchSupportedLanguage('en-US')).toBe('en');
  });

  it('falls back to en for an unsupported language code', () => {
    expect(matchSupportedLanguage('de')).toBe('en');
    expect(matchSupportedLanguage('fr-CA')).toBe('en');
  });

  it('falls back to en for a region tag whose base language is unsupported', () => {
    // The exact case the plan's Phase 7 called out: a regional tag must
    // resolve by its base language, not fail to match at all.
    expect(matchSupportedLanguage('de-AT')).toBe('en');
  });

  it('falls back to en for null, undefined, or an empty string', () => {
    expect(matchSupportedLanguage(null)).toBe('en');
    expect(matchSupportedLanguage(undefined)).toBe('en');
    expect(matchSupportedLanguage('')).toBe('en');
  });
});
