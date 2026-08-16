import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Switch } from 'react-native';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, RotateCcw, Pencil, Check, Settings as SettingsIcon } from 'lucide-react-native';

import { useStore, EXPENSE_CATEGORIES, formatCurrency } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { Button } from '@/components/ui/button';
import { FadeInStagger } from '@/components/animation/FadeInStagger';
import { requestNotificationPermission, getNotificationPermissionStatus } from '@/lib/notifications';
import { TEXT_INPUT_CENTERING } from '@/lib/utils';
import { Mascot } from '@/components/Mascot';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

export default function Profile() {
  const { t } = useTranslation('profile');
  const router = useRouter();
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const achievements = useStore((state) => state.achievements);
  const updateProfile = useStore((state) => state.updateProfile);
  const refreshNotifications = useStore((state) => state.refreshNotifications);
  const resetForDemo = useStore((state) => state.resetForDemo);
  const resetLock = useAuthLock((state) => state.resetToLogin);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const unlockedBadges = achievements.filter((a) => a.unlocked).length;

  const toggleNotif = async (key: keyof typeof profile.notificationPrefs) => {
    const turningOn = !profile.notificationPrefs[key];
    if (turningOn) {
      const alreadyGranted = await getNotificationPermissionStatus();
      if (!alreadyGranted) {
        // Soft-ask before the hard OS prompt — explain the value first, since a bare
        // system dialog with no context converts worse and can't be re-shown if denied.
        const wantsToEnable = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t('notifications.softAskTitle'),
            t('notifications.softAskBody'),
            [
              { text: t('notifications.notNow'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('notifications.enable'), onPress: () => resolve(true) },
            ]
          );
        });
        if (!wantsToEnable) return;

        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(t('notifications.disabledTitle'), t('notifications.disabledBody'));
          return;
        }
      }
    }
    updateProfile({
      notificationPrefs: {
        ...profile.notificationPrefs,
        [key]: turningOn,
      },
    });
    refreshNotifications();
  };

  const handleReset = () => {
    Alert.alert(
      t('reset.title'),
      t('reset.body'),
      [
        { text: t('reset.cancel'), style: 'cancel' },
        {
          text: t('reset.confirm'),
          style: 'destructive',
          onPress: async () => {
            resetForDemo();
            // Keychain-backed PIN/session data lives outside the zustand/AsyncStorage
            // profile and outlives both resetForDemo() and even a full app delete on
            // iOS — must be wiped explicitly or the next launch re-locks to a dead PIN.
            await resetLock();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const expensesByCategory = profile.expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const saveName = () => {
    updateProfile({ name: nameInput.trim() });
    setEditingName(false);
  };

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 96 }}>
        {/* User card */}
        <FadeInStagger index={0} delayStep={60}>
        <View className="mb-6 rounded-3xl bg-primary-container p-6 items-center" style={CARD_SHADOW}>
          <View className="mb-4 h-18 w-18 items-center justify-center rounded-full bg-primary/20" style={{ width: 72, height: 72 }}>
            <Mascot size={44} />
          </View>

          {editingName ? (
            <View className="flex-row items-center justify-center gap-2 mb-2">
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                className="w-36 h-10 text-center bg-primary/10 rounded-xl text-on-primary-container font-bold"
                style={TEXT_INPUT_CENTERING}
                autoFocus
                onSubmitEditing={saveName}
              />
              <TouchableOpacity
                onPress={saveName}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-primary/20"
              >
                <Check size={16} color="#1D4ED8" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)} className="flex-row items-center justify-center gap-2 mb-1">
              <Text className="text-2xl font-black text-on-primary-container">
                {profile.name || t('defaultName')}
              </Text>
              <Pencil size={14} color="#1D4ED8" />
            </TouchableOpacity>
          )}

          <View className="flex-row items-center gap-2 mb-2">
            <View className="bg-primary/20 rounded-full px-3 py-0.5">
              <Text className="text-sm font-bold text-on-primary-container">{t('levelLabel', { level: profile.level })}</Text>
            </View>
          </View>

          <Text className="text-sm font-medium text-on-primary-container/70 mb-5">
            {profile.personalityType
              ? t('personalitySuffix', { type: profile.personalityType.charAt(0).toUpperCase() + profile.personalityType.slice(1) })
              : t('financialExplorer')}
          </Text>

          <View className="w-full flex-row justify-between px-2">
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{formatCurrency(totalSaved, profile.currency)}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('totalSaved')}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{goals.length}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('goals')}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{unlockedBadges}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('badges')}</Text>
            </View>
          </View>
        </View>
        </FadeInStagger>

        {/* Income */}
        <FadeInStagger index={1} delayStep={60}>
        <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
          <View className="flex-row items-center gap-2 mb-3">
            <CreditCard size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">{t('monthlyIncome')}</Text>
          </View>
          <Text className="text-3xl font-black text-on-surface">
            {profile.monthlyIncome != null ? formatCurrency(profile.monthlyIncome, profile.currency) : t('notProvided')}
          </Text>
        </View>
        </FadeInStagger>

        {/* Expense breakdown */}
        {Object.keys(expensesByCategory).length > 0 && (
          <FadeInStagger index={2} delayStep={60}>
          <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
            <Text className="mb-4 text-base font-bold text-on-surface">{t('expenseBreakdown')}</Text>
            <View className="gap-3">
              {Object.entries(expensesByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const c = EXPENSE_CATEGORIES.find((x) => x.id === cat);
                  return (
                    <View key={cat} className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Text className="text-xl">{c?.icon || '📌'}</Text>
                        <Text className="text-sm font-semibold text-on-surface">{c?.name || cat}</Text>
                      </View>
                      <Text className="text-sm font-bold text-on-surface">{formatCurrency(amount, profile.currency)}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
          </FadeInStagger>
        )}

        {/* Notifications */}
        <FadeInStagger index={3} delayStep={60}>
        <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
          <View className="flex-row items-center gap-2 mb-4">
            <Bell size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">{t('notifications.title')}</Text>
          </View>
          <View className="gap-4">
            {(
              [
                ['paydayReminder', 'notifications.paydayReminder'],
                ['streakProtection', 'notifications.streakProtection'],
                ['milestoneAlerts', 'notifications.milestoneAlerts'],
                ['weeklyReflection', 'notifications.weeklyReflection'],
              ] as const
            ).map(([key, labelKey]) => (
              <View key={key} className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-on-surface">{t(labelKey)}</Text>
                <Switch
                  value={profile.notificationPrefs[key]}
                  onValueChange={() => toggleNotif(key)}
                  trackColor={{ false: '#CBD5E1', true: '#1D4ED8' }}
                  thumbColor={'#ffffff'}
                />
              </View>
            ))}
          </View>
        </View>
        </FadeInStagger>

        {/* Reset */}
        <FadeInStagger index={4} delayStep={60}>
        <Button
          variant="outline"
          onPress={handleReset}
          className="mb-12 w-full flex-row items-center justify-center gap-2 border-outline/50"
        >
          <RotateCcw size={14} color="#64748B" />
          <Text className="text-sm font-bold text-on-surface-variant">{t('reset.button')}</Text>
        </Button>
        </FadeInStagger>
      </ScrollView>

      {/* Settings FAB — fixed bottom-right, reachable one-handed regardless of scroll */}
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        className="absolute bottom-6 right-5 z-40 h-14 w-14 items-center justify-center rounded-2xl bg-primary"
        style={{ ...CARD_SHADOW, shadowOpacity: 0.2 }}
      >
        <SettingsIcon size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
    </ScreenTransition>
  );
}
