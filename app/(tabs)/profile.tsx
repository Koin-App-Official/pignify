import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, CreditCard, User, RotateCcw, Pencil, Check } from 'lucide-react-native';
import Constants from 'expo-constants';

import { useStore, EXPENSE_CATEGORIES } from '@/lib/store';
import { Button } from '@/components/ui/button';

export default function Profile() {
  const router = useRouter();
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const achievements = useStore((state) => state.achievements);
  const updateProfile = useStore((state) => state.updateProfile);
  const resetForDemo = useStore((state) => state.resetForDemo);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const unlockedBadges = achievements.filter((a) => a.unlocked).length;

  const toggleNotif = (key: keyof typeof profile.notificationPrefs) => {
    updateProfile({
      notificationPrefs: {
        ...profile.notificationPrefs,
        [key]: !profile.notificationPrefs[key],
      },
    });
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Data',
      'Are you sure you want to reset all data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetForDemo();
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
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 py-6">
        {/* User card */}
        <View className="mb-6 rounded-3xl bg-primary-container p-6 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <User size={28} color="#1D4ED8" />
          </View>
          
          {editingName ? (
            <View className="flex-row items-center justify-center gap-2 mb-2">
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                className="w-32 h-10 text-center bg-primary/10 rounded-lg text-on-primary-container font-bold"
                autoFocus
                onSubmitEditing={saveName}
              />
              <TouchableOpacity
                onPress={saveName}
                className="h-8 w-8 items-center justify-center rounded-full bg-primary/20"
              >
                <Check size={16} color="#1D4ED8" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)} className="flex-row items-center justify-center gap-2 mb-2">
              <Text className="text-xl font-bold text-on-primary-container">
                {profile.name || 'Saver'} · Lv.{profile.level}
              </Text>
              <Pencil size={14} color="#1D4ED8" />
            </TouchableOpacity>
          )}

          <Text className="text-sm font-medium text-on-primary-container/70 mb-5">
            {profile.personalityType
              ? `${profile.personalityType.charAt(0).toUpperCase() + profile.personalityType.slice(1)} personality`
              : 'Financial explorer'}
          </Text>

          <View className="w-full flex-row justify-between px-2">
            <View className="items-center">
              <Text className="text-xl font-bold text-on-primary-container">${totalSaved}</Text>
              <Text className="text-[11px] font-medium text-on-primary-container/60 mt-1">Total Saved</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-bold text-on-primary-container">{goals.length}</Text>
              <Text className="text-[11px] font-medium text-on-primary-container/60 mt-1">Goals</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-bold text-on-primary-container">{unlockedBadges}</Text>
              <Text className="text-[11px] font-medium text-on-primary-container/60 mt-1">Badges</Text>
            </View>
          </View>
        </View>

        {/* Income */}
        <View className="mb-6 rounded-2xl bg-surface-container-low p-4">
          <View className="flex-row items-center gap-2 mb-3">
            <CreditCard size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">Monthly Income</Text>
          </View>
          <Text className="text-2xl font-bold text-on-surface">${profile.monthlyIncome.toLocaleString()}</Text>
        </View>

        {/* Expense breakdown */}
        {Object.keys(expensesByCategory).length > 0 && (
          <View className="mb-6 rounded-2xl bg-surface-container-low p-4">
            <Text className="mb-4 text-sm font-bold text-on-surface">Expense Breakdown</Text>
            <View className="gap-3">
              {Object.entries(expensesByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const c = EXPENSE_CATEGORIES.find((x) => x.id === cat);
                  return (
                    <View key={cat} className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Text className="text-xl">{c?.icon || '📌'}</Text>
                        <Text className="text-sm font-medium text-on-surface">{c?.name || cat}</Text>
                      </View>
                      <Text className="text-sm font-bold text-on-surface">${amount}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* Notifications */}
        <View className="mb-6 rounded-2xl bg-surface-container-low p-4">
          <View className="flex-row items-center gap-2 mb-4">
            <Bell size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">Notifications</Text>
          </View>
          <View className="gap-4">
            {(
              [
                ['paydayReminder', 'Payday saving reminder'],
                ['streakProtection', 'Streak protection alert'],
                ['milestoneAlerts', 'Milestone celebrations'],
                ['weeklyReflection', 'Weekly reflection'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-on-surface">{label}</Text>
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

        {/* Reset */}
        <Button 
          variant="outline" 
          onPress={handleReset} 
          className="mb-10 w-full flex-row items-center justify-center gap-2 border-outline/50"
        >
          <RotateCcw size={14} color="#64748B" />
          <Text className="text-sm font-bold text-on-surface-variant">Reset All Data (Demo)</Text>
        </Button>

        {/* Footer info */}
        <View className="mb-12 items-center">
          <Text className="text-[10px] text-on-surface-variant/40 uppercase tracking-widest">
            Piggnify v{Constants.expoConfig?.version || '1.0.0'}
          </Text>
          <Text className="text-[10px] text-on-surface-variant/30 mt-1">
            Device: {Constants.deviceName} • SB: {Constants.statusBarHeight}px
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
