import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fireMilestoneNotification,
  refreshNotificationSchedule,
  getNotificationPermissionStatus,
  DEFAULT_HOUR,
} from './notifications';
import {
  computeStreak,
  getDailySavingsTarget,
  getTodayString,
  getWeekMondayString,
  isValidDateString,
  sumDepositsForDate,
  sumDepositsSince,
} from './deposits';
import {
  MISSION_CATALOG,
  buildMissionContext,
  selectMissions,
  type MissionCadence,
  type MissionContext,
} from './missions';
import { PIGGY_STORE_VERSION, migratePiggyState } from './storeMigrations';
import { PLAN_RANK } from './entitlements';
import { detectDeviceLanguage, type SupportedLanguage } from './i18n/detect';

export interface Goal {
  id: string;
  template: string;
  icon: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  createdAt: string;
  /**
   * `date` is a plain calendar day (`YYYY-MM-DD`), matching `Expense.date` and
   * the streak fields — NOT a full ISO timestamp. Per-day readers compare on
   * day strings, so a timestamp here silently breaks the streak. Builds before
   * the v1 persist migration wrote timestamps; see src/lib/deposits.ts.
   */
  deposits: { date: string; amount: number }[];
  isPrimary: boolean;
  /**
   * How this goal's deadline was set. Undefined on pre-flip goals — treat as
   * 'deadline' at read time, since `deadline` was always picked directly then.
   */
  planningMode?: 'contribution' | 'deadline';
  /**
   * The monthly amount chosen (contribution mode) or derived (deadline mode)
   * for this goal. Undefined on pre-flip goals; fall back to deriving it from
   * `targetAmount`/`deadline` at read time.
   */
  monthlyContribution?: number;
  /**
   * Archived goals stay visible (never auto-deleted, constraint C4) but do NOT
   * count toward plan goal limits (constraint C7). On downgrade, goals the user
   * does not keep are archived rather than removed.
   */
  archived?: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
}

/**
 * One catalog def assigned to the current period. The catalog content itself
 * (title, reward, verifier) lives in `missions.ts` and is never persisted —
 * only the assignment is. See implementations/MISSIONS.md Phase 2.
 */
export interface ActiveMission {
  /** Foreign key into MISSION_CATALOG — resolve via MISSION_CATALOG.find(). */
  defId: string;
  cadence: MissionCadence;
  /** Calendar day (daily) or that week's Monday (weekly) this was assigned for. */
  periodKey: string;
  claimed: boolean;
  claimedAt?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

/**
 * Plan tiers. `beginner` is the $5.99 entry tier — it was called `free` on the
 * client until #83, while the backend (`entitlements.effective_plan_id`, the
 * `plans` table) always called it `beginner`. The names now match; persisted
 * `free` values are migrated in storeMigrations.ts v3 -> v4.
 */
export type UserPlan = 'beginner' | 'medium' | 'family';

/**
 * @deprecated Per-plan AI message limits now live in `entitlements.ts`
 * (PLAN_CONFIG[plan].quotas.aiMessages). Kept temporarily for backward compat
 * with existing imports; prefer the entitlements module.
 */
export const PLAN_MESSAGE_LIMITS: Record<UserPlan, number> = {
  beginner: 0,
  medium: 6,
  family: 20,
};

/**
 * Subscription lifecycle. `expired` is a lapsed 14-day trial that never
 * converted — distinct from `canceled` (a paid subscription the user ended), so
 * the lockout screen can tell the two apart. `past_due` is a renewal payment
 * that failed with Stripe retries still pending — access continues through
 * the grace period (`resolve-entitlements.js` still treats it as entitled),
 * it's deliberately not a lockout reason here. Mirrors the Appwrite
 * `entitlements.status` enum.
 */
export type PlanStatus = 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due';

export interface UserProfile {
  userID?: string;
  name: string;
  email: string;
  /** ISO date (yyyy-mm-dd) confirmed during the onboarding 18+ age gate. */
  dateOfBirth: string;
  country: string;
  currency: string;
  plan: UserPlan;
  /** Subscription lifecycle state. */
  planStatus: PlanStatus;
  /**
   * Scheduled lower-tier plan that takes effect at the next billing cycle.
   * null when no downgrade is pending. Downgrades never apply immediately
   * (constraint C2) and never auto-delete data (C4).
   */
  pendingPlan: UserPlan | null;
  /** ISO timestamp when the current paid period ends (cancel/downgrade boundary). */
  currentPeriodEnd: string | null;
  /** ISO timestamp the current plan began — basis for loyalty tenure (C18/C19). */
  planSince: string | null;
  /**
   * ISO timestamp the 14-day no-card trial ends, as granted by CLAUDE_onboarding
   * and reported by CLAUDE_entitlements_get. null once a real subscription
   * exists, or before the first entitlements sync has landed.
   */
  trialEndsAt: string | null;
  monthlyIncome: number | null;
  incomeSkipped: boolean;
  /**
   * How the user planned their goal: 'contribution' (set aside $X/month, date
   * derived) or 'deadline' (picked a date, contribution derived). Pre-flip
   * accounts have no value persisted here — treat missing as 'deadline' at
   * read time, since that was the only mode that existed before.
   */
  planningMode: 'contribution' | 'deadline';
  /**
   * The monthly amount the user chose to set aside in contribution mode.
   * null until they've gone through the contribution-first flow.
   */
  monthlyContribution: number | null;
  /**
   * @deprecated Alias for the chosen monthly contribution, kept for backward
   * compat with pre-flip data and code that hasn't migrated to
   * `monthlyContribution` yet. Revisit in Phase 4.
   */
  estimatedMonthlySavings: number | null;
  personalityType?: string;
  level: number;
  xp: number;
  streak: number;
  /** Lifetime count of claimed missions — drives the 'Mission Master' achievement. */
  missionsCompletedTotal: number;
  /** Lesson ids answered correctly — see lessons.ts. Backs the money-quiz mission's verifier. */
  lessonsCompleted: string[];
  lastActiveDate: string;
  /** Last calendar day `checkAndUpdateStreak` has fully evaluated — prevents double-counting a day. */
  lastStreakCheckDate: string;
  /** Consecutive days the daily check-in reminder fired with the target unmet. Drives reminder decay. */
  checkinIgnoredStreak: number;
  /** Tally of app-foreground events per local hour-of-day (index 0-23) — the send-time personalization signal. */
  activityHourCounts: number[];
  onboardingCompleted: boolean;
  /**
   * True once the pre-signup value-proposition carousel has been dismissed
   * (finished or skipped). Lives here rather than in its own storage key so it
   * is cleared by "Reset Data" along with everything else — a demo reset should
   * replay the real first-launch experience, carousel included.
   *
   * Existing installs rehydrate this as `undefined`, which is falsy; that's
   * harmless because they also have `onboardingCompleted: true`, and the
   * carousel is only ever reachable when onboarding hasn't been completed.
   */
  welcomeSeen: boolean;
  /**
   * True once the user has acknowledged the trial-intro gate. Keeps that screen
   * to a single appearance without needing a separate storage key, and is
   * cleared by "Reset Data" along with the rest of the profile.
   */
  trialIntroSeen: boolean;
  /**
   * Set when onboarding finishes and cleared by the dashboard once it has fired
   * the celebration. Onboarding no longer has a success screen of its own — it
   * hands straight off to the plan gate and PIN setup — so this is what lets the
   * confetti land after all of that, on a genuinely finished account.
   */
  justOnboarded: boolean;
  expenses: Expense[];
  notificationPrefs: {
    paydayReminder: boolean;
    streakProtection: boolean;
    milestoneAlerts: boolean;
    weeklyReflection: boolean;
  };
  /**
   * Grace period before the app re-locks after being backgrounded (unlocked
   * only — the app always re-locks immediately on a killed/relaunched process
   * regardless of this setting). 0 = immediate (default, matches pre-existing
   * behavior), null = never lock on backgrounding.
   */
  autoLockMinutes: 0 | 1 | 5 | null;
  /**
   * App display language. Seeded from the device for brand-new profiles
   * (`detectDeviceLanguage`, below) — existing installs are backfilled to
   * 'en' by the v4→v5 migration instead, so an app update never silently
   * changes a returning user's language (see implementations/I18N_PL.md's
   * Decisions). Independent of `country`/`currency`: a Polish speaker in the
   * UK wants `pl` copy with `GBP` amounts.
   */
  language: SupportedLanguage;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  email: '',
  dateOfBirth: '',
  country: '',
  currency: 'USD',
  plan: 'beginner',
  planStatus: 'active',
  pendingPlan: null,
  currentPeriodEnd: null,
  planSince: null,
  trialEndsAt: null,
  monthlyIncome: null,
  incomeSkipped: false,
  planningMode: 'contribution',
  monthlyContribution: null,
  estimatedMonthlySavings: null,
  level: 1,
  xp: 0,
  streak: 0,
  missionsCompletedTotal: 0,
  lessonsCompleted: [],
  lastActiveDate: new Date().toISOString().split('T')[0],
  lastStreakCheckDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
  checkinIgnoredStreak: 0,
  activityHourCounts: new Array(24).fill(0),
  onboardingCompleted: false,
  welcomeSeen: false,
  trialIntroSeen: false,
  justOnboarded: false,
  expenses: [],
  notificationPrefs: {
    paydayReminder: true,
    streakProtection: true,
    milestoneAlerts: true,
    weeklyReflection: true,
  },
  autoLockMinutes: 0,
  language: detectDeviceLanguage(),
};

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', title: 'First Step', description: 'Create your first savings goal', icon: '🎯', unlocked: false },
  { id: 'a2', title: 'Streak Starter', description: 'Save 3 days in a row', icon: '🔥', unlocked: false },
  { id: 'a3', title: 'Week Warrior', description: 'Complete a 7-day streak', icon: '⚡', unlocked: false },
  { id: 'a4', title: 'Mission Master', description: 'Complete 5 missions', icon: '🏆', unlocked: false },
  { id: 'a5', title: 'Quarter Way', description: 'Reach 25% of a goal', icon: '🌱', unlocked: false },
  { id: 'a6', title: 'Halfway Hero', description: 'Reach 50% of a goal', icon: '💪', unlocked: false },
  { id: 'a7', title: 'Almost There', description: 'Reach 75% of a goal', icon: '🚀', unlocked: false },
  { id: 'a8', title: 'Goal Crusher', description: 'Complete a savings goal', icon: '👑', unlocked: false },
  { id: 'a9', title: 'Budget Boss', description: 'Track expenses for 7 days', icon: '📊', unlocked: false },
  { id: 'a10', title: 'Level Up', description: 'Reach Saver Level 3', icon: '⭐', unlocked: false },
  { id: 'a11', title: 'Consistency King', description: '30-day streak', icon: '💎', unlocked: false },
  { id: 'a12', title: 'Smart Saver', description: 'Complete the AI personality quiz', icon: '🧠', unlocked: false },
];

export const GOAL_TEMPLATES = [
  { id: 'holiday', name: 'Holiday', icon: '✈️', suggestedAmount: 2000 },
  { id: 'concert', name: 'Concert', icon: '🎵', suggestedAmount: 300 },
  { id: 'car', name: 'Car', icon: '🚗', suggestedAmount: 15000 },
  { id: 'emergency', name: 'Emergency Fund', icon: '🛡️', suggestedAmount: 5000 },
  { id: 'laptop', name: 'Laptop', icon: '💻', suggestedAmount: 1500 },
  { id: 'education', name: 'Education', icon: '📚', suggestedAmount: 10000 },
  { id: 'apartment', name: 'Apartment', icon: '🏠', suggestedAmount: 20000 },
  { id: 'wedding', name: 'Wedding', icon: '💍', suggestedAmount: 25000 },
  { id: 'trip', name: 'First Trip', icon: '🌍', suggestedAmount: 1000 },
  { id: 'purchase', name: 'Big Purchase', icon: '🎁', suggestedAmount: 500 },
];

export const COUNTRIES = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'DK', name: 'Denmark', currency: 'DKK' },
  { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
];

export const CURRENCIES = [
  { code: 'USD', symbol: '$',    name: 'US Dollar',          symbolAfter: false },
  { code: 'EUR', symbol: '€',    name: 'Euro',               symbolAfter: false },
  { code: 'GBP', symbol: '£',    name: 'British Pound',      symbolAfter: false },
  { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar',    symbolAfter: false },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar',  symbolAfter: false },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',     symbolAfter: false },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',       symbolAfter: false },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',       symbolAfter: false },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',       symbolAfter: false },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee',       symbolAfter: false },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar',   symbolAfter: false },
  { code: 'CHF', symbol: 'CHF',  name: 'Swiss Franc',        symbolAfter: false },
  { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona',      symbolAfter: true  },
  { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone',    symbolAfter: true  },
  { code: 'DKK', symbol: 'kr',   name: 'Danish Krone',       symbolAfter: true  },
  { code: 'PLN', symbol: 'zł',   name: 'Polish Złoty',       symbolAfter: true  },
  { code: 'AED', symbol: 'د.إ',  name: 'UAE Dirham',         symbolAfter: false },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand', symbolAfter: false },
  { code: 'NZD', symbol: 'NZ$',  name: 'New Zealand Dollar', symbolAfter: false },
];

export const EXPENSE_CATEGORIES = [
  { id: 'food', name: 'Food & Drinks', icon: '🍔' },
  { id: 'transport', name: 'Transport', icon: '🚌' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎮' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'bills', name: 'Bills', icon: '📄' },
  { id: 'health', name: 'Health', icon: '💊' },
  { id: 'education', name: 'Education', icon: '📖' },
  { id: 'other', name: 'Other', icon: '📌' },
];

export interface PiggyState {
  profile: UserProfile;
  goals: Goal[];
  activeMissions: ActiveMission[];
  /** Last ~10 defIds assigned, FIFO — selectMissions avoids repeating these. */
  recentMissionIds: string[];
  achievements: Achievement[];
  lastDailyReset: string;
  lastWeeklyReset: string;
  coachMessagesUsed: number;
  coachMessagesMonth: string;
  /**
   * Server-authoritative AI-message quota/usage for the current billing
   * period, synced from CLAUDE_entitlements_get (see [[coach-backend-streaming]]).
   * null until the first successful sync — callers should fall back to the
   * local calendar-month counter until then. This is the real enforcement;
   * the local counter above is optimistic UI only.
   */
  serverAiMessagesQuota: number | null;
  serverAiMessagesUsed: number | null;
  /** Purchased extra AI messages, not tied to a billing period (roll over indefinitely). */
  addonMessageBalance: number;
  deepAnalysisUsed: number;
  deepAnalysisMonth: string;
  lastProfileSync: string;

  setProfile: (p: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;

  /**
   * Apply a plan change. Upgrades (higher rank) take effect immediately (C1);
   * downgrades (lower rank) are scheduled for the next billing cycle (C2) and
   * stored in `pendingPlan` without mutating the active plan or any data (C4).
   * A trialing user has no real subscription to rank against — they're
   * provisioned onto Family regardless of what they'll pay for, so every
   * other tier would rank as a "downgrade" and get scheduled instead of
   * applied. Any target applies immediately while trialing, same as C1.
   *
   * NOTE: In production this state is authoritative on the backend and driven by
   * a Stripe webhook -> Appwrite sync, not the client. This client action is the
   * local apply point for the vertical slice (see entitlements.ts header).
   */
  changePlan: (target: UserPlan) => void;
  /**
   * Archive goals not in `keepGoalIds` (never deleted — C4, see `Goal.archived`),
   * then run the same scheduling `changePlan` does. Used when a downgrade would
   * exceed the target plan's limits (retention.ts) and the user has chosen what
   * to keep. Deliberately takes plain IDs rather than importing retention.ts's
   * evaluation here — that logic (and re-validating it, since counts can change
   * between the request and the confirm) lives in the UI layer (plans.tsx,
   * downgrade-selection.tsx), consistent with retention.ts staying a pure,
   * independently-tested module rather than folding its rules into the store.
   */
  applyDowngradeWithRetention: (target: UserPlan, keepGoalIds: string[]) => void;
  /** Cancel renewal; plan stays active until currentPeriodEnd (C3). */
  cancelPlan: () => void;
  /** Clear a scheduled downgrade before it takes effect. */
  clearPendingPlan: () => void;
  /** Apply a pending downgrade (called at cycle rollover; webhook-driven in prod). */
  applyPendingPlan: () => void;

  setGoals: (g: Goal[]) => void;
  addGoal: (g: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;

  /** Ensures 3 daily + 1 weekly assignments exist for the current period, rotating stale ones. Idempotent. */
  refreshActiveMissions: () => void;
  /**
   * Claim an assigned mission. Re-runs its verifier (if not manual) against
   * fresh state before granting XP — a stale UI can never grant a mission
   * that isn't actually met. Returns whether the claim succeeded.
   */
  claimMission: (defId: string) => boolean;
  /**
   * Record a correctly-answered lesson (idempotent — answering the same
   * lesson twice is a no-op). Does NOT claim the money-quiz mission itself;
   * the caller does that as a separate claimMission('money-quiz') call once
   * this has landed, same two-step shape as every other mission.
   */
  completeLesson: (lessonId: string) => void;

  /** Walks forward from `lastStreakCheckDate` to today, incrementing/breaking the streak per missed day. */
  checkAndUpdateStreak: () => void;
  /** Recomputes and reschedules every local notification category from current state. */
  refreshNotifications: () => void;
  /** Detects OS-level permission revocation (e.g. turned off in device Settings) and flips prefs off to match. */
  syncNotificationPermission: () => Promise<void>;
  /** Tallies the current local hour as an activity signal — the input to send-time personalization. */
  recordActivity: () => void;

  setAchievements: (a: Achievement[]) => void;
  unlockAchievement: (id: string) => void;

  addExpense: (expense: Expense) => void;
  addXP: (amount: number) => void;
  /** Draws from the plan's monthly quota first, then `addonMessageBalance`. */
  incrementCoachMessages: (messageLimit: number) => void;
  setAddonMessageBalance: (balance: number) => void;
  /** Called only after a confirmed-successful Deep Analysis webhook call. */
  incrementDeepAnalysis: () => void;
  setLastProfileSync: (ts: string) => void;
  setServerAiMessageUsage: (quota: number | null, used: number | null) => void;

  resetForDemo: () => void;
}

// Calendar-day helpers, deposit reads and the streak walk live in ./deposits so
// they can be unit-tested without pulling AsyncStorage/expo-notifications in.
// Re-exported here because existing call sites import them from the store.
export { getDailySavingsTarget };

/** The most-active hour-of-day from the tally, or `DEFAULT_HOUR` until there's enough signal (fewer than 5 samples). */
function getPreferredHour(counts: number[]): number {
  if (!Array.isArray(counts) || counts.length !== 24) return DEFAULT_HOUR;
  const total = counts.reduce((s, c) => s + c, 0);
  if (total < 5) return DEFAULT_HOUR;
  let bestHour = DEFAULT_HOUR;
  let bestCount = -1;
  for (let h = 0; h < 24; h++) {
    if (counts[h] > bestCount) {
      bestCount = counts[h];
      bestHour = h;
    }
  }
  return bestHour;
}

/** Reads current state and (re)schedules every local notification category. Swallows failures — never blocks the UI. */
const DAILY_MISSION_COUNT = 3;
const WEEKLY_MISSION_COUNT = 1;
/** FIFO cap on recentMissionIds — just enough history to avoid immediate repeats. */
const RECENT_MISSION_CAP = 10;

function pushRecentMissionIds(recent: string[], newIds: string[]): string[] {
  const merged = [...recent, ...newIds];
  return merged.slice(Math.max(0, merged.length - RECENT_MISSION_CAP));
}

/** Builds the pure MissionContext from live store state — see missions.ts. */
function toMissionContext(state: PiggyState): MissionContext {
  return buildMissionContext({
    goals: state.goals,
    profile: {
      level: state.profile.level,
      streak: state.profile.streak,
      monthlyContribution: state.profile.monthlyContribution,
      currency: state.profile.currency,
      lastActiveDate: state.profile.lastActiveDate,
    },
    expenses: state.profile.expenses,
    lessonsCompleted: state.profile.lessonsCompleted,
  });
}

function buildAndRefreshSchedule(state: PiggyState) {
  const { profile, goals } = state;
  const target = getDailySavingsTarget(goals);
  const today = getTodayString();
  const todaysSaved = sumDepositsForDate(goals, today);
  const targetMet = target === 0 || todaysSaved >= target;
  const remaining = Math.max(0, target - todaysSaved);
  const monday = getWeekMondayString();
  const savedThisWeek = sumDepositsSince(goals, monday);
  const expenseCountThisWeek = profile.expenses.filter((e) => e.date >= monday).length;

  refreshNotificationSchedule({
    streakProtectionEnabled: profile.notificationPrefs.streakProtection,
    milestoneAlertsEnabled: profile.notificationPrefs.milestoneAlerts,
    weeklyReflectionEnabled: profile.notificationPrefs.weeklyReflection,
    hasActiveTarget: target > 0,
    targetMet,
    streak: profile.streak,
    remainingLabel: formatCurrency(remaining, profile.currency),
    checkinIgnoredStreak: profile.checkinIgnoredStreak ?? 0,
    hasWeeklyActivity: savedThisWeek > 0 || expenseCountThisWeek > 0,
    preferredHour: getPreferredHour(profile.activityHourCounts),
    savedThisWeekLabel: formatCurrency(savedThisWeek, profile.currency),
    expenseCountThisWeek,
    planStatus: profile.planStatus,
    // `trialEndsAt` first: it's the only one of the two the entitlements sync
    // actually writes. `currentPeriodEnd` is set solely by the checkout-return
    // path in plans.tsx, so for a trial user it stays null — and the
    // trial-ending reminder would never be scheduled at all.
    currentPeriodEnd: profile.trialEndsAt ?? profile.currentPeriodEnd,
    planDisplayName: profile.plan,
  }).catch(() => {});
}

export const useStore = create<PiggyState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      goals: [],
      activeMissions: [],
      recentMissionIds: [],
      achievements: DEFAULT_ACHIEVEMENTS,
      lastDailyReset: getTodayString(),
      lastWeeklyReset: getWeekMondayString(),
      coachMessagesUsed: 0,
      coachMessagesMonth: getTodayString().slice(0, 7),
      serverAiMessagesQuota: null,
      serverAiMessagesUsed: null,
      addonMessageBalance: 0,
      deepAnalysisUsed: 0,
      deepAnalysisMonth: getTodayString().slice(0, 7),
      lastProfileSync: '',

      setProfile: (profile) => set({ profile }),
      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

      changePlan: (target) => set((state) => {
        const current = state.profile.plan;
        if (target === current) {
          // Re-selecting the active plan cancels any pending downgrade.
          return { profile: { ...state.profile, pendingPlan: null, planStatus: 'active' } };
        }
        if (PLAN_RANK[target] > PLAN_RANK[current] || state.profile.planStatus === 'trialing') {
          // Upgrade — immediate (C1). Resets loyalty tenure and clears pending state.
          // Also immediate for any target while trialing (see doc comment above).
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          return {
            profile: {
              ...state.profile,
              plan: target,
              planStatus: 'active',
              pendingPlan: null,
              planSince: now.toISOString(),
              currentPeriodEnd: periodEnd.toISOString(),
            },
          };
        }
        // Downgrade — scheduled for next cycle (C2); active plan and data untouched (C4).
        return { profile: { ...state.profile, pendingPlan: target } };
      }),

      applyDowngradeWithRetention: (target, keepGoalIds) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.archived || keepGoalIds.includes(g.id) ? g : { ...g, archived: true }
          ),
        }));
        get().changePlan(target);
      },

      cancelPlan: () => set((state) => ({
        profile: { ...state.profile, planStatus: 'canceled' },
      })),

      clearPendingPlan: () => set((state) => ({
        profile: { ...state.profile, pendingPlan: null },
      })),

      applyPendingPlan: () => set((state) => {
        const { pendingPlan } = state.profile;
        if (!pendingPlan) return {};
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        return {
          profile: {
            ...state.profile,
            plan: pendingPlan,
            pendingPlan: null,
            planSince: now.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
          },
        };
      }),

      setGoals: (goals) => set({ goals }),
      addGoal: (g) => set((state) => {
        const isPrimary = state.goals.length === 0;
        return { goals: [...state.goals, { ...g, isPrimary }] };
      }),
      updateGoal: (id, updates) => {
        const { profile, goals } = get();
        const before = goals.find((g) => g.id === id);

        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }));

        if (before && updates.savedAmount != null && profile.notificationPrefs.milestoneAlerts) {
          const target = updates.targetAmount ?? before.targetAmount;
          const name = updates.name ?? before.name;
          if (target > 0) {
            const prevPct = before.savedAmount / target;
            const newPct = updates.savedAmount / target;
            if (prevPct < 1 && newPct >= 1) {
              fireMilestoneNotification('👑 Goal crushed!', `You just hit ${name} — ${formatCurrency(updates.savedAmount, profile.currency)} saved.`).catch(() => {});
            } else {
              const thresholds: [number, string][] = [
                [0.75, '🚀'],
                [0.5, '💪'],
                [0.25, '🌱'],
              ];
              for (const [t, emoji] of thresholds) {
                if (prevPct < t && newPct >= t) {
                  fireMilestoneNotification(`${emoji} ${Math.round(t * 100)}% there!`, `You're ${Math.round(t * 100)}% of the way to ${name}! Keep going.`).catch(() => {});
                  break;
                }
              }
            }
          }
        }

        buildAndRefreshSchedule(get());
      },

      refreshActiveMissions: () => {
        const state = get();
        const today = getTodayString();
        const thisMonday = getWeekMondayString();
        const { lastDailyReset, lastWeeklyReset, activeMissions, recentMissionIds } = state;

        const dailyCount = activeMissions.filter((am) => am.cadence === 'daily' && am.periodKey === today).length;
        const weeklyCount = activeMissions.filter((am) => am.cadence === 'weekly' && am.periodKey === thisMonday).length;

        // Due on a period rollover (the persisted marker) OR when the current
        // period is simply missing assignments (first run, or after
        // resetForDemo left activeMissions empty) — either way, self-heal
        // rather than leave the screen with nothing to show.
        const dailyDue = lastDailyReset !== today || dailyCount < DAILY_MISSION_COUNT;
        const weeklyDue = lastWeeklyReset !== thisMonday || weeklyCount < WEEKLY_MISSION_COUNT;
        if (!dailyDue && !weeklyDue) return;

        const ctx = toMissionContext(state);
        // Keep whichever cadence ISN'T due; the due one gets fully replaced
        // below (not just topped up) so stale prior-period entries don't linger.
        let next = activeMissions.filter((am) => (am.cadence === 'daily' ? !dailyDue : !weeklyDue));
        let recent = recentMissionIds;

        if (dailyDue) {
          const picked = selectMissions(ctx, { cadence: 'daily', count: DAILY_MISSION_COUNT, periodKey: today, recentIds: recent });
          next = [...next, ...picked.map((def) => ({ defId: def.id, cadence: 'daily' as const, periodKey: today, claimed: false }))];
          recent = pushRecentMissionIds(recent, picked.map((d) => d.id));
        }
        if (weeklyDue) {
          const picked = selectMissions(ctx, { cadence: 'weekly', count: WEEKLY_MISSION_COUNT, periodKey: thisMonday, recentIds: recent });
          next = [...next, ...picked.map((def) => ({ defId: def.id, cadence: 'weekly' as const, periodKey: thisMonday, claimed: false }))];
          recent = pushRecentMissionIds(recent, picked.map((d) => d.id));
        }

        set({
          activeMissions: next,
          recentMissionIds: recent,
          ...(dailyDue ? { lastDailyReset: today } : {}),
          ...(weeklyDue ? { lastWeeklyReset: thisMonday } : {}),
        });
      },

      claimMission: (defId) => {
        const state = get();
        const entry = state.activeMissions.find((am) => am.defId === defId && !am.claimed);
        if (!entry) return false;

        const def = MISSION_CATALOG.find((d) => d.id === defId);
        if (!def) return false;

        if (def.verify !== 'manual' && !def.verify(toMissionContext(state))) return false;

        set((s) => ({
          activeMissions: s.activeMissions.map((am) =>
            am.defId === defId && !am.claimed ? { ...am, claimed: true, claimedAt: new Date().toISOString() } : am
          ),
        }));

        get().addXP(def.reward);

        const missionsCompletedTotal = get().profile.missionsCompletedTotal + 1;
        set((s) => ({ profile: { ...s.profile, missionsCompletedTotal } }));
        if (missionsCompletedTotal >= 5) get().unlockAchievement('a4');

        return true;
      },

      completeLesson: (lessonId) => set((s) =>
        s.profile.lessonsCompleted.includes(lessonId)
          ? s
          : { profile: { ...s.profile, lessonsCompleted: [...s.profile.lessonsCompleted, lessonId] } }
      ),

      checkAndUpdateStreak: () => {
        const { goals, profile } = get();
        const today = getTodayString();

        // Profiles persisted before this field existed load with it missing/invalid —
        // backfill rather than walking from an unparseable date.
        if (!isValidDateString(profile.lastStreakCheckDate)) {
          set((state) => ({
            profile: {
              ...state.profile,
              lastStreakCheckDate: today,
              checkinIgnoredStreak: state.profile.checkinIgnoredStreak ?? 0,
            },
          }));
          return;
        }

        if (profile.lastStreakCheckDate >= today) return;

        const { streak, ignored } = computeStreak({
          streak: profile.streak,
          ignored: profile.checkinIgnoredStreak ?? 0,
          lastCheckedDate: profile.lastStreakCheckDate,
          today,
          goals,
          dailyTarget: getDailySavingsTarget(goals),
        });

        set((state) => ({
          profile: {
            ...state.profile,
            streak,
            checkinIgnoredStreak: ignored,
            lastStreakCheckDate: today,
            lastActiveDate: today,
          },
        }));
        buildAndRefreshSchedule(get());
      },

      refreshNotifications: () => buildAndRefreshSchedule(get()),

      syncNotificationPermission: async () => {
        const { profile } = get();
        const prefs = profile.notificationPrefs;
        const anyEnabled = prefs.paydayReminder || prefs.streakProtection || prefs.milestoneAlerts || prefs.weeklyReflection;
        if (!anyEnabled) return;

        const granted = await getNotificationPermissionStatus();
        if (granted) return;

        set((state) => ({
          profile: {
            ...state.profile,
            notificationPrefs: {
              paydayReminder: false,
              streakProtection: false,
              milestoneAlerts: false,
              weeklyReflection: false,
            },
          },
        }));
        buildAndRefreshSchedule(get());
      },

      recordActivity: () => {
        const { profile } = get();
        const base = Array.isArray(profile.activityHourCounts) && profile.activityHourCounts.length === 24
          ? profile.activityHourCounts
          : new Array(24).fill(0);
        const hour = new Date().getHours();
        const counts = [...base];
        counts[hour] += 1;
        set((state) => ({ profile: { ...state.profile, activityHourCounts: counts } }));
      },

      setAchievements: (achievements) => set({ achievements }),
      unlockAchievement: (id) => {
        const { achievements, profile } = get();
        const achievement = achievements.find((a) => a.id === id);
        set((state) => ({
          achievements: state.achievements.map((a) =>
            a.id === id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a
          ),
        }));
        if (achievement && !achievement.unlocked && profile.notificationPrefs.milestoneAlerts) {
          fireMilestoneNotification('🏆 Achievement unlocked', achievement.title).catch(() => {});
        }
      },

      addExpense: (expense) => {
        set((state) => ({
          profile: { ...state.profile, expenses: [...state.profile.expenses, expense] },
        }));
        buildAndRefreshSchedule(get());
      },

      setLastProfileSync: (ts) => set({ lastProfileSync: ts }),
      setServerAiMessageUsage: (quota, used) => set({ serverAiMessagesQuota: quota, serverAiMessagesUsed: used }),

      incrementCoachMessages: (messageLimit) => set((state) => {
        const thisMonth = getTodayString().slice(0, 7);
        const used = state.coachMessagesMonth === thisMonth ? state.coachMessagesUsed : 0;
        if (used < messageLimit) {
          return { coachMessagesUsed: used + 1, coachMessagesMonth: thisMonth };
        }
        // Plan quota exhausted — draw from the purchased add-on balance instead.
        return {
          coachMessagesUsed: used,
          coachMessagesMonth: thisMonth,
          addonMessageBalance: Math.max(0, state.addonMessageBalance - 1),
        };
      }),

      setAddonMessageBalance: (balance) => set({ addonMessageBalance: balance }),

      incrementDeepAnalysis: () => set((state) => {
        const thisMonth = getTodayString().slice(0, 7);
        const used = state.deepAnalysisMonth === thisMonth ? state.deepAnalysisUsed : 0;
        return { deepAnalysisUsed: used + 1, deepAnalysisMonth: thisMonth };
      }),

      addXP: (amount) => set((state) => {
        const p = { ...state.profile };
        p.xp += amount;
        const newLevel = Math.floor(p.xp / 100) + 1;
        if (newLevel > p.level) p.level = newLevel;
        return { profile: p };
      }),

      resetForDemo: () => set((state) => ({
        // XP and level are lifetime achievements — never reset under any circumstances.
        profile: { ...DEFAULT_PROFILE, xp: state.profile.xp, level: state.profile.level },
        goals: [],
        // Left empty rather than repopulated here: refreshActiveMissions() is
        // self-healing (see its dailyCount/weeklyCount check) and runs again
        // on the next tab mount — which always happens next, since resetting
        // profile.onboardingCompleted to false redirects through onboarding
        // before the tabs (and missions.tsx) are reachable again.
        activeMissions: [],
        recentMissionIds: [],
        achievements: DEFAULT_ACHIEVEMENTS,
      })),
    }),
    {
      name: 'piggy-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: PIGGY_STORE_VERSION,
      // Migration steps live in storeMigrations.ts (pure, unit-tested) — this
      // module transitively pulls in react-native (AsyncStorage,
      // expo-notifications) and can't be imported under vitest at all.
      migrate: (persisted, from) => migratePiggyState(persisted, from) as PiggyState,
    }
  )
);

/**
 * Format a numeric amount with the correct currency symbol and position.
 * e.g. formatCurrency(1000, 'USD') → '$1,000'
 *      formatCurrency(1000, 'PLN') → '1,000 zł'
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const currency = CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = currency?.symbol ?? currencyCode;
  const formatted = amount.toLocaleString();
  return currency?.symbolAfter ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
}
