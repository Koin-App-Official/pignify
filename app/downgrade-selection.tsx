/**
 * Downgrade retention — "what to keep" (ONBOARDING_V2.md D13-D15, issue I).
 *
 * Reactive since #173. It used to be pushed from plans.tsx *before* scheduling a
 * downgrade, so nothing had happened yet and backing out cancelled the whole
 * thing. Plan changes now happen on the web and reach the app through the
 * entitlements sync, so by the time this screen opens the downgrade has already
 * taken effect and the only open question is which goals/incomes stay active.
 * Dismissing archives nothing and leaves `retentionRequiredFor` set, so the app
 * asks again later rather than auto-archiving on the user's behalf (C4/C7).
 *
 * Goals AND incomes are both selectable as of #191 Phase 9 — Family's 3 income
 * sources down to Medium/Beginner's 1 is now a real over-limit case (this file
 * used to say the opposite, back when the client only had a single
 * `monthlyIncome` scalar and no plan quota could ever exceed it). Devices still
 * aren't selectable here — they live server-side only and have no client list
 * to pick from.
 *
 * Archiving an income can lower declared savings capacity, which is a Phase 8
 * apply-to-goals trigger. That prompt is deliberately NOT shown here — see
 * `applyRetentionSelection` in store.ts: it only sets `capacityApplyPending`,
 * and Profile is what actually checks and offers it, the next time it's
 * visited. Keeping the two sheets on different screens is what keeps them
 * from ever stacking.
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X, Check, CreditCard } from 'lucide-react-native';
import { useStore, formatCurrency, type UserPlan } from '@/lib/store';
import { getPlanConfig } from '@/lib/entitlements';
import { evaluateDowngradeRetention, validateRetentionSelection } from '@/lib/retention';
import { activeIncomes } from '@/lib/income';
import { archiveIncome } from '@/lib/incomeSync';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons/Icon';

export default function DowngradeSelection() {
  const { t } = useTranslation('plans');
  const router = useRouter();
  const { target: targetParam } = useLocalSearchParams<{ target?: UserPlan }>();

  const goals = useStore((s) => s.goals);
  const profile = useStore((s) => s.profile);
  const applyRetentionSelection = useStore((s) => s.applyRetentionSelection);
  const retentionRequiredFor = useStore((s) => s.retentionRequiredFor);

  // The sync sets the store flag; the param is kept so the route stays
  // linkable/testable on its own.
  const target = targetParam ?? retentionRequiredFor ?? undefined;

  const activeGoals = goals.filter((g) => !g.archived);
  const activeIncomeList = activeIncomes(profile.incomes);
  const requirement = target
    ? evaluateDowngradeRetention(target, {
        goals: activeGoals.length,
        incomes: activeIncomeList.length,
        devices: 0,
      })
    : null;
  const goalLimit = requirement && requirement.limits.goals !== 'unlimited' ? requirement.limits.goals : activeGoals.length;
  const incomeLimit =
    requirement && requirement.limits.incomes !== 'unlimited' ? requirement.limits.incomes : activeIncomeList.length;

  const [keepIds, setKeepIds] = useState<string[]>(() => activeGoals.slice(0, goalLimit).map((g) => g.id));
  const [keepIncomeIds, setKeepIncomeIds] = useState<string[]>(() =>
    activeIncomeList.slice(0, incomeLimit).map((i) => i.id)
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setKeepIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= goalLimit) return prev; // already at the target's limit
      return [...prev, id];
    });
  };

  const toggleIncome = (id: string) => {
    setKeepIncomeIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= incomeLimit) return prev;
      return [...prev, id];
    });
  };

  const confirm = () => {
    if (!target) return;
    const validation = validateRetentionSelection(
      target,
      {
        keepGoalIds: keepIds,
        keepIncomeIds,
        // Not user-selectable today — devices live server-side only, and no
        // real plan's device quota can be exceeded by anything the client
        // itself tracks.
        keepDeviceIds: [],
      },
      t
    );
    if (!validation.valid) {
      Alert.alert(t('downgradeSelection.genericErrorTitle'), validation.errors.join(' '));
      return;
    }
    setBusy(true);
    // Snapshot which incomes are about to be archived before the store write
    // replaces `profile.incomes` — needed to push the same set to the server.
    const archivedIncomeIds = activeIncomeList.filter((i) => !keepIncomeIds.includes(i.id)).map((i) => i.id);
    applyRetentionSelection({ keepGoalIds: keepIds, keepIncomeIds });
    for (const id of archivedIncomeIds) archiveIncome(id);
    router.back();
  };

  if (!target || !requirement) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <Text className="text-sm font-medium text-on-surface-variant text-center">
          {t('downgradeSelection.nothingToChoose')}
        </Text>
      </SafeAreaView>
    );
  }

  const planName = getPlanConfig(target).displayName;
  const showIncomeSection = requirement.toArchive.incomes > 0;
  const canConfirm =
    keepIds.length > 0 &&
    keepIds.length <= goalLimit &&
    (!showIncomeSection || (keepIncomeIds.length > 0 && keepIncomeIds.length <= incomeLimit));

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-2xl font-black text-on-surface">{t('downgradeSelection.chooseWhatToKeep')}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -mr-2"
          accessibilityRole="button"
          accessibilityLabel={t('common:a11y.back')}
        >
          <X size={22} color="#6b7280" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="mb-6 text-sm font-medium text-on-surface-variant leading-5">
          {t('downgradeSelection.keepBody', {
            count: goalLimit,
            plan: planName,
            total: activeGoals.length,
            pickText:
              goalLimit === 1
                ? t('downgradeSelection.pickOne')
                : t('downgradeSelection.pickUpTo', { count: goalLimit }),
          })}
        </Text>

        <Text className="mb-1 text-xs font-bold uppercase text-on-surface-variant">
          {t('downgradeSelection.retentionResource.goals')}
        </Text>
        <Text className="mb-3 text-sm font-bold text-on-surface">
          {t('downgradeSelection.keepingCountOfLimit', { count: keepIds.length, limit: goalLimit })}
        </Text>

        <View className="gap-3">
          {activeGoals.map((g) => {
            const kept = keepIds.includes(g.id);
            const disabled = !kept && keepIds.length >= goalLimit;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => toggle(g.id)}
                disabled={disabled}
                accessibilityRole="button"
                className={`flex-row items-center gap-3 rounded-2xl border px-5 py-4 ${
                  kept ? 'border-primary bg-primary-container' : 'border-outline bg-surface-container-low'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <Icon name={g.icon} size={28} />
                <View className="flex-1">
                  <Text className="text-base font-bold text-on-surface" numberOfLines={1}>
                    {g.name}
                  </Text>
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                    kept ? 'border-primary bg-primary' : 'border-outline'
                  }`}
                >
                  {kept && <Check size={14} color="#ffffff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {showIncomeSection && (
          <>
            <Text className="mt-8 mb-2 text-sm font-medium text-on-surface-variant leading-5">
              {t('downgradeSelection.keepIncomeBody', {
                pickText:
                  incomeLimit === 1
                    ? t('downgradeSelection.pickOne')
                    : t('downgradeSelection.pickUpTo', { count: incomeLimit }),
              })}
            </Text>

            <Text className="mb-1 text-xs font-bold uppercase text-on-surface-variant">
              {t('downgradeSelection.retentionResource.incomes')}
            </Text>
            <Text className="mb-3 text-sm font-bold text-on-surface">
              {t('downgradeSelection.keepingCountOfLimit', { count: keepIncomeIds.length, limit: incomeLimit })}
            </Text>

            <View className="gap-3">
              {activeIncomeList.map((income) => {
                const kept = keepIncomeIds.includes(income.id);
                const disabled = !kept && keepIncomeIds.length >= incomeLimit;
                return (
                  <TouchableOpacity
                    key={income.id}
                    onPress={() => toggleIncome(income.id)}
                    disabled={disabled}
                    accessibilityRole="button"
                    className={`flex-row items-center gap-3 rounded-2xl border px-5 py-4 ${
                      kept ? 'border-primary bg-primary-container' : 'border-outline bg-surface-container-low'
                    } ${disabled ? 'opacity-50' : ''}`}
                  >
                    <CreditCard size={24} color="#64748B" />
                    <View className="flex-1">
                      <Text className="text-base font-bold text-on-surface" numberOfLines={1}>
                        {income.label}
                      </Text>
                      <Text className="text-xs text-on-surface-variant">
                        {formatCurrency(income.amount, profile.currency)}
                      </Text>
                    </View>
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                        kept ? 'border-primary bg-primary' : 'border-outline'
                      }`}
                    >
                      {kept && <Check size={14} color="#ffffff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View className="px-5 pb-6 pt-2">
        <Button onPress={confirm} disabled={!canConfirm || busy} label={t('downgradeSelection.confirm')} className="w-full h-14" />
      </View>
    </SafeAreaView>
  );
}
