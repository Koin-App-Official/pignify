import { describe, it, expect } from 'vitest';
import { detectDeviceLanguage, SUPPORTED_LANGUAGES } from './detect';

describe('detectDeviceLanguage', () => {
  it('never throws, and always returns a supported language', () => {
    // expo-localization isn't available under vitest (no native module
    // registry) — this asserts the function degrades to its 'en' fallback
    // rather than crashing store.ts's module-level DEFAULT_PROFILE.
    expect(() => detectDeviceLanguage()).not.toThrow();
    expect(SUPPORTED_LANGUAGES).toContain(detectDeviceLanguage());
  });
});
