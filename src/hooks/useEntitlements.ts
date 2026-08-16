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
import { evaluatePeriodicQuota } from '@/lib/quota';

/**
 * Everything zeroed — the client-side mirror of the locked entitlements row the
 * server writes when a trial lapses or a subscription is cancelled.
 */
const LOCKED_PLAN_CONFIG = {
  ...getPlanConfig('beginner'),
  quotas: {
    incomes: 0,
    goals: 0,
    devices: 0,
    aiMessages: 0,
    emailReports: 0,
    deepAnalysis: 0,
  },
} as const;

export function useEntitlements() {
  const plan = useStore((s) => s.profile.plan ?? 'beginner');
  const goals = useStore((s) => s.goals);
  const monthlyIncome = useStore((s) => s.profile.monthlyIncome);
  const addonMessageBalance = useStore((s) => s.addonMessageBalance);
  const localCoachMessagesUsed = useStore((s) => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return s.coachMessagesMonth === thisMonth ? s.coachMessagesUsed : 0;
  });
  const serverAiMessagesQuota = useStore((s) => s.serverAiMessagesQuota);
  const serverAiMessagesUsed = useStore((s) => s.serverAiMessagesUsed);
  const deepAnalysisUsed = useStore((s) => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return s.deepAnalysisMonth === thisMonth ? s.deepAnalysisUsed : 0;
  });

  const locked = useStore(
    (s) => s.profile.planStatus === 'expired' || s.profile.planStatus === 'canceled'
  );

  return useMemo(() => {
    // A locked plan keeps its tier name (the lockout screen says which plan
    // lapsed), so quotas must not be read from that tier or an expired Family
    // user would still hold Family's limits. The server already zeroes the row;
    // this mirrors it client-side. Largely belt-and-braces since D12 means a
    // locked user can't reach the app at all — but it stops the leak existing.
    const config = locked ? LOCKED_PLAN_CONFIG : getPlanConfig(plan);

    // Active (non-archived) goals are the only ones that count toward limits (C7).
    const activeGoals = goals.filter((g) => !g.archived).length;
    // Income is currently a single value; an unset income counts as 0 used.
    const incomesUsed = monthlyIncome != null ? 1 : 0;

    // Prefer the server-authoritative quota/usage (synced from CLAUDE_entitlements_get,
    // which reflects the real enforcement in CLAUDE_coach_reply) once it's landed at
    // least once; fall back to the local calendar-month counter before first sync.
    // Take the max of server-known and local-optimistic usage so a message just sent
    // shows up immediately without waiting for the next hourly/foreground sync.
    const coachMessagesUsed =
      serverAiMessagesQuota != null ? Math.max(serverAiMessagesUsed ?? 0, localCoachMessagesUsed) : localCoachMessagesUsed;
    const aiMessagesLimit = serverAiMessagesQuota ?? config.quotas.aiMessages;

    return {
      plan,
      config,
      has: (feature: keyof PlanFeatures) => hasFeature(plan, feature),
      quota: (resource: QuotaResource, used: number) => checkQuota(plan, resource, used),
      goals: checkQuota(plan, 'goals', activeGoals),
      incomes: checkQuota(plan, 'incomes', incomesUsed),
      aiMessages: evaluatePeriodicQuota(aiMessagesLimit, coachMessagesUsed, addonMessageBalance),
      deepAnalysis: evaluatePeriodicQuota(config.quotas.deepAnalysis, deepAnalysisUsed),
      activeGoalCount: activeGoals,
      coachMessagesUsed,
      addonMessageBalance,
      deepAnalysisUsed,
    };
  }, [plan, locked, goals, monthlyIncome, localCoachMessagesUsed, serverAiMessagesQuota, serverAiMessagesUsed, addonMessageBalance, deepAnalysisUsed]);
}
