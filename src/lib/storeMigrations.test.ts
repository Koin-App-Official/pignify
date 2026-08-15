import { describe, it, expect } from 'vitest';
import { PIGGY_STORE_VERSION, migratePiggyState } from './storeMigrations';

/**
 * A realistic pre-#63 AsyncStorage payload (persist version 0): full ISO
 * timestamps on deposits (the bug #63 fixed), the legacy `missions: Mission[]`
 * array (what Phase 2 replaces), and no `missionsCompletedTotal` on the
 * profile at all — every field a genuinely old install would actually have.
 */
const V0_PAYLOAD = {
  profile: {
    userID: 'user_abc123',
    name: 'Jamie',
    email: 'jamie@example.com',
    dateOfBirth: '1995-03-12',
    country: 'US',
    currency: 'USD',
    plan: 'free',
    planStatus: 'active',
    pendingPlan: null,
    currentPeriodEnd: null,
    planSince: null,
    monthlyIncome: 4000,
    incomeSkipped: false,
    planningMode: 'contribution',
    monthlyContribution: 300,
    estimatedMonthlySavings: 300,
    level: 3,
    xp: 240,
    streak: 0, // pinned at 0 by the #63 bug
    lastActiveDate: '2026-08-14',
    lastStreakCheckDate: '2026-08-14',
    checkinIgnoredStreak: 12,
    activityHourCounts: new Array(24).fill(0),
    onboardingCompleted: true,
    expenses: [
      { id: 'e1', amount: 12.5, category: 'food', date: '2026-08-14' },
    ],
    notificationPrefs: {
      paydayReminder: true,
      streakProtection: true,
      milestoneAlerts: true,
      weeklyReflection: true,
    },
    autoLockMinutes: 0,
    // no missionsCompletedTotal — didn't exist yet
  },
  goals: [
    {
      id: 'g1',
      template: '',
      icon: '🎯',
      name: 'Emergency Fund',
      targetAmount: 5000,
      savedAmount: 320,
      deadline: '2027-01-01',
      createdAt: '2026-06-01T10:00:00.000Z',
      // the #63 bug: full ISO timestamps instead of day strings
      deposits: [
        { date: '2026-08-10T09:15:32.000Z', amount: 20 },
        { date: '2026-08-12T18:02:11.000Z', amount: 300 },
      ],
      isPrimary: true,
      monthlyContribution: 300,
    },
  ],
  // the legacy flat catalog+state array Phase 2 replaces
  missions: [
    { id: 'm1', title: 'Skip a coffee', description: 'Save by making coffee at home', type: 'daily', reward: 5, completed: true, completedAt: '2026-08-14T08:00:00.000Z' },
    { id: 'm3', title: 'Save $5 today', description: 'Move $5 to your goal', type: 'daily', reward: 5, completed: false },
    { id: 'm5', title: 'Weekly savings boost', description: 'Save an extra $20 this week', type: 'weekly', reward: 20, completed: false },
  ],
  achievements: [
    { id: 'a1', title: 'First Step', description: 'Create your first savings goal', icon: '🎯', unlocked: true, unlockedAt: '2026-06-01T10:00:00.000Z' },
    { id: 'a4', title: 'Mission Master', description: 'Complete 5 missions', icon: '🏆', unlocked: false },
  ],
  lastDailyReset: '2026-08-14',
  lastWeeklyReset: '2026-08-10',
  coachMessagesUsed: 2,
  coachMessagesMonth: '2026-08',
  addonMessageBalance: 0,
  deepAnalysisUsed: 0,
  deepAnalysisMonth: '2026-08',
  lastProfileSync: '',
};

describe('migratePiggyState — v0 (pre-#63) → current', () => {
  const migrated = migratePiggyState(V0_PAYLOAD, 0) as any;

  it('normalizes deposit dates to calendar days (the #63 fix)', () => {
    expect(migrated.goals[0].deposits).toEqual([
      { date: '2026-08-10', amount: 20 },
      { date: '2026-08-12', amount: 300 },
    ]);
  });

  it('drops the legacy missions array entirely', () => {
    expect(migrated.missions).toBeUndefined();
  });

  it('seeds empty activeMissions and recentMissionIds', () => {
    expect(migrated.activeMissions).toEqual([]);
    expect(migrated.recentMissionIds).toEqual([]);
  });

  it('backfills missionsCompletedTotal to 0', () => {
    expect(migrated.profile.missionsCompletedTotal).toBe(0);
  });

  it('preserves unrelated profile and goal fields untouched', () => {
    expect(migrated.profile.name).toBe('Jamie');
    expect(migrated.profile.xp).toBe(240);
    expect(migrated.profile.streak).toBe(0);
    expect(migrated.goals[0].savedAmount).toBe(320);
    expect(migrated.goals[0].targetAmount).toBe(5000);
  });

  it('preserves top-level fields outside profile/goals/missions', () => {
    expect(migrated.achievements).toEqual(V0_PAYLOAD.achievements);
    expect(migrated.coachMessagesUsed).toBe(2);
    expect(migrated.lastDailyReset).toBe('2026-08-14');
  });
});

describe('migratePiggyState — v1 (post-#63, pre-Phase-2) → current', () => {
  // Deposits already normalized (the #63 migration already ran); still has
  // the legacy missions array and no missionsCompletedTotal.
  const v1Payload = {
    ...V0_PAYLOAD,
    goals: [
      {
        ...V0_PAYLOAD.goals[0],
        deposits: [
          { date: '2026-08-10', amount: 20 },
          { date: '2026-08-12', amount: 300 },
        ],
      },
    ],
  };

  const migrated = migratePiggyState(v1Payload, 1) as any;

  it('does not re-run the deposit-date step (already normalized)', () => {
    expect(migrated.goals[0].deposits).toEqual([
      { date: '2026-08-10', amount: 20 },
      { date: '2026-08-12', amount: 300 },
    ]);
  });

  it('still runs the v1 → v2 mission step', () => {
    expect(migrated.missions).toBeUndefined();
    expect(migrated.activeMissions).toEqual([]);
    expect(migrated.recentMissionIds).toEqual([]);
    expect(migrated.profile.missionsCompletedTotal).toBe(0);
  });
});

describe('migratePiggyState — already current (v2)', () => {
  const currentPayload = {
    profile: { ...V0_PAYLOAD.profile, missionsCompletedTotal: 7 },
    goals: [{ ...V0_PAYLOAD.goals[0], deposits: [{ date: '2026-08-10', amount: 20 }] }],
    activeMissions: [{ defId: 'save-today', cadence: 'daily', periodKey: '2026-08-15', claimed: false }],
    recentMissionIds: ['skip-coffee'],
    achievements: V0_PAYLOAD.achievements,
  };

  it('passes an already-current payload through unchanged', () => {
    const migrated = migratePiggyState(currentPayload, PIGGY_STORE_VERSION) as any;
    expect(migrated).toEqual(currentPayload);
  });

  it('does not clobber an existing missionsCompletedTotal if re-run from an older `from`', () => {
    // Defensive case: shouldn't happen in practice (zustand only calls migrate
    // when from < version), but the backfill must prefer an existing value.
    const migrated = migratePiggyState(currentPayload, 1) as any;
    expect(migrated.profile.missionsCompletedTotal).toBe(7);
  });
});

describe('migratePiggyState — edge cases', () => {
  it('returns null/undefined persisted state as-is', () => {
    expect(migratePiggyState(null, 0)).toBeNull();
    expect(migratePiggyState(undefined, 0)).toBeUndefined();
  });

  it('does not throw on a payload with no goals array', () => {
    expect(() => migratePiggyState({ profile: {} }, 0)).not.toThrow();
  });

  it('PIGGY_STORE_VERSION matches the highest migration step', () => {
    // Sanity guard: if a step is added above without bumping this, zustand
    // would never invoke migrate for it on a fresh v2 install.
    expect(PIGGY_STORE_VERSION).toBe(2);
  });
});
