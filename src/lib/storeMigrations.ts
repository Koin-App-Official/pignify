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
export const PIGGY_STORE_VERSION = 6;

/** Pre-#83 name of the entry tier, still present in every persisted blob. */
const LEGACY_BEGINNER = 'free';

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

  // v2 → v3: adds profile.lessonsCompleted (Phase 4, #67) for the money-quiz
  // mission's verifier. Older installs simply never answered any lesson.
  if (from < 3) {
    state = {
      ...state,
      profile: { ...state.profile, lessonsCompleted: state.profile?.lessonsCompleted ?? [] },
    };
  }

  // v3 → v4: the entry tier is renamed `free` → `beginner` (#83), matching the
  // name the backend has always used (`entitlements.effective_plan_id`, the
  // `plans` table). Without this step an installed app rehydrates
  // `plan: 'free'`, which no longer exists in PLAN_CONFIG, and every quota and
  // feature lookup silently falls back to the default tier.
  //
  // `pendingPlan` gets the same treatment: it holds a scheduled downgrade
  // target drawn from the same vocabulary, and a stale `free` there would be
  // applied verbatim at the next billing cycle.
  //
  // `trialEndsAt` is left alone rather than backfilled. These accounts predate
  // the trial entirely, and the next entitlements sync is authoritative anyway.
  if (from < 4) {
    const profile = state.profile ?? {};
    state = {
      ...state,
      profile: {
        ...profile,
        plan: profile.plan === LEGACY_BEGINNER ? 'beginner' : profile.plan,
        pendingPlan: profile.pendingPlan === LEGACY_BEGINNER ? 'beginner' : profile.pendingPlan,
      },
    };
  }

  // v4 → v5: adds profile.language (#120, Polish i18n) — the SupportedLanguage
  // ('en' | 'pl') driving react-i18next's active locale. Backfilled to 'en'
  // rather than device-detected: an app update should never silently flip a
  // returning user's language out from under them. Device detection only
  // seeds DEFAULT_PROFILE for brand-new installs (store.ts), which never go
  // through this migration path at all — see implementations/I18N_PL.md's
  // Decisions.
  if (from < 5) {
    state = {
      ...state,
      profile: { ...state.profile, language: state.profile?.language ?? 'en' },
    };
  }

  // v5 → v6: drops `title`/`description` from persisted `achievements` (#122,
  // i18n scale hardening — implementations/I18N_SCALE.md Phase 6). That copy
  // has lived entirely in content.json's `achievements.<id>` since #120 —
  // every real read already goes through `t(`content:achievements.${id}.title`)`
  // (app/(tabs)/missions.tsx, store.ts's unlockAchievement notification) —
  // so the persisted fields were already dead weight duplicating
  // content.json, just not yet cleaned out of installed state. `id`/`icon`/
  // `unlocked`/`unlockedAt` are the only fields anything actually reads off
  // the persisted array.
  if (from < 6) {
    state = {
      ...state,
      achievements: (state.achievements ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to drop these two keys
        ({ title, description, ...rest }: { title?: unknown; description?: unknown; [key: string]: unknown }) => rest
      ),
    };
  }

  return state;
}
