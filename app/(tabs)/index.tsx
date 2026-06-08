import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Plus, Flame, TrendingUp, ChevronRight, Calendar } from 'lucide-react-native';
import { MotiView } from 'moti';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore, formatCurrency } from '@/lib/store';
import { AddExpenseModal } from '@/components/AddExpenseModal';
import { Button } from '@/components/ui/button';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useFocusKey } from '@/hooks/useFocusKey';

export default function Dashboard() {
  const router = useRouter();
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const [showExpense, setShowExpense] = useState(false);
  const [todaySpend, setTodaySpend] = useState(0);
  const [activeGoalIndex, setActiveGoalIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const animKey = useFocusKey();

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

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7);
  const savedToday = goals.reduce(
    (sum, g) => sum + g.deposits.filter((d) => d.date === today).reduce((s, d) => s + d.amount, 0),
    0
  );
  const savedThisMonth = goals.reduce(
    (sum, g) => sum + g.deposits.filter((d) => d.date.startsWith(thisMonth)).reduce((s, d) => s + d.amount, 0),
    0
  );

  const primaryGoal = goals.find((g) => g.isPrimary) || goals[0];
  const activeGoal = goals[activeGoalIndex] ?? primaryGoal;
  const progress = activeGoal
    ? Math.round((activeGoal.savedAmount / activeGoal.targetAmount) * 100)
    : 0;

  const daysUntilDeadline = activeGoal
    ? Math.max(0, Math.ceil((new Date(activeGoal.deadline).getTime() - Date.now()) / 86400000))
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
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 py-6">
        <View key={animKey}>
        {profile.incomeSkipped && (
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: 0 }}
          >
            <View className="mb-4 rounded-2xl bg-warning-container p-4" style={{ borderLeftWidth: 4, borderLeftColor: '#F59E0B' }}>
              <Text className="text-sm font-semibold text-warning">
                💡 Add your monthly income to unlock personalised savings insights.
              </Text>
            </View>
          </MotiView>
        )}

        {/* Header */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 0 }}
        >
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-medium text-on-surface-variant">
                {greeting()}
                {profile.name ? `, ${profile.name}` : ''}
              </Text>
              <Text className="text-3xl font-black text-on-surface">Piggy</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-warning-container px-3.5 py-2">
              <Flame size={18} color="#F59E0B" />
              <Text className="text-sm font-black text-warning">{profile.streak}</Text>
            </View>
          </View>
        </MotiView>

        {/* Goal Slider */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 60 }}
        >
          {goals.length > 0 ? (
            <View className="mb-2">
              <FlatList
                data={goals}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(g) => g.id}
                style={{ marginHorizontal: -20 }}
                onMomentumScrollEnd={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                  setActiveGoalIndex(Math.min(index, goals.length - 1));
                }}
                renderItem={({ item: g }) => {
                  const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
                  const days = Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000));
                  return (
                    <View style={{ width: screenWidth }} className="items-center px-5">
                      <ProgressRing progress={pct} size={200} strokeWidth={16}>
                        <Text className="text-3xl mb-1">{g.icon}</Text>
                        <Text className="text-4xl font-black text-on-surface">{pct}%</Text>
                        <Text className="text-sm font-medium text-on-surface-variant mt-1">{g.name}</Text>
                      </ProgressRing>
                      <Text className="mt-4 text-base font-semibold text-tertiary">
                        {formatCurrency(g.savedAmount, profile.currency)} of {formatCurrency(g.targetAmount, profile.currency)}
                      </Text>
                      <Text className="text-sm text-on-surface-variant mt-1">{days} days left</Text>
                    </View>
                  );
                }}
              />
              {goals.length > 1 && (
                <View className="flex-row justify-center gap-1.5 mt-4">
                  {goals.map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: i === activeGoalIndex ? 16 : 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: i === activeGoalIndex ? '#1D4ED8' : '#E2E8F0',
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View className="mb-6 rounded-3xl bg-primary-container p-8 items-center">
              <Text className="text-5xl mb-4">🐷</Text>
              <Text className="mb-2 text-xl font-black text-on-primary-container">Create your first goal</Text>
              <Button
                onPress={() => router.push('/goals')}
                className="flex-row items-center gap-2 mt-2"
                label="New Goal"
              />
            </View>
          )}
        </MotiView>

        {/* Motivational Copy */}
        {activeGoal && progress > 0 && (
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: 120 }}
          >
            <View className="mb-5 rounded-3xl bg-tertiary-container p-4 items-center flex-row justify-center gap-2">
              <Text className="text-lg">🐷</Text>
              <Text className="text-sm font-semibold text-on-tertiary-container text-center flex-1">
                {progress < 25
                  ? 'Great start! Every dollar counts 🌱'
                  : progress < 50
                  ? `You're ${progress}% closer to your ${activeGoal.name}! 💪`
                  : progress < 75
                  ? 'Halfway hero! Keep this momentum going 🚀'
                  : 'Almost there! Your goal is within reach 👑'}
              </Text>
            </View>
          </MotiView>
        )}

        {/* Streak + Today */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 180 }}
        >
          <View className="mb-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <Text className="mb-3 text-xs font-semibold text-on-surface-variant">Weekly Streak</Text>
              <View className="flex-row justify-between">
                {streakDots.map((d, i) => (
                  <View key={i} className="items-center gap-1.5">
                    <View className={`h-4 w-4 rounded-full ${d.active ? 'bg-warning' : 'bg-surface-container'}`} />
                    <Text className="text-[10px] font-semibold text-on-surface-variant">{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <Text className="mb-1.5 text-xs font-semibold text-on-surface-variant">Today's Spending</Text>
              <Text className="text-2xl font-black text-on-surface mb-1">{formatCurrency(todaySpend, profile.currency)}</Text>
              <Text className="text-xs text-on-surface-variant">
                across {profile.expenses.filter((e) => e.date === new Date().toISOString().split('T')[0]).length}{' '}
                expenses
              </Text>
            </View>
          </View>
        </MotiView>

        {/* Saved Today + This Month */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 240 }}
        >
          <View className="mb-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <View className="flex-row items-center gap-2 mb-1.5">
                <View className="h-7 w-7 rounded-xl bg-tertiary-container items-center justify-center">
                  <TrendingUp size={13} color="#22C55E" />
                </View>
                <Text className="text-xs font-semibold text-on-surface-variant">Saved Today</Text>
              </View>
              <Text className="text-2xl font-black text-tertiary">
                {formatCurrency(savedToday, profile.currency)}
              </Text>
            </View>
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <View className="flex-row items-center gap-2 mb-1.5">
                <View className="h-7 w-7 rounded-xl bg-tertiary-container items-center justify-center">
                  <Calendar size={13} color="#22C55E" />
                </View>
                <Text className="text-xs font-semibold text-on-surface-variant">Saved This Month</Text>
              </View>
              <Text className="text-2xl font-black text-tertiary">
                {formatCurrency(savedThisMonth, profile.currency)}
              </Text>
            </View>
          </View>
        </MotiView>

        {/* Quick Add Expense */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 300 }}
        >
          <Button
            onPress={() => setShowExpense(true)}
            variant="tonal"
            className="mb-5 w-full flex-row items-center justify-center h-14"
            label="Quick Add Expense"
          />
        </MotiView>

        {/* Level & Progress */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 360 }}
        >
          <View className="mb-5 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <TrendingUp size={16} color="#22C55E" />
                <Text className="text-sm font-bold text-on-surface">Saver Lv.{profile.level}</Text>
              </View>
              <Text className="text-xs font-bold text-on-surface-variant">
                {profile.xp % 100}/100 XP
              </Text>
            </View>
            <View className="h-2.5 w-full rounded-full bg-surface-container overflow-hidden">
              <View
                className="h-2.5 rounded-full bg-primary"
                style={{ width: `${profile.xp % 100}%` }}
              />
            </View>
          </View>
        </MotiView>

        {/* Goals list */}
        {goals.length > 0 && (
          <View className="mb-8">
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: 420 }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-on-surface">Your Goals</Text>
                <TouchableOpacity onPress={() => router.push('/goals')} className="flex-row items-center gap-0.5">
                  <Text className="text-sm font-semibold text-primary">See all</Text>
                  <ChevronRight size={16} color="#1D4ED8" />
                </TouchableOpacity>
              </View>
            </MotiView>
            <View className="gap-3">
              {goals.slice(0, 3).map((g, i) => (
                <MotiView
                  key={g.id}
                  from={{ opacity: 0, translateY: 16 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ delay: 480 + i * 60 }}
                >
                  <View
                    className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 min-h-[72px]"
                    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 }}
                  >
                    <Text className="text-2xl">{g.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-on-surface mb-2" numberOfLines={1}>
                        {g.name}
                      </Text>
                      <View className="h-2.5 w-full rounded-full bg-surface-container overflow-hidden">
                        <View
                          className="h-2.5 rounded-full bg-tertiary"
                          style={{ width: `${Math.round((g.savedAmount / g.targetAmount) * 100)}%` }}
                        />
                      </View>
                    </View>
                    <Text className="text-sm font-bold text-on-surface-variant">
                      {Math.round((g.savedAmount / g.targetAmount) * 100)}%
                    </Text>
                  </View>
                </MotiView>
              ))}
            </View>
          </View>
        )}
        </View>
      </ScrollView>

      <AddExpenseModal open={showExpense} onClose={() => setShowExpense(false)} />
    </SafeAreaView>
    </ScreenTransition>
  );
}
