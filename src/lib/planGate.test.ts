import { describe, it, expect } from 'vitest';
import {
  planGateReason,
  planGateReasonOnUnlock,
  trialDaysRemaining,
  lockoutEnforced,
  LOCKOUT_INTENDED,
  canSubscribe,
} from './planGate';
import type { PlanGateInput } from './planGate';

const base: PlanGateInput = {
  planStatus: 'trialing',
  trialIntroSeen: false,
  onboardingCompleted: true,
};

describe('planGateReason', () => {
  it('shows the trial intro to a freshly onboarded trial user', () => {
    expect(planGateReason(base)).toBe('trial_intro');
  });

  it('does not show the intro twice', () => {
    expect(planGateReason({ ...base, trialIntroSeen: true })).toBeNull();
  });

  it('locks on an expired trial', () => {
    expect(planGateReason({ ...base, planStatus: 'expired' })).toBe('locked');
  });

  it('locks on a cancelled subscription', () => {
    expect(planGateReason({ ...base, planStatus: 'canceled' })).toBe('locked');
  });

  it('prefers locked over the intro', () => {
    // Someone whose trial already lapsed should not be welcomed to a trial they
    // no longer have, even though they never saw the intro.
    expect(planGateReason({ ...base, planStatus: 'expired', trialIntroSeen: false })).toBe(
      'locked'
    );
  });

  it('never interrupts before onboarding completes', () => {
    // The gate lives in the auth state machine, which is live during onboarding
    // too — it must not pre-empt the flow that creates the account.
    expect(planGateReason({ ...base, onboardingCompleted: false })).toBeNull();
    expect(
      planGateReason({ ...base, onboardingCompleted: false, planStatus: 'expired' })
    ).toBeNull();
  });

  it('leaves an ordinary active subscriber alone', () => {
    expect(planGateReason({ ...base, planStatus: 'active', trialIntroSeen: true })).toBeNull();
    expect(planGateReason({ ...base, planStatus: 'active', trialIntroSeen: false })).toBeNull();
  });
});

describe('planGateReasonOnUnlock', () => {
  it('catches a trial that lapsed mid-week', () => {
    expect(planGateReasonOnUnlock({ ...base, planStatus: 'expired' })).toBe('locked');
  });

  it('does not resurface the intro on an ordinary unlock', () => {
    // The intro belongs to the onboarding hand-off; showing it days later on a
    // routine PIN unlock would be baffling.
    expect(planGateReasonOnUnlock(base)).toBeNull();
  });
});

describe('trialDaysRemaining', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('rounds partial days up', () => {
    // Six hours left is still "1 day", not "0".
    expect(trialDaysRemaining('2026-08-16T18:00:00.000Z', now)).toBe(1);
  });

  it('counts a full 14-day trial', () => {
    expect(trialDaysRemaining('2026-08-30T12:00:00.000Z', now)).toBe(14);
  });

  it('returns 0 once the end has passed', () => {
    expect(trialDaysRemaining('2026-08-01T00:00:00.000Z', now)).toBe(0);
  });

  it('returns 0 exactly at the boundary', () => {
    expect(trialDaysRemaining('2026-08-16T12:00:00.000Z', now)).toBe(0);
  });

  it('returns null when there is no trial', () => {
    expect(trialDaysRemaining(null, now)).toBeNull();
    expect(trialDaysRemaining(undefined, now)).toBeNull();
  });

  it('returns null on an unparseable date rather than NaN', () => {
    expect(trialDaysRemaining('not-a-date', now)).toBeNull();
  });
});

describe('canSubscribe', () => {
  it('allows checkout for a trialing user regardless of tier ranking', () => {
    // The trial provisions Family (the top tier), so every other target
    // would rank as a downgrade if ranking were consulted here — this is
    // the exact bug (#4/#5 in ONBOARDING_FIXES.md) the helper exists to fix.
    expect(canSubscribe('trialing', true)).toBe(true);
    expect(canSubscribe('trialing', false)).toBe(true);
  });

  it('allows checkout for an expired trial regardless of tier ranking', () => {
    expect(canSubscribe('expired', true)).toBe(true);
    expect(canSubscribe('expired', false)).toBe(true);
  });

  it('defers to tier ranking for an active subscriber', () => {
    expect(canSubscribe('active', true)).toBe(true);
    expect(canSubscribe('active', false)).toBe(false);
  });

  it('defers to tier ranking for a canceled subscription', () => {
    expect(canSubscribe('canceled', true)).toBe(true);
    expect(canSubscribe('canceled', false)).toBe(false);
  });
});

describe('lockoutEnforced', () => {
  it('enforces when checkout is reachable', () => {
    expect(lockoutEnforced(true)).toBe(true);
  });

  it('does NOT enforce when billing is unconfigured', () => {
    // The important one. A total lockout has no escape hatch, so enforcing it
    // while every Subscribe tap returns `unavailable` would strand the user on
    // a screen whose only action is broken. Letting them through costs revenue;
    // trapping them costs the user. This picks the first.
    expect(lockoutEnforced(false)).toBe(false);
  });

  it('still records the product intent', () => {
    // Guard: flipping the intent off would mean lapsed users silently keep
    // access forever, which should be a deliberate edit, not a drive-by.
    expect(LOCKOUT_INTENDED).toBe(true);
  });
});
