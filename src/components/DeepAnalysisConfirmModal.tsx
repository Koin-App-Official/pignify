/**
 * "Are you sure?" confirm step before spending a metered Deep Analysis run.
 *
 * Sits between the entitlement gates (handled by UpgradeModal) and the actual
 * triggerDeepAnalysis() call — once confirmed there's no cancel, since the
 * request is awaited and irreversible (quota only increments on confirmed
 * success). Styling mirrors UpgradeModal/DobConfirmModal.
 */
import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from './animation/BottomSheet';
import { Button } from './ui/button';

interface DeepAnalysisConfirmModalProps {
  isVisible: boolean;
  remaining: number;
  isRunning: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeepAnalysisConfirmModal({
  isVisible,
  remaining,
  isRunning,
  onConfirm,
  onClose,
}: DeepAnalysisConfirmModalProps) {
  const { t } = useTranslation('dashboard');
  const isLastOne = remaining <= 1;

  const handleClose = () => {
    if (isRunning) return;
    Haptics.selectionAsync();
    onClose();
  };

  return (
    <BottomSheet visible={isVisible} onClose={handleClose}>
      <View className="px-5 pt-2">
        <View className="items-end">
          <Pressable
            onPress={handleClose}
            hitSlop={6}
            disabled={isRunning}
            style={isRunning ? { opacity: 0.3 } : undefined}
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
            {t('deepAnalysisConfirm.title')}
          </Text>
          <Text className="mt-2 text-sm font-medium text-on-surface-variant text-center px-2">
            {isLastOne ? t('deepAnalysisConfirm.bodyLastOne') : t('deepAnalysisConfirm.bodyValue')}
          </Text>
        </View>

        <View className="flex-row gap-3 pb-5">
          <Button
            variant="outline"
            className="flex-1 h-14"
            label={t('deepAnalysisConfirm.notNow')}
            onPress={handleClose}
            disabled={isRunning}
          />
          <Button variant="default" className="flex-1 h-14 flex-row gap-2" onPress={onConfirm} disabled={isRunning}>
            {isRunning && <ActivityIndicator color="#ffffff" />}
            <Text className="text-base font-bold text-primary-foreground">
              {isRunning ? t('deepAnalysis.analyzing') : t('deepAnalysisConfirm.runAnalysis')}
            </Text>
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
