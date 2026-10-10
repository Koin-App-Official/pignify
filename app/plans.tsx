/**
 * Subscription detail — read-only (#173).
 *
 * This screen used to be the paywall: prices, per-tier buttons, hosted Stripe
 * Checkout. None of that is here anymore. The app carries no purchase path at
 * all (App Review Guideline 3.1.1) — subscribing, upgrading, downgrading and
 * cancelling all happen on the web, and the only tappable link to it lives in
 * Settings. What remains is what the upgrade gates deep-link into: current plan,
 * real status from the server, and what each tier includes.
 *
 * Deliberately price-free. Prices plus a call to action are what read as an
 * external purchase flow to a reviewer; the feature list on its own does not.
 */
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Star } from 'lucide-react-native';
import { ScreenTransition } from '@/components/ScreenTransition';
import { BillingTerms } from '@/components/BillingTerms';
import { useStore } from '@/lib/store';
import { PLAN_ORDER, getPlanConfig, isUnlimited, type PlanConfig } from '@/lib/entitlements';
import { formatDate } from '@/lib/i18n/format';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

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
    lines.push(quotaLine(c.quotas.aiMessages, 'quota.aiMessagesUnlimited', 'quota.aiMessages', t));
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
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  const profile = useStore((s) => s.profile);

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

  return (
    <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            hitSlop={4}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-low"
            accessibilityRole="button"
            accessibilityLabel={t('common:a11y.back')}
          >
            <ArrowLeft size={18} color="#64748B" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-on-surface">{t('header')}</Text>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}>
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
                    {isCurrent && (
                      <View className="rounded-full bg-primary px-3 py-1">
                        <Text className="text-[11px] font-black text-primary-foreground">
                          {t('currentPlanChip')}
                        </Text>
                      </View>
                    )}
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

                  <View className="gap-2 mt-2">
                    {planHighlights(c, t).map((line) => (
                      <View key={line} className="flex-row items-center gap-2">
                        <Check size={14} color="#16A34A" />
                        <Text className="text-sm font-medium text-on-surface flex-1">{line}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Deliberately not a link: under decision D3 the tappable routes to web
              billing are Settings and the locked gate only, so this just says
              where to go. */}
          <Text className="mt-6 text-center text-sm font-medium text-on-surface-variant">
            {t('managedOnWeb')}
          </Text>

          <View className="mt-6">
            <BillingTerms />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}
