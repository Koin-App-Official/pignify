import { describe, it, expect } from 'vitest';
import {
  describeCookieNames,
  isUsableSecret,
  parseCookieHeader,
  pickSessionCookie,
  sessionCookieNames,
} from './sessionSecret';

const PROJECT = '6a15741300220ae26d13';
const [CANONICAL, LEGACY] = sessionCookieNames(PROJECT);

describe('sessionCookieNames', () => {
  it('builds the canonical and legacy names', () => {
    expect(CANONICAL).toBe('a_session_6a15741300220ae26d13');
    expect(LEGACY).toBe('a_session_6a15741300220ae26d13_legacy');
  });
});

describe('isUsableSecret', () => {
  it('accepts a real token', () => {
    expect(isUsableSecret('eyJpZCI6IjY4...')).toBe(true);
  });

  // The whole bug: '' was accepted by client.setSession and produced a guest.
  it('rejects the empty string', () => {
    expect(isUsableSecret('')).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(isUsableSecret('   ')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret(null)).toBe(false);
    expect(isUsableSecret(0)).toBe(false);
  });
});

describe('pickSessionCookie', () => {
  it('finds the canonical cookie', () => {
    expect(pickSessionCookie({ [CANONICAL]: { value: 'tok' } }, PROJECT)).toBe('tok');
  });

  it('falls back to the legacy cookie', () => {
    expect(pickSessionCookie({ [LEGACY]: { value: 'legacy-tok' } }, PROJECT)).toBe('legacy-tok');
  });

  it('prefers canonical over legacy when both exist', () => {
    const cookies = { [CANONICAL]: { value: 'new' }, [LEGACY]: { value: 'old' } };
    expect(pickSessionCookie(cookies, PROJECT)).toBe('new');
  });

  it('ignores a present-but-empty cookie value', () => {
    expect(pickSessionCookie({ [CANONICAL]: { value: '' } }, PROJECT)).toBeNull();
  });

  it('skips an empty canonical in favour of a usable legacy', () => {
    const cookies = { [CANONICAL]: { value: '' }, [LEGACY]: { value: 'old' } };
    expect(pickSessionCookie(cookies, PROJECT)).toBe('old');
  });

  it('returns null for unrelated cookies', () => {
    expect(pickSessionCookie({ other: { value: 'x' } }, PROJECT)).toBeNull();
  });

  it('is total against null/undefined/malformed entries', () => {
    expect(pickSessionCookie(null, PROJECT)).toBeNull();
    expect(pickSessionCookie(undefined, PROJECT)).toBeNull();
    expect(pickSessionCookie({ [CANONICAL]: undefined }, PROJECT)).toBeNull();
    expect(pickSessionCookie({ [CANONICAL]: {} }, PROJECT)).toBeNull();
  });
});

describe('parseCookieHeader', () => {
  it('parses a multi-cookie header', () => {
    expect(parseCookieHeader('a=1; b=2')).toEqual({ a: { value: '1' }, b: { value: '2' } });
  });

  it('parses a single cookie without a trailing separator', () => {
    expect(parseCookieHeader(`${CANONICAL}=tok`)).toEqual({ [CANONICAL]: { value: 'tok' } });
  });

  it('does not URL-decode — the token must stay verbatim', () => {
    expect(parseCookieHeader('a=b%3Dc').a.value).toBe('b%3Dc');
  });

  it('keeps everything after the first = (tokens contain =)', () => {
    expect(parseCookieHeader('a=eyJ0=xyz==').a.value).toBe('eyJ0=xyz==');
  });

  it('skips malformed segments', () => {
    expect(parseCookieHeader('novalue; =noname; a=1')).toEqual({ a: { value: '1' } });
  });

  it('is total against empty and non-string input', () => {
    expect(parseCookieHeader('')).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('round-trips into pickSessionCookie', () => {
    const parsed = parseCookieHeader(`foo=bar; ${CANONICAL}=tok`);
    expect(pickSessionCookie(parsed, PROJECT)).toBe('tok');
  });
});

describe('describeCookieNames', () => {
  it('lists names for diagnostics', () => {
    expect(describeCookieNames({ a: 1, b: 2 })).toBe('a, b');
  });

  it('reports an empty jar distinctly', () => {
    expect(describeCookieNames({})).toBe('<none>');
    expect(describeCookieNames(null)).toBe('<none>');
    expect(describeCookieNames(undefined)).toBe('<none>');
  });

  it('never leaks a cookie value', () => {
    expect(describeCookieNames({ [CANONICAL]: { value: 'super-secret' } })).not.toContain('super-secret');
  });
});
