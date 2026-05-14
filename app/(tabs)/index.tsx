import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Plus, Flame, TrendingUp, ChevronRight } from 'lucide-react-native';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore } from '@/lib/store';
import { AddExpenseModal } from '@/components/AddExpenseModal';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const router = useRouter();
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const [showExpense, setShowExpense] = useState(false);
  const [todaySpend, setTodaySpend] = useState(0);

  const calculateTodaySpend = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return profile.expenses
      .filter((e) => e.date === today)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [profile.expenses]);

  useEffect(() => {
    setTodaySpend(calculateTodaySpend());
  }, [calculateTodaySpend]);

  if (!profile.onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  const primaryGoal = goals.find((g) => g.isPrimary) || goals[0];
  const progress = primaryGoal
    ? Math.round((primaryGoal.savedAmount / primaryGoal.targetAmount) * 100)
    : 0;

  const daysUntilDeadline = primaryGoal
    ? Math.max(0, Math.ceil((new Date(primaryGoal.deadline).getTime() - Date.now()) / 86400000))
    : 0;

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const streakDots = weekDays.map((d, i) => ({
    label: d,
    active: i < Math.min(profile.streak, 7),
  }));

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 py-6">
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-medium text-on-surface-variant">
              {greeting()}
              {profile.name ? `, ${profile.name}` : ''}
            </Text>
            <Text className="text-3xl font-bold text-on-surface">Piggnify</Text>
          </View>
          <View className="flex-row items-center gap-1.5 rounded-full bg-warning-container px-3.5 py-2">
            <Flame size={16} color="#D97706" />
            <Text className="text-sm font-bold text-warning">{profile.streak}</Text>
          </View>
        </View>

        {/* Primary Goal Ring */}
        {primaryGoal ? (
          <View className="mb-6 items-center">
            <ProgressRing progress={progress} size={200} strokeWidth={14}>
              <Text className="text-3xl mb-1">{primaryGoal.icon}</Text>
              <Text className="text-4xl font-bold text-on-surface">{progress}%</Text>
              <Text className="text-sm font-medium text-on-surface-variant mt-1">{primaryGoal.name}</Text>
            </ProgressRing>
            <Text className="mt-4 text-base font-medium text-tertiary">
              ${primaryGoal.savedAmount.toLocaleString()} of ${primaryGoal.targetAmount.toLocaleString()}
            </Text>
            <Text className="text-sm text-on-surface-variant mt-1">{daysUntilDeadline} days left</Text>
          </View>
        ) : (
          <View className="mb-6 rounded-3xl bg-primary-container p-8 items-center">
            <Text className="mb-4 text-xl font-bold text-on-primary-container">Create your first goal</Text>
            <Button
              onPress={() => router.push('/goals')}
              className="flex-row items-center gap-2"
              label="New Goal"
            />
          </View>
        )}

        {/* Motivational Copy */}
        {primaryGoal && progress > 0 && (
          <View className="mb-5 rounded-2xl bg-tertiary-container p-4 items-center">
            <Text className="text-sm font-medium text-on-tertiary-container text-center">
              {progress < 25
                ? 'Great start! Every dollar counts 🌱'
                : progress < 50
                ? `You're ${progress}% closer to your ${primaryGoal.name}! 💪`
                : progress < 75
                ? 'Halfway hero! Keep this momentum going 🚀'
                : 'Almost there! Your goal is within reach 👑'}
            </Text>
          </View>
        )}

        {/* Streak + Today */}
        <View className="mb-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-surface-container-low p-4">
            <Text className="mb-3 text-xs font-medium text-on-surface-variant">Weekly Streak</Text>
            <View className="flex-row justify-between">
              {streakDots.map((d, i) => (
                <View key={i} className="items-center gap-1.5">
                  <View
                    className={`h-3 w-3 rounded-full ${
                      d.active ? 'bg-tertiary' : 'bg-surface-container'
                    }`}
                  />
                  <Text className="text-[10px] text-on-surface-variant">{d.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="flex-1 rounded-2xl bg-surface-container-low p-4">
            <Text className="mb-1.5 text-xs font-medium text-on-surface-variant">Today's Spending</Text>
            <Text className="text-2xl font-bold text-on-surface mb-1">${todaySpend.toFixed(0)}</Text>
            <Text className="text-xs text-on-surface-variant">
              across {profile.expenses.filter((e) => e.date === new Date().toISOString().split('T')[0]).length}{' '}
              expenses
            </Text>
          </View>
        </View>

        {/* Quick Add Expense */}
        <Button
          onPress={() => setShowExpense(true)}
          variant="tonal"
          className="mb-5 w-full flex-row items-center justify-center h-14"
          label="Quick Add Expense"
        />

        {/* Level & Progress */}
        <View className="mb-5 rounded-2xl bg-surface-container-low p-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <TrendingUp size={16} color="#10B981" />
              <Text className="text-sm font-bold text-on-surface">Saver Lv.{profile.level}</Text>
            </View>
            <Text className="text-xs font-medium text-on-surface-variant">
              {profile.xp % 100}/100 XP
            </Text>
          </View>
          <View className="h-1.5 w-full rounded-full bg-surface-container overflow-hidden">
            <View
              className="h-1.5 rounded-full bg-primary"
              style={{ width: `${profile.xp % 100}%` }}
            />
          </View>
        </View>

        {/* Goals list */}
        {goals.length > 0 && (
          <View className="mb-8">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-on-surface">Your Goals</Text>
              <TouchableOpacity onPress={() => router.push('/goals')} className="flex-row items-center gap-0.5">
                <Text className="text-sm font-medium text-primary">See all</Text>
                <ChevronRight size={16} color="#1D4ED8" />
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              {goals.slice(0, 3).map((g) => (
                <View
                  key={g.id}
                  className="flex-row items-center gap-4 rounded-2xl bg-surface-container-low p-4 min-h-[72px]"
                >
                  <Text className="text-2xl">{g.icon}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-on-surface mb-2" numberOfLines={1}>
                      {g.name}
                    </Text>
                    <View className="h-1.5 w-full rounded-full bg-surface-container overflow-hidden">
                      <View
                        className="h-1.5 rounded-full bg-tertiary"
                        style={{ width: `${Math.round((g.savedAmount / g.targetAmount) * 100)}%` }}
                      />
                    </View>
                  </View>
                  <Text className="text-sm font-bold text-on-surface-variant">
                    {Math.round((g.savedAmount / g.targetAmount) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <AddExpenseModal open={showExpense} onClose={() => setShowExpense(false)} />
    </SafeAreaView>
  );
}
