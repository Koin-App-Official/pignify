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
  formatUSD,
  quotaLabel,
  type PlanConfig,
} from '@/lib/entitlements';
import { startCheckout, requestSubscriptionSync } from '@/lib/billing';
import { tablesDB, DATABASE_ID } from '@/lib/appwrite';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

/** Short feature bullets shown on each plan card. */
function planHighlights(c: PlanConfig): string[] {
  const lines: string[] = [];
  lines.push(`${quotaLabel(c.quotas.incomes)} income source${c.quotas.incomes === 1 ? '' : 's'}`);
  lines.push(`${quotaLabel(c.quotas.goals)} goal${c.quotas.goals === 1 ? '' : 's'}`);
  lines.push(`${quotaLabel(c.quotas.devices)} device${c.quotas.devices === 1 ? '' : 's'}`);
  if (c.features.aiCoach) {
    const extra = c.extraMessagePriceUSD != null ? ` (then ${formatUSD(c.extraMessagePriceUSD)}/msg)` : '';
    lines.push(`${quotaLabel(c.quotas.aiMessages)} AI messages/mo${extra}`);
  }
  if (c.features.emailReports) {
    lines.push(`${quotaLabel(c.quotas.emailReports)} email reports/mo`);
  }
  if (c.features.exclusiveProtection) lines.push('Exclusive protection');
  if (c.features.deepAnalysis) lines.push('Deep spending analysis');
  if (c.features.referral) lines.push('Referral bonus');
  if (c.features.goalBonus) lines.push('Goal-achievement bonus');
  if (c.features.loyaltyDiscount) lines.push('Loyalty discount after 6 months');
  if (c.trialDays > 0) lines.push(`${c.trialDays}-day free trial`);
  return lines;
}

export default function Plans() {
  const router = useRouter();
  const { highlight, checkout } = useLocalSearchParams<{ highlight?: string; checkout?: string }>();

  const profile = useStore((s) => s.profile);
  const changePlan = useStore((s) => s.changePlan);
  const updateProfile = useStore((s) => s.updateProfile);
  const [busy, setBusy] = useState<UserPlan | null>(null);
  const [syncing, setSyncing] = useState(false);

  const currentPlan = profile.plan;
  const pendingPlan = profile.pendingPlan;

  const formatPeriodEnd = () =>
    profile.currentPeriodEnd
      ? new Date(profile.currentPeriodEnd).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'the end of your billing period';

  const applyChange = (target: UserPlan) => {
    changePlan(target);
    const name = getPlanConfig(target).displayName;
    Alert.alert('Plan updated', `You're now on the ${name} plan. Enjoy your new features! 🎉`);
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
            planStatus: status === 'trialing' ? 'active' : (status as any),
            pendingPlan: null,
            currentPeriodEnd: (row as any).current_period_end ?? null,
          });
          Alert.alert('Plan updated', `You're now on the ${getPlanConfig(plan).displayName} plan. Enjoy your new features! 🎉`);
        }
      } catch (err) {
        console.warn('[plans] Failed to sync subscription after checkout return:', err);
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
      Alert.alert('Downgrade canceled', `You'll stay on the ${getPlanConfig(target).displayName} plan.`);
      return;
    }

    if (isUpgrade(currentPlan, target)) {
      // Upgrade — paid via Stripe Checkout (web/external, P1). The plan is
      // applied only after a confirmed return + sync (see effect above), not
      // when the browser merely opens.
      setBusy(target);
      try {
        const result = await startCheckout(target, profile.userID);
        if (result.status === 'unavailable') {
          Alert.alert(
            'Checkout not configured',
            `Stripe Checkout isn't set up in this build. Simulate a successful payment for ${getPlanConfig(target).displayName}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Simulate payment', onPress: () => applyChange(target) },
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
      Alert.alert(
        `Switch to ${getPlanConfig(target).displayName}?`,
        `This takes effect on ${formatPeriodEnd()}. You'll keep all your data — when the change applies you'll choose which incomes and goals stay active. Nothing is deleted.`,
        [
          { text: 'Keep current plan', style: 'cancel' },
          { text: 'Schedule downgrade', onPress: () => changePlan(target) },
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
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-low"
          >
            <ArrowLeft size={18} color="#64748B" />
          </TouchableOpacity>
          <Text className="text-2xl font-black text-on-surface">Choose your plan</Text>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}>
          {syncing && (
            <View className="mb-4 rounded-2xl bg-surface-container-low p-4">
              <Text className="text-sm font-semibold text-on-surface-variant">
                Confirming your purchase…
              </Text>
            </View>
          )}
          {pendingPlan && (
            <View className="mb-4 rounded-2xl bg-warning-container p-4">
              <Text className="text-sm font-semibold text-warning">
                Scheduled change: your plan switches to {getPlanConfig(pendingPlan).displayName} on{' '}
                {formatPeriodEnd()}. Re-select your current plan below to cancel this.
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
                      <Text className="text-xs font-semibold text-on-surface-variant">/mo</Text>
                    </Text>
                  </View>

                  {isCurrent && (
                    <Text className="text-xs font-bold text-on-primary-container mb-2">
                      {profile.planStatus === 'canceled'
                        ? `Active until ${formatPeriodEnd()} (canceled)`
                        : 'Current plan'}
                    </Text>
                  )}
                  {isPending && (
                    <Text className="text-xs font-bold text-warning mb-2">Scheduled for next cycle</Text>
                  )}

                  <View className="gap-2 mt-2 mb-4">
                    {planHighlights(c).map((line) => (
                      <View key={line} className="flex-row items-center gap-2">
                        <Check size={14} color="#16A34A" />
                        <Text className="text-sm font-medium text-on-surface flex-1">{line}</Text>
                      </View>
                    ))}
                  </View>

                  {isCurrent && !pendingPlan ? (
                    <Button variant="outline" disabled label="Your current plan" className="w-full" />
                  ) : isCurrent && pendingPlan ? (
                    <Button onPress={() => onSelectPlan(id)} label="Keep this plan" className="w-full" />
                  ) : (
                    <Button
                      onPress={() => onSelectPlan(id)}
                      disabled={busy === id}
                      label={
                        busy === id
                          ? 'Opening checkout…'
                          : isUpgrade(currentPlan, id)
                            ? `Upgrade to ${c.displayName}`
                            : `Switch to ${c.displayName}`
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
            Upgrades apply immediately. Downgrades take effect at the end of your current billing
            period, and your data is always kept safe.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}
