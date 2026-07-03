import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Goal {
  id: string;
  template: string;
  icon: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  createdAt: string;
  deposits: { date: string; amount: number }[];
  isPrimary: boolean;
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

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  reward: number;
  completed: boolean;
  completedAt?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export type UserPlan = 'free' | 'medium' | 'family';

/**
 * Ascending tier rank. Used to decide upgrade (immediate) vs downgrade
 * (next-cycle) transitions. Kept here (not in entitlements.ts) so the store can
 * use it without importing the entitlements module — entitlements imports this.
 */
export const PLAN_RANK: Record<UserPlan, number> = {
  free: 0,
  medium: 1,
  family: 2,
};

/**
 * @deprecated Per-plan AI message limits now live in `entitlements.ts`
 * (PLAN_CONFIG[plan].quotas.aiMessages). Kept temporarily for backward compat
 * with existing imports; prefer the entitlements module.
 */
export const PLAN_MESSAGE_LIMITS: Record<UserPlan, number> = {
  free: 0,
  medium: 6,
  family: 20,
};

export type PlanStatus = 'active' | 'trialing' | 'canceled';

export interface UserProfile {
  userID?: string;
  name: string;
  email: string;
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
  monthlyIncome: number | null;
  incomeSkipped: boolean;
  personalityType?: string;
  level: number;
  xp: number;
  streak: number;
  lastActiveDate: string;
  onboardingCompleted: boolean;
  expenses: Expense[];
  notificationPrefs: {
    paydayReminder: boolean;
    streakProtection: boolean;
    milestoneAlerts: boolean;
    weeklyReflection: boolean;
  };
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  email: '',
  country: '',
  currency: 'USD',
  plan: 'free',
  planStatus: 'active',
  pendingPlan: null,
  currentPeriodEnd: null,
  planSince: null,
  monthlyIncome: null,
  incomeSkipped: false,
  level: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: new Date().toISOString().split('T')[0],
  onboardingCompleted: false,
  expenses: [],
  notificationPrefs: {
    paydayReminder: true,
    streakProtection: true,
    milestoneAlerts: true,
    weeklyReflection: true,
  },
};

const DEFAULT_MISSIONS: Mission[] = [
  { id: 'm1', title: 'Skip a coffee', description: 'Save by making coffee at home', type: 'daily', reward: 5, completed: false },
  { id: 'm2', title: 'No-spend lunch', description: 'Pack lunch instead of buying', type: 'daily', reward: 10, completed: false },
  { id: 'm3', title: 'Save $5 today', description: 'Move $5 to your goal', type: 'daily', reward: 5, completed: false },
  { id: 'm4', title: 'Walk instead of ride', description: 'Save on transport', type: 'daily', reward: 3, completed: false },
  { id: 'm5', title: 'Weekly savings boost', description: 'Save an extra $20 this week', type: 'weekly', reward: 20, completed: false },
  { id: 'm6', title: 'Cancel a subscription', description: 'Review and cancel one unused subscription', type: 'weekly', reward: 15, completed: false },
];

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
  missions: Mission[];
  achievements: Achievement[];
  lastDailyReset: string;
  lastWeeklyReset: string;
  coachMessagesUsed: number;
  coachMessagesMonth: string;
  lastProfileSync: string;

  setProfile: (p: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;

  /**
   * Apply a plan change. Upgrades (higher rank) take effect immediately (C1);
   * downgrades (lower rank) are scheduled for the next billing cycle (C2) and
   * stored in `pendingPlan` without mutating the active plan or any data (C4).
   *
   * NOTE: In production this state is authoritative on the backend and driven by
   * a Stripe webhook -> Appwrite sync, not the client. This client action is the
   * local apply point for the vertical slice (see entitlements.ts header).
   */
  changePlan: (target: UserPlan) => void;
  /** Cancel renewal; plan stays active until currentPeriodEnd (C3). */
  cancelPlan: () => void;
  /** Clear a scheduled downgrade before it takes effect. */
  clearPendingPlan: () => void;
  /** Apply a pending downgrade (called at cycle rollover; webhook-driven in prod). */
  applyPendingPlan: () => void;

  setGoals: (g: Goal[]) => void;
  addGoal: (g: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;

  setMissions: (m: Mission[]) => void;
  completeMission: (id: string) => void;
  checkAndResetMissions: () => void;

  setAchievements: (a: Achievement[]) => void;
  unlockAchievement: (id: string) => void;

  addExpense: (expense: Expense) => void;
  addXP: (amount: number) => void;
  incrementCoachMessages: () => void;
  setLastProfileSync: (ts: string) => void;

  resetForDemo: () => void;
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getWeekMondayString() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

export const useStore = create<PiggyState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      goals: [],
      missions: DEFAULT_MISSIONS,
      achievements: DEFAULT_ACHIEVEMENTS,
      lastDailyReset: getTodayString(),
      lastWeeklyReset: getWeekMondayString(),
      coachMessagesUsed: 0,
      coachMessagesMonth: getTodayString().slice(0, 7),
      lastProfileSync: '',

      setProfile: (profile) => set({ profile }),
      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

      changePlan: (target) => set((state) => {
        const current = state.profile.plan;
        if (target === current) {
          // Re-selecting the active plan cancels any pending downgrade.
          return { profile: { ...state.profile, pendingPlan: null, planStatus: 'active' } };
        }
        if (PLAN_RANK[target] > PLAN_RANK[current]) {
          // Upgrade — immediate (C1). Resets loyalty tenure and clears pending state.
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
      updateGoal: (id, updates) => set((state) => ({
        goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      })),

      setMissions: (missions) => set({ missions }),
      completeMission: (id) => set((state) => ({
        missions: state.missions.map((m) =>
          m.id === id ? { ...m, completed: true, completedAt: new Date().toISOString() } : m
        ),
      })),
      checkAndResetMissions: () => {
        const today = getTodayString();
        const thisMonday = getWeekMondayString();
        const { lastDailyReset, lastWeeklyReset, missions } = get();

        const dailyDue = lastDailyReset !== today;
        const weeklyDue = lastWeeklyReset !== thisMonday;
        if (!dailyDue && !weeklyDue) return;

        set({
          missions: missions.map((m) => {
            if ((m.type === 'daily' && dailyDue) || (m.type === 'weekly' && weeklyDue)) {
              return { ...m, completed: false, completedAt: undefined };
            }
            return m;
          }),
          ...(dailyDue ? { lastDailyReset: today } : {}),
          ...(weeklyDue ? { lastWeeklyReset: thisMonday } : {}),
        });
      },

      setAchievements: (achievements) => set({ achievements }),
      unlockAchievement: (id) => set((state) => ({
        achievements: state.achievements.map((a) =>
          a.id === id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a
        ),
      })),

      addExpense: (expense) => set((state) => ({
        profile: { ...state.profile, expenses: [...state.profile.expenses, expense] },
      })),

      setLastProfileSync: (ts) => set({ lastProfileSync: ts }),

      incrementCoachMessages: () => set((state) => {
        const thisMonth = getTodayString().slice(0, 7);
        const used = state.coachMessagesMonth === thisMonth ? state.coachMessagesUsed : 0;
        return { coachMessagesUsed: used + 1, coachMessagesMonth: thisMonth };
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
        missions: DEFAULT_MISSIONS,
        achievements: DEFAULT_ACHIEVEMENTS,
      })),
    }),
    {
      name: 'piggy-storage',
      storage: createJSONStorage(() => AsyncStorage),
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
