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

export interface UserProfile {
  name: string;
  email: string;
  country: string;
  currency: string;
  monthlyIncome: number;
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
  monthlyIncome: 0,
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
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
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

export interface PiggnifyState {
  profile: UserProfile;
  goals: Goal[];
  missions: Mission[];
  achievements: Achievement[];
  
  setProfile: (p: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  
  setGoals: (g: Goal[]) => void;
  addGoal: (g: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;

  setMissions: (m: Mission[]) => void;
  completeMission: (id: string) => void;

  setAchievements: (a: Achievement[]) => void;
  unlockAchievement: (id: string) => void;

  addExpense: (expense: Expense) => void;
  addXP: (amount: number) => void;
  
  resetForDemo: () => void;
}

export const useStore = create<PiggnifyState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      goals: [],
      missions: DEFAULT_MISSIONS,
      achievements: DEFAULT_ACHIEVEMENTS,

      setProfile: (profile) => set({ profile }),
      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

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

      setAchievements: (achievements) => set({ achievements }),
      unlockAchievement: (id) => set((state) => ({
        achievements: state.achievements.map((a) =>
          a.id === id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a
        ),
      })),

      addExpense: (expense) => set((state) => ({
        profile: { ...state.profile, expenses: [...state.profile.expenses, expense] },
      })),

      addXP: (amount) => set((state) => {
        const p = { ...state.profile };
        p.xp += amount;
        const newLevel = Math.floor(p.xp / 100) + 1;
        if (newLevel > p.level) p.level = newLevel;
        return { profile: p };
      }),

      resetForDemo: () => set({
        profile: DEFAULT_PROFILE,
        goals: [],
        missions: DEFAULT_MISSIONS,
        achievements: DEFAULT_ACHIEVEMENTS,
      }),
    }),
    {
      name: 'piggnify-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Backward compatibility adapter for non-reactive accesses (like original store.getProfile())
export const store = {
  getProfile: () => useStore.getState().profile,
  setProfile: (p: UserProfile) => useStore.getState().setProfile(p),
  updateProfile: (updates: Partial<UserProfile>) => useStore.getState().updateProfile(updates),
  
  getGoals: () => useStore.getState().goals,
  setGoals: (g: Goal[]) => useStore.getState().setGoals(g),
  addGoal: (g: Goal) => useStore.getState().addGoal(g),
  updateGoal: (id: string, updates: Partial<Goal>) => useStore.getState().updateGoal(id, updates),

  getMissions: () => useStore.getState().missions,
  setMissions: (m: Mission[]) => useStore.getState().setMissions(m),
  completeMission: (id: string) => useStore.getState().completeMission(id),

  getAchievements: () => useStore.getState().achievements,
  setAchievements: (a: Achievement[]) => useStore.getState().setAchievements(a),
  unlockAchievement: (id: string) => useStore.getState().unlockAchievement(id),

  addExpense: (expense: Expense) => useStore.getState().addExpense(expense),
  getTodaySpending: () => {
    const today = new Date().toISOString().split('T')[0];
    const p = useStore.getState().profile;
    return p.expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
  },
  addXP: (amount: number) => useStore.getState().addXP(amount),
  resetForDemo: () => useStore.getState().resetForDemo(),
};
