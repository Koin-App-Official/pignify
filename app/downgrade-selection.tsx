/**
 * Downgrade retention — "what to keep" (ONBOARDING_V2.md D13-D15, issue I).
 * Pushed as a modal from plans.tsx when the target plan holds fewer goals than
 * the user currently has active. Nothing is applied until the user confirms
 * here — backing out leaves the current plan and every goal untouched.
 *
 * Only goals are selectable. `retention.ts` models incomes and devices too,
 * but the client has no multi-income or device-list feature to pick from
 * today (a single `monthlyIncome` scalar, and devices live server-side only),
 * so those two never actually require a choice given real plan quotas — see
 * the guard below for what happens if that ever stops being true.
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react-native';
import { useStore, type UserPlan } from '@/lib/store';
import { getPlanConfig } from '@/lib/entitlements';
import { evaluateDowngradeRetention, validateRetentionSelection } from '@/lib/retention';
import { Button } from '@/components/ui/button';

export default function DowngradeSelection() {
  const { t } = useTranslation('plans');
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target: UserPlan }>();

  const goals = useStore((s) => s.goals);
  const monthlyIncome = useStore((s) => s.profile.monthlyIncome);
  const applyDowngradeWithRetention = useStore((s) => s.applyDowngradeWithRetention);

  const activeGoals = goals.filter((g) => !g.archived);
  const requirement = target
    ? evaluateDowngradeRetention(target, {
        goals: activeGoals.length,
        incomes: monthlyIncome != null ? 1 : 0,
        devices: 0,
      })
    : null;
  const goalLimit = requirement && requirement.limits.goals !== 'unlimited' ? requirement.limits.goals : activeGoals.length;

  const [keepIds, setKeepIds] = useState<string[]>(() => activeGoals.slice(0, goalLimit).map((g) => g.id));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setKeepIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= goalLimit) return prev; // already at the target's limit
      return [...prev, id];
    });
  };

  const confirm = () => {
    if (!target) return;
    const validation = validateRetentionSelection(
      target,
      {
        keepGoalIds: keepIds,
        // Neither is user-selectable today (see file header) — an empty
        // selection always validates, since every real plan's income/device
        // quota is at least 1 and nothing over-limit can reach this screen for
        // them yet.
        keepIncomeIds: [],
        keepDeviceIds: [],
      },
      t
    );
    if (!validation.valid) {
      Alert.alert(t('downgradeSelection.genericErrorTitle'), validation.errors.join(' '));
      return;
    }
    setBusy(true);
    applyDowngradeWithRetention(target, keepIds);
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
  const canConfirm = keepIds.length > 0 && keepIds.length <= goalLimit;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-2xl font-black text-on-surface">{t('downgradeSelection.chooseWhatToKeep')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -mr-2">
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
                <Text className="text-2xl">{g.icon}</Text>
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
      </ScrollView>

      <View className="px-5 pb-6 pt-2">
        <Button onPress={confirm} disabled={!canConfirm || busy} label={t('downgradeSelection.confirm')} className="w-full h-14" />
      </View>
    </SafeAreaView>
  );
}
