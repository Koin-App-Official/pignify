/**
 * "Upgrade your plan" popup — the non-destructive gate for blocked features.
 *
 * Constraint C13: gated features are never hidden; when a user hits a quota or a
 * feature they don't have, the feature stays visible and this popup appears with
 * a clear reason and a path to upgrade. Styling mirrors CalendarModal.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from './animation/BottomSheet';
import { Button } from './ui/button';
import { getPlanConfig, formatUSD, type GateInfo } from '@/lib/entitlements';

interface UpgradeModalProps {
  isVisible: boolean;
  gate: GateInfo | null;
  onClose: () => void;
  /** Called with the suggested plan when the user chooses to upgrade. */
  onUpgrade: (targetPlan: NonNullable<GateInfo['requiredPlan']>) => void;
  /** Optional lower-emphasis action rendered below the main upgrade CTA. */
  secondaryAction?: { label: string; onPress: () => void };
}

export function UpgradeModal({
  isVisible,
  gate,
  onClose,
  onUpgrade,
  secondaryAction,
}: UpgradeModalProps) {
  const requiredPlan = gate?.requiredPlan ?? null;
  const targetConfig = requiredPlan ? getPlanConfig(requiredPlan) : null;

  const handleClose = () => {
    Haptics.selectionAsync();
    onClose();
  };

  const handleUpgrade = () => {
    if (!requiredPlan) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onUpgrade(requiredPlan);
  };

  const handleSecondary = () => {
    if (!secondaryAction) return;
    Haptics.selectionAsync();
    secondaryAction.onPress();
  };

  return (
    <BottomSheet visible={isVisible} onClose={handleClose}>
      <View className="px-5 pt-2">
        <View className="items-end">
          <Pressable
            onPress={handleClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-container"
          >
            <X size={18} color="#64748B" />
          </Pressable>
        </View>

        <View className="items-center -mt-2 mb-4">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary-container mb-4">
            <Sparkles size={28} color="#1D4ED8" />
          </View>
          <Text className="text-xl font-black text-on-surface text-center">
            {gate?.title ?? 'Upgrade your plan'}
          </Text>
          <Text className="mt-2 text-sm font-medium text-on-surface-variant text-center px-2">
            {gate?.description ??
              'This feature is available on a higher plan. Upgrade to unlock it.'}
          </Text>
        </View>

        {targetConfig && (
          <View className="mb-5 rounded-2xl bg-surface-container-low p-4 flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-semibold text-on-surface-variant">
                Recommended plan
              </Text>
              <Text className="text-base font-black text-on-surface mt-0.5">
                {targetConfig.displayName}
              </Text>
            </View>
            <Text className="text-base font-black text-primary">
              {formatUSD(targetConfig.priceUSD)}
              <Text className="text-xs font-semibold text-on-surface-variant">/mo</Text>
            </Text>
          </View>
        )}

        {requiredPlan ? (
          <Button
            onPress={handleUpgrade}
            label={`Upgrade to ${targetConfig?.displayName ?? 'a higher plan'}`}
            className="w-full"
          />
        ) : (
          <Button onPress={handleClose} label="You're on the top plan" disabled className="w-full" />
        )}

        {secondaryAction && (
          <Button
            onPress={handleSecondary}
            label={secondaryAction.label}
            variant="outline"
            className="w-full mt-3"
          />
        )}

        <Pressable onPress={handleClose} className="mt-3 mb-2 items-center py-2">
          <Text className="text-sm font-semibold text-on-surface-variant">Maybe later</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
