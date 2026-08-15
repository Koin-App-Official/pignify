import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  Alert,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { Plus, Flame, TrendingUp, ChevronRight, Calendar, Sparkles } from 'lucide-react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore, formatCurrency, CURRENCIES, type Goal, type UserPlan } from '@/lib/store';
import { AddExpenseModal } from '@/components/AddExpenseModal';
import { Button } from '@/components/ui/button';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useFocusReplay } from '@/hooks/useFocusReplay';
import { FadeInStagger } from '@/components/animation/FadeInStagger';
import { AnimatedCurrency } from '@/components/animation/AnimatedCurrency';
import { AnimatedProgressBar } from '@/components/animation/AnimatedProgressBar';
import { springPresets } from '@/lib/springPresets';
import { getTodayString, normalizeDay, sumDepositsForDate } from '@/lib/deposits';
import { useEntitlements } from '@/hooks/useEntitlements';
import { gateInfo, type GateInfo, type GateKey } from '@/lib/entitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import { triggerDeepAnalysis } from '@/lib/deepAnalysis';

function makeCurrencyFormatter(symbol: string, symbolAfter: boolean) {
  return (n: number): string => {
    'worklet';
    const rounded = Math.round(n);
    const sign = rounded < 0 ? '-' : '';
    const digits = Math.abs(rounded).toString();
    let withCommas = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) withCommas += ',';
      withCommas += digits[i];
    }
    return symbolAfter ? `${sign}${withCommas} ${symbol}` : `${sign}${symbol}${withCommas}`;
  };
}

export default function Dashboard() {
  const router = useRouter();
  const { openExpense } = useLocalSearchParams<{ openExpense?: string }>();
  // Fine-grained selectors instead of subscribing to the whole `profile`
  // object — this screen only touches these fields, so unrelated profile
  // changes (settings, plan sync, etc.) no longer re-render the dashboard.
  const userID = useStore((s) => s.profile.userID);
  const currency = useStore((s) => s.profile.currency);
  const expenses = useStore((s) => s.profile.expenses);
  const onboardingCompleted = useStore((s) => s.profile.onboardingCompleted);
  const incomeSkipped = useStore((s) => s.profile.incomeSkipped);
  const name = useStore((s) => s.profile.name);
  const streak = useStore((s) => s.profile.streak);
  const level = useStore((s) => s.profile.level);
  const xp = useStore((s) => s.profile.xp);
  const goals = useStore((state) => state.goals);
  const [showExpense, setShowExpense] = useState(false);
  const [activeGoalIndex, setActiveGoalIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const replay = useFocusReplay();

  // Opened via a "daily check-in" notification tap (app/_layout.tsx) deep-linking to ?openExpense=1.
  useEffect(() => {
    if (openExpense !== '1') return;
    setShowExpense(true);
    router.setParams({ openExpense: undefined });
  }, [openExpense]);

  const { plan, has, deepAnalysis } = useEntitlements();
  const incrementDeepAnalysis = useStore((s) => s.incrementDeepAnalysis);
  const [gate, setGate] = useState<GateInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const openGate = (key: GateKey) => setGate(gateInfo(key, plan));
  const closeGate = () => setGate(null);
  const goUpgrade = (target: UserPlan) => {
    setGate(null);
    router.push(`/plans?highlight=${target}`);
  };

  const runDeepAnalysis = async () => {
    if (!has('deepAnalysis')) return openGate('deepAnalysis');
    if (!deepAnalysis.allowed) return openGate('deepAnalysisQuota');

    setIsAnalyzing(true);
    const result = await triggerDeepAnalysis(userID ?? '');
    setIsAnalyzing(false);

    if (result.status === 'success') {
      incrementDeepAnalysis();
      Alert.alert('Analysis started', "We're crunching your numbers — check your email shortly.");
    } else {
      Alert.alert('Something went wrong', 'Could not start the analysis. Please try again.');
    }
  };

  const currencyInfo = CURRENCIES.find((c) => c.code === currency);
  const currencyFormatter = useMemo(
    () => makeCurrencyFormatter(currencyInfo?.symbol ?? currency, currencyInfo?.symbolAfter ?? false),
    [currencyInfo?.symbol, currencyInfo?.symbolAfter, currency]
  );

  const todaySpend = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const { savedToday, savedThisMonth } = useMemo(() => {
    const today = getTodayString();
    const thisMonth = today.slice(0, 7);
    return {
      savedToday: sumDepositsForDate(goals, today),
      savedThisMonth: goals.reduce(
        (sum, g) =>
          sum +
          g.deposits.filter((d) => normalizeDay(d.date).startsWith(thisMonth)).reduce((s, d) => s + d.amount, 0),
        0
      ),
    };
  }, [goals]);

  const renderGoalItem = useCallback(
    ({ item }: { item: Goal }) => (
      <GoalCarouselItem
        goal={item}
        screenWidth={screenWidth}
        currencyFormatter={currencyFormatter}
        currency={currency}
      />
    ),
    [screenWidth, currencyFormatter, currency]
  );

  const goalItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: screenWidth, offset: screenWidth * index, index }),
    [screenWidth]
  );

  const handleCarouselScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      setActiveGoalIndex(Math.min(index, goals.length - 1));
    },
    [screenWidth, goals.length]
  );

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  const primaryGoal = goals.find((g) => g.isPrimary) || goals[0];
  const activeGoal = goals[activeGoalIndex] ?? primaryGoal;
  const progress = activeGoal
    ? Math.round((activeGoal.savedAmount / activeGoal.targetAmount) * 100)
    : 0;

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
        <View>
        {incomeSkipped && (
          <FadeInStagger index={0} delayStep={60} replay={replay}>
            <View className="mb-4 rounded-2xl bg-warning-container p-4" style={{ borderLeftWidth: 4, borderLeftColor: '#F59E0B' }}>
              <Text className="text-sm font-semibold text-warning">
                💡 Add your monthly income to unlock personalised savings insights.
              </Text>
            </View>
          </FadeInStagger>
        )}

        {/* Header */}
        <FadeInStagger index={0} delayStep={60} replay={replay}>
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-medium text-on-surface-variant">
                {greeting()}
                {name ? `, ${name}` : ''}
              </Text>
              <Text className="text-3xl font-black text-on-surface">Piggy</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-warning-container px-3.5 py-2">
              <Flame size={18} color="#F59E0B" />
              <Text className="text-sm font-black text-warning">{streak}</Text>
            </View>
          </View>
        </FadeInStagger>

        {/* Goal Slider */}
        <FadeInStagger index={1} delayStep={60} replay={replay}>
          {goals.length > 0 ? (
            <View className="mb-2">
              <FlatList
                data={goals}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(g) => g.id}
                style={{ marginHorizontal: -20 }}
                onMomentumScrollEnd={handleCarouselScrollEnd}
                renderItem={renderGoalItem}
                getItemLayout={goalItemLayout}
                initialNumToRender={3}
                windowSize={3}
                removeClippedSubviews
              />
              {goals.length > 1 && (
                <View className="flex-row justify-center gap-1.5 mt-4">
                  {goals.map((_, i) => (
                    <CarouselDot key={i} active={i === activeGoalIndex} />
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
        </FadeInStagger>

        {/* Motivational Copy */}
        {activeGoal && progress > 0 && (
          <FadeInStagger index={2} delayStep={60} replay={replay}>
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
          </FadeInStagger>
        )}

        {/* Deep Analysis */}
        <FadeInStagger index={3} delayStep={60} replay={replay}>
          <TouchableOpacity
            onPress={runDeepAnalysis}
            disabled={isAnalyzing}
            activeOpacity={0.85}
            className="mb-5 w-full rounded-2xl bg-primary-container px-4 h-14 flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 rounded-xl bg-primary/10 items-center justify-center">
                <Sparkles size={18} color="#1D4ED8" />
              </View>
              <Text className="text-sm font-black text-on-primary-container">
                {isAnalyzing ? 'Analyzing…' : 'Deep Analysis'}
              </Text>
            </View>
            <Text className="text-xs font-bold text-on-primary-container/70">
              {!has('deepAnalysis')
                ? 'Upgrade to unlock'
                : deepAnalysis.unlimited
                ? 'Unlimited'
                : `${deepAnalysis.remaining} of ${deepAnalysis.limit} left`}
            </Text>
          </TouchableOpacity>
        </FadeInStagger>

        {/* Today's Spending */}
        <FadeInStagger index={4} delayStep={60} replay={replay}>
          <View className="mb-5 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
            <Text className="mb-1.5 text-xs font-semibold text-on-surface-variant">Today's Spending</Text>
            <AnimatedCurrency
              value={todaySpend}
              formatter={currencyFormatter}
              style={{ fontSize: 24, fontWeight: '900', color: '#0f172a', marginBottom: 4, padding: 0 }}
            />
            <Text className="text-xs text-on-surface-variant">
              across {expenses.filter((e) => e.date === new Date().toISOString().split('T')[0]).length}{' '}
              expenses
            </Text>
          </View>
        </FadeInStagger>

        {/* Saved Today + This Month */}
        <FadeInStagger index={5} delayStep={60} replay={replay}>
          <View className="mb-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <View className="flex-row items-center gap-2 mb-1.5">
                <View className="h-7 w-7 rounded-xl bg-tertiary-container items-center justify-center">
                  <TrendingUp size={13} color="#22C55E" />
                </View>
                <Text className="text-xs font-semibold text-on-surface-variant">Saved Today</Text>
              </View>
              <AnimatedCurrency
                value={savedToday}
                formatter={currencyFormatter}
                style={{ fontSize: 24, fontWeight: '900', color: '#22C55E', padding: 0 }}
              />
            </View>
            <View className="flex-1 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
              <View className="flex-row items-center gap-2 mb-1.5">
                <View className="h-7 w-7 rounded-xl bg-tertiary-container items-center justify-center">
                  <Calendar size={13} color="#22C55E" />
                </View>
                <Text className="text-xs font-semibold text-on-surface-variant">Saved This Month</Text>
              </View>
              <AnimatedCurrency
                value={savedThisMonth}
                formatter={currencyFormatter}
                style={{ fontSize: 24, fontWeight: '900', color: '#22C55E', padding: 0 }}
              />
            </View>
          </View>
        </FadeInStagger>

        {/* Quick Add Expense */}
        <FadeInStagger index={6} delayStep={60} replay={replay}>
          <Button
            onPress={() => setShowExpense(true)}
            variant="tonal"
            className="mb-5 w-full flex-row items-center justify-center h-14"
            label="Quick Add Expense"
          />
        </FadeInStagger>

        {/* Level & Progress */}
        <FadeInStagger index={7} delayStep={60} replay={replay}>
          <View className="mb-5 rounded-2xl bg-surface-container-low p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 }}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <TrendingUp size={16} color="#22C55E" />
                <Text className="text-sm font-bold text-on-surface">Saver Lv.{level}</Text>
              </View>
              <Text className="text-xs font-bold text-on-surface-variant">
                {xp % 100}/100 XP
              </Text>
            </View>
            <AnimatedProgressBar progress={(xp % 100) / 100} />
          </View>
        </FadeInStagger>

        {/* Goals list */}
        {goals.length > 0 && (
          <View className="mb-8">
            <FadeInStagger index={8} delayStep={60} replay={replay}>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-on-surface">Your Goals</Text>
                <TouchableOpacity onPress={() => router.push('/goals')} className="flex-row items-center gap-0.5">
                  <Text className="text-sm font-semibold text-primary">See all</Text>
                  <ChevronRight size={16} color="#1D4ED8" />
                </TouchableOpacity>
              </View>
            </FadeInStagger>
            <View className="gap-3">
              {goals.slice(0, 3).map((g, i) => (
                <FadeInStagger key={g.id} index={9 + i} delayStep={60} replay={replay}>
                  <View
                    className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 min-h-[72px]"
                    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 }}
                  >
                    <Text className="text-2xl">{g.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-on-surface mb-2" numberOfLines={1}>
                        {g.name}
                      </Text>
                      <AnimatedProgressBar
                        progress={g.savedAmount / g.targetAmount}
                        color="#22C55E"
                      />
                    </View>
                    <Text className="text-sm font-bold text-on-surface-variant">
                      {Math.round((g.savedAmount / g.targetAmount) * 100)}%
                    </Text>
                  </View>
                </FadeInStagger>
              ))}
            </View>
          </View>
        )}
        </View>
      </ScrollView>

      <AddExpenseModal open={showExpense} onClose={() => setShowExpense(false)} />

      <UpgradeModal
        isVisible={gate !== null}
        gate={gate}
        onClose={closeGate}
        onUpgrade={goUpgrade}
      />
    </SafeAreaView>
    </ScreenTransition>
  );
}

const GoalCarouselItem = memo(function GoalCarouselItem({
  goal,
  screenWidth,
  currencyFormatter,
  currency,
}: {
  goal: Goal;
  screenWidth: number;
  currencyFormatter: (n: number) => string;
  currency: string;
}) {
  const pct = Math.round((goal.savedAmount / goal.targetAmount) * 100);
  const days = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000));
  return (
    <View style={{ width: screenWidth }} className="items-center px-5">
      <ProgressRing progress={pct} size={200} strokeWidth={16}>
        <Text className="text-3xl mb-1">{goal.icon}</Text>
        <Text className="text-4xl font-black text-on-surface">{pct}%</Text>
        <Text className="text-sm font-medium text-on-surface-variant mt-1">{goal.name}</Text>
      </ProgressRing>
      <View className="mt-4 flex-row items-center">
        <AnimatedCurrency
          value={goal.savedAmount}
          formatter={currencyFormatter}
          style={{ fontSize: 16, fontWeight: '600', color: '#22C55E', padding: 0 }}
        />
        <Text className="text-base font-semibold text-tertiary">
          {' '}of {formatCurrency(goal.targetAmount, currency)}
        </Text>
      </View>
      <Text className="text-sm text-on-surface-variant mt-1">{days} days left</Text>
    </View>
  );
});

function CarouselDot({ active }: { active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(active ? 1 : 0, springPresets.press);
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [1, 2]) }],
    backgroundColor: active ? '#1D4ED8' : '#E2E8F0',
  }));

  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, transformOrigin: 'left' }, style]} />;
}

