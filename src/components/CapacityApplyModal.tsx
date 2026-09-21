/**
 * Offers to move affected contribution-mode goals to their capacity-based
 * date after the user's declared savings capacity changes (#191 D2/Phase 8).
 *
 * Follows the two existing precedents for "a value changed underneath,
 * dependent data is now stale": downgrade-selection.tsx refuses to
 * auto-archive and re-asks if dismissed (C4/C7), and CurrencyConvertModal
 * asks convert-vs-relabel rather than assuming. Dismissing here changes
 * nothing — the caller (profile.tsx) recomputes candidates fresh on the next
 * capacity-affecting edit, so this naturally re-offers rather than going
 * silent forever, without needing a persisted "already asked" flag.
 *
 * Deadline-mode goals never appear here — see capacityApplyCandidates
 * (goalMath.ts) for why; they get a different, non-interactive warning
 * instead (goals.tsx's goal detail view).
 */
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from './animation/BottomSheet';
import { Button } from './ui/button';
import { formatMonthYear } from '@/lib/i18n/format';
import type { SupportedLanguage } from '@/lib/i18n/detect';

export interface CapacityApplyRow {
  goalId: string;
  goalName: string;
  oldDate: string;
  newDate: string;
}

interface CapacityApplyModalProps {
  isVisible: boolean;
  rows: CapacityApplyRow[];
  language: SupportedLanguage;
  onApply: () => void;
  onDismiss: () => void;
}

export function CapacityApplyModal({
  isVisible,
  rows,
  language,
  onApply,
  onDismiss,
}: CapacityApplyModalProps) {
  const { t } = useTranslation('goals');

  const handleDismiss = () => {
    Haptics.selectionAsync();
    onDismiss();
  };

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply();
  };

  return (
    <BottomSheet visible={isVisible} onClose={handleDismiss}>
      <View className="px-5 pt-2">
        <View className="items-end">
          <Pressable
            onPress={handleDismiss}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-container"
            accessibilityRole="button"
            accessibilityLabel={t('common:a11y.close')}
          >
            <X size={18} color="#64748B" />
          </Pressable>
        </View>

        <View className="items-center -mt-2 mb-4">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary-container mb-4">
            <TrendingUp size={28} color="#1D4ED8" />
          </View>
          <Text className="text-xl font-black text-on-surface text-center">
            {t('applyCapacity.title')}
          </Text>
          <Text className="mt-2 text-sm font-medium text-on-surface-variant text-center px-2">
            {t('applyCapacity.body')}
          </Text>
        </View>

        <View className="gap-2 mb-5">
          {rows.map((row) => (
            <View key={row.goalId} className="rounded-2xl bg-surface-container-low px-4 py-3">
              <Text className="text-sm font-bold text-on-surface" numberOfLines={1}>
                {row.goalName}
              </Text>
              <Text className="text-xs text-on-surface-variant mt-0.5">
                {formatMonthYear(row.oldDate, language)} → {formatMonthYear(row.newDate, language)}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row gap-3 pb-5">
          <Button
            variant="outline"
            className="flex-1 h-14"
            label={t('applyCapacity.notNow')}
            onPress={handleDismiss}
          />
          <Button
            variant="default"
            className="flex-1 h-14"
            label={t('applyCapacity.updateGoals')}
            onPress={handleApply}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
