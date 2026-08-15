/**
 * The `piggy-storage` persist migration, factored out of store.ts so it's
 * unit-testable. store.ts cannot be imported under vitest at all — it
 * transitively pulls in `react-native` (via AsyncStorage and
 * expo-notifications), which fails to parse outside a React Native runtime —
 * so any logic worth testing has to live somewhere that doesn't import it.
 * Same rationale as goalMath.ts / deposits.ts / missions.ts.
 */
import { migrateGoalDepositDates } from './deposits';

/** Bump alongside a new migration step below, and in store.ts's persist config. */
export const PIGGY_STORE_VERSION = 2;

/**
 * Runs every migration step the persisted blob hasn't seen yet, in order.
 * Untyped in and out: a persisted blob from an old version structurally
 * cannot satisfy the current PiggyState (missing fields added since, or
 * carrying fields removed since) — store.ts casts the result at the call site
 * once every step below has run.
 */
export function migratePiggyState(persisted: unknown, from: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the
  // module doc: intermediate shapes are legacy and don't satisfy PiggyState.
  let state = persisted as any;

  // v0 → v1: normalize `goals[].deposits[].date` from full ISO timestamps to
  // `YYYY-MM-DD`. Older builds wrote `new Date().toISOString()` while every
  // reader compared against a day string, so per-day deposit reads always
  // returned 0 — pinning the streak at 0 for anyone with a target. Readers
  // normalize defensively too (see deposits.ts), so this step is about
  // cleaning the stored shape, not about correctness of reads.
  if (from < 1) {
    state = { ...state, goals: migrateGoalDepositDates(state.goals ?? []) };
  }

  // v1 → v2: the flat `missions: Mission[]` array (always the same six,
  // always all shown) is replaced by a static MISSION_CATALOG (missions.ts,
  // never persisted) plus per-period `activeMissions` assignments. Drop the
  // legacy key outright — the shapes aren't compatible, and
  // refreshActiveMissions() populates fresh assignments as soon as the app is
  // next foregrounded.
  if (from < 2) {
    const { missions: _legacyMissions, ...rest } = state;
    state = {
      ...rest,
      activeMissions: [],
      recentMissionIds: [],
      profile: { ...rest.profile, missionsCompletedTotal: rest.profile?.missionsCompletedTotal ?? 0 },
    };
  }

  return state;
}
