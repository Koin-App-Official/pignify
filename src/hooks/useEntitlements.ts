/**
 * Convenience hook binding the pure entitlements helpers to live store state.
 * Screens use this to decide whether an action is allowed before performing it,
 * and to drive the "Upgrade your plan" gate (constraint C13: gated features stay
 * visible and open the upgrade popup rather than disappearing).
 */
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  getPlanConfig,
  checkQuota,
  hasFeature,
  type PlanFeatures,
  type QuotaResource,
} from '@/lib/entitlements';

export function useEntitlements() {
  const plan = useStore((s) => s.profile.plan ?? 'free');
  const goals = useStore((s) => s.goals);
  const monthlyIncome = useStore((s) => s.profile.monthlyIncome);
  const coachMessagesUsed = useStore((s) => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return s.coachMessagesMonth === thisMonth ? s.coachMessagesUsed : 0;
  });

  return useMemo(() => {
    const config = getPlanConfig(plan);

    // Active (non-archived) goals are the only ones that count toward limits (C7).
    const activeGoals = goals.filter((g) => !g.archived).length;
    // Income is currently a single value; an unset income counts as 0 used.
    const incomesUsed = monthlyIncome != null ? 1 : 0;

    return {
      plan,
      config,
      has: (feature: keyof PlanFeatures) => hasFeature(plan, feature),
      quota: (resource: QuotaResource, used: number) => checkQuota(plan, resource, used),
      goals: checkQuota(plan, 'goals', activeGoals),
      incomes: checkQuota(plan, 'incomes', incomesUsed),
      aiMessages: checkQuota(plan, 'aiMessages', coachMessagesUsed),
      activeGoalCount: activeGoals,
      coachMessagesUsed,
    };
  }, [plan, goals, monthlyIncome, coachMessagesUsed]);
}
