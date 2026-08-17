import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Star } from 'lucide-react-native';
import { ScreenTransition } from '@/components/ScreenTransition';
import { Button } from '@/components/ui/button';
import { useStore, UserPlan } from '@/lib/store';
import {
  PLAN_ORDER,
  getPlanConfig,
  isUpgrade,
  isDowngrade,
  isUnlimited,
  formatUSD,
  type PlanConfig,
} from '@/lib/entitlements';
import { startCheckout, requestSubscriptionSync } from '@/lib/billing';
import { canSubscribe } from '@/lib/planGate';
import { evaluateDowngradeRetention } from '@/lib/retention';
import { tablesDB, DATABASE_ID } from '@/lib/appwrite';
import { createLogger } from '@/lib/logger';
import { formatDate } from '@/lib/i18n/format';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const log = createLogger('plans');

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

/** Renders a quota bullet: the `xUnlimited` key when unlimited, else the
 * plural-aware `x_one`/`x_other` (en) or `x_one`/`x_few`/`x_many` (pl) key. */
function quotaLine(
  quota: PlanConfig['quotas']['incomes'],
  unlimitedKey: string,
  countKey: string,
  t: TFunction<'plans'>
): string {
  return isUnlimited(quota) ? t(unlimitedKey) : t(countKey, { count: quota });
}

/** Short feature bullets shown on each plan card. */
function planHighlights(c: PlanConfig, t: TFunction<'plans'>): string[] {
  const lines: string[] = [];
  lines.push(quotaLine(c.quotas.incomes, 'quota.incomeSourcesUnlimited', 'quota.incomeSources', t));
  lines.push(quotaLine(c.quotas.goals, 'quota.goalsUnlimited', 'quota.goals', t));
  lines.push(quotaLine(c.quotas.devices, 'quota.devicesUnlimited', 'quota.devices', t));
  if (c.features.aiCoach) {
    const extra = c.extraMessagePriceUSD != null ? t('quota.aiMessagesExtra', { price: formatUSD(c.extraMessagePriceUSD) }) : '';
    lines.push(quotaLine(c.quotas.aiMessages, 'quota.aiMessagesUnlimited', 'quota.aiMessages', t) + extra);
  }
  if (c.features.emailReports) {
    lines.push(quotaLine(c.quotas.emailReports, 'quota.emailReportsUnlimited', 'quota.emailReports', t));
  }
  if (c.features.exclusiveProtection) lines.push(t('feature.exclusiveProtection'));
  if (c.features.deepAnalysis) lines.push(t('feature.deepAnalysis'));
  if (c.features.referral) lines.push(t('feature.referral'));
  if (c.features.goalBonus) lines.push(t('feature.goalBonus'));
  if (c.features.loyaltyDiscount) lines.push(t('feature.loyaltyDiscount'));
  if (c.trialDays > 0) lines.push(t('feature.trialDays', { count: c.trialDays }));
  return lines;
}

export default function Plans() {
  const { t } = useTranslation('plans');
  const router = useRouter();
  const { highlight, checkout } = useLocalSearchParams<{ highlight?: string; checkout?: string }>();

  const profile = useStore((s) => s.profile);
  const goals = useStore((s) => s.goals);
  const changePlan = useStore((s) => s.changePlan);
  const updateProfile = useStore((s) => s.updateProfile);
  const [busy, setBusy] = useState<UserPlan | null>(null);
  const [syncing, setSyncing] = useState(false);

  const currentPlan = profile.plan;
  const pendingPlan = profile.pendingPlan;

  const formatPeriodEnd = () =>
    profile.currentPeriodEnd
      ? formatDate(profile.currentPeriodEnd, profile.language, { month: 'long', day: 'numeric', year: 'numeric' })
      : t('endOfBillingPeriod');

  /**
   * Trial state, derived rather than stored — `planStatus` and `trialEndsAt` are
   * both written by the entitlements sync, so this stays truthful without any
   * local timer. Returns null when there's no trial to talk about.
   *
   * Note there is no way to pay yet: the payment rail is deliberately deferred
   * (plan decision D11), so the expired copy points at what the user loses
   * rather than promising a checkout that doesn't exist.
   */
  const trialBanner = (() => {
    if (profile.planStatus === 'expired') {
      return {
        expired: true,
        title: t('trial.endedTitle'),
        body: t('trial.endedBody', { plan: getPlanConfig(currentPlan).displayName }),
      };
    }
    if (profile.planStatus !== 'trialing' || !profile.trialEndsAt) return null;

    const msLeft = new Date(profile.trialEndsAt).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return {
      expired: false,
      title: daysLeft === 0 ? t('trial.endsToday') : t('trial.daysLeft', { count: daysLeft }),
      body: t('trial.activeBody', { plan: getPlanConfig(currentPlan).displayName }),
    };
  })();

  const applyChange = (target: UserPlan) => {
    changePlan(target);
    const name = getPlanConfig(target).displayName;
    Alert.alert(t('planUpdatedTitle'), t('planUpdatedBody', { plan: name }));
  };

  // Returning from hosted Stripe Checkout. `checkout=success` does NOT by
  // itself mean payment succeeded (the browser can also send this on a
  // same-tab redirect the user backed out of) — the plan is only applied
  // after reading the actual synced subscription row from Appwrite.
  useEffect(() => {
    if (checkout !== 'success' || !profile.userID) return;
    (async () => {
      setSyncing(true);
      try {
        await requestSubscriptionSync(profile.userID!);
        const row = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: 'subscriptions',
          rowId: profile.userID!,
        });
        const plan = (row as any).plan_id as UserPlan | undefined;
        const status = (row as any).status as string | undefined;
        if (plan && status && ['active', 'trialing'].includes(status) && plan !== currentPlan) {
          updateProfile({
            plan,
            planStatus: status as any,
            pendingPlan: null,
            currentPeriodEnd: (row as any).current_period_end ?? null,
          });
          Alert.alert(t('planUpdatedTitle'), t('planUpdatedBody', { plan: getPlanConfig(plan).displayName }));
        }
      } catch (err) {
        log.warn('Failed to sync subscription after checkout return:', err);
      } finally {
        setSyncing(false);
        router.setParams({ checkout: undefined });
      }
    })();
  }, [checkout, profile.userID]);

  const onSelectPlan = async (target: UserPlan) => {
    if (target === currentPlan && !pendingPlan) return;

    // Re-selecting current plan while a downgrade is pending = cancel the downgrade.
    if (target === currentPlan && pendingPlan) {
      changePlan(target);
      Alert.alert(t('downgradeCanceledTitle'), t('downgradeCanceledBody', { plan: getPlanConfig(target).displayName }));
      return;
    }

    if (canSubscribe(profile.planStatus, isUpgrade(currentPlan, target))) {
      // Paid via Stripe Checkout (web/external, P1). While trialing (or
      // expired) every tier goes through checkout, not just ranked upgrades —
      // the trial provisions Family regardless of what the user will actually
      // pay for, so ranking against it would hide checkout for every other
      // tier (see ONBOARDING_FIXES.md #4). The plan is applied only after a
      // confirmed return + sync (see effect above), not when the browser
      // merely opens.
      setBusy(target);
      try {
        const result = await startCheckout(target, profile.userID);
        if (result.status === 'unavailable') {
          Alert.alert(
            t('checkoutNotConfiguredTitle'),
            t('checkoutNotConfiguredBody', { plan: getPlanConfig(target).displayName }),
            [
              { text: t('cancel'), style: 'cancel' },
              { text: t('simulatePayment'), onPress: () => applyChange(target) },
            ]
          );
        }
        // 'completed' → browser opened; wait for the checkout=success return.
        // 'canceled' → do nothing.
      } finally {
        setBusy(null);
      }
      return;
    }

    if (isDowngrade(currentPlan, target)) {
      // Downgrade — scheduled for next cycle (C2); data never auto-deleted (C4).
      // If the target holds fewer goals than are currently active, the user
      // picks what to keep before anything is scheduled (retention.ts, issue I).
      Alert.alert(
        t('switchToTitle', { plan: getPlanConfig(target).displayName }),
        t('switchToBody', { date: formatPeriodEnd() }),
        [
          { text: t('keepCurrentPlan'), style: 'cancel' },
          {
            text: t('continue'),
            onPress: () => {
              const requirement = evaluateDowngradeRetention(target, {
                goals: goals.filter((g) => !g.archived).length,
                incomes: profile.monthlyIncome != null ? 1 : 0,
                devices: 0,
              });
              if (requirement.selectionRequired) {
                router.push({ pathname: '/downgrade-selection', params: { target } });
              } else {
                changePlan(target);
              }
            },
          },
        ]
      );
    }
  };

  return (
    <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            hitSlop={4}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-low"
          >
            <ArrowLeft size={18} color="#64748B" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-on-surface">{t('header')}</Text>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}>
          {syncing && (
            <View className="mb-4 rounded-2xl bg-surface-container-low p-4">
              <Text className="text-sm font-semibold text-on-surface-variant">
                {t('confirmingPurchase')}
              </Text>
            </View>
          )}
          {trialBanner && (
            <View
              className={`mb-4 rounded-2xl p-4 ${
                trialBanner.expired ? 'bg-warning-container' : 'bg-primary-container'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  trialBanner.expired ? 'text-warning' : 'text-on-primary-container'
                }`}
              >
                {trialBanner.title}
              </Text>
              <Text
                className={`mt-1 text-xs leading-5 ${
                  trialBanner.expired ? 'text-warning' : 'text-on-primary-container'
                }`}
              >
                {trialBanner.body}
              </Text>
            </View>
          )}

          {pendingPlan && (
            <View className="mb-4 rounded-2xl bg-warning-container p-4">
              <Text className="text-sm font-semibold text-warning">
                {t('pendingBanner', { plan: getPlanConfig(pendingPlan).displayName, date: formatPeriodEnd() })}
              </Text>
            </View>
          )}

          <View className="gap-4">
            {PLAN_ORDER.map((id) => {
              const c = getPlanConfig(id);
              const isCurrent = id === currentPlan;
              const isPending = id === pendingPlan;
              const isHighlighted = highlight === id && !isCurrent;

              return (
                <View
                  key={id}
                  className={`rounded-3xl p-5 ${
                    isCurrent
                      ? 'bg-primary-container'
                      : isHighlighted
                        ? 'bg-surface border-2 border-primary'
                        : 'bg-surface'
                  }`}
                  style={CARD_SHADOW}
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-lg font-black text-on-surface">{c.displayName}</Text>
                      {id === 'family' && <Star size={16} color="#1D4ED8" fill="#1D4ED8" />}
                    </View>
                    <Text className="text-lg font-black text-primary">
                      {formatUSD(c.priceUSD)}
                      <Text className="text-xs font-semibold text-on-surface-variant">{t('perMonth')}</Text>
                    </Text>
                  </View>

                  {isCurrent && (
                    <Text className="text-xs font-bold text-on-primary-container mb-2">
                      {profile.planStatus === 'canceled'
                        ? t('status.activeUntilCanceled', { date: formatPeriodEnd() })
                        : profile.planStatus === 'expired'
                          ? t('status.trialEndedPaused')
                          : profile.planStatus === 'trialing'
                            ? t('status.currentTrialing')
                            : profile.planStatus === 'past_due'
                              ? t('status.pastDue')
                              : t('status.current')}
                    </Text>
                  )}
                  {isPending && (
                    <Text className="text-xs font-bold text-warning mb-2">{t('status.scheduledNextCycle')}</Text>
                  )}

                  <View className="gap-2 mt-2 mb-4">
                    {planHighlights(c, t).map((line) => (
                      <View key={line} className="flex-row items-center gap-2">
                        <Check size={14} color="#16A34A" />
                        <Text className="text-sm font-medium text-on-surface flex-1">{line}</Text>
                      </View>
                    ))}
                  </View>

                  {isCurrent && !pendingPlan ? (
                    <Button variant="outline" disabled label={t('buttons.yourCurrentPlan')} className="w-full" />
                  ) : isCurrent && pendingPlan ? (
                    <Button onPress={() => onSelectPlan(id)} label={t('buttons.keepThisPlan')} className="w-full" />
                  ) : (
                    <Button
                      onPress={() => onSelectPlan(id)}
                      disabled={busy === id}
                      label={
                        busy === id
                          ? t('buttons.openingCheckout')
                          : isUpgrade(currentPlan, id)
                            ? t('buttons.upgradeTo', { plan: c.displayName })
                            : t('buttons.switchTo', { plan: c.displayName })
                      }
                      variant={isUpgrade(currentPlan, id) ? 'default' : 'outline'}
                      className="w-full"
                    />
                  )}
                </View>
              );
            })}
          </View>

          <Text className="text-[11px] text-on-surface-variant/50 text-center mt-6 px-4">
            {t('disclaimer')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}
