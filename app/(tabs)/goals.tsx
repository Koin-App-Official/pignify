import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusReplay } from '@/hooks/useFocusReplay';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore, Goal, UserPlan, formatCurrency } from '@/lib/store';
import { useEntitlements } from '@/hooks/useEntitlements';
import { gateInfo, type GateInfo } from '@/lib/entitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ScreenTransition } from '@/components/ScreenTransition';
import { ContributionStep, PlanningMode } from '@/components/ContributionStep';
import { resolveMonthlyContribution } from '@/lib/goalMath';
import { getTodayString } from '@/lib/deposits';
import { FadeInStagger } from '@/components/animation/FadeInStagger';
import { PressableScale } from '@/components/animation/PressableScale';
import { AnimatedProgressBar } from '@/components/animation/AnimatedProgressBar';
import { SkiaConfetti } from '@/components/animation/SkiaConfetti';
import { useCelebrate } from '@/components/animation/useCelebrate';
import { springPresets } from '@/lib/springPresets';
import { Mascot } from '@/components/Mascot';
import { formatMonthYear } from '@/lib/i18n/format';
import type { SupportedLanguage } from '@/lib/i18n/detect';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

/** `label` stays the untranslated canonical goalName — see the equivalent
 * comment on GOAL_CHIPS in app/onboarding.tsx. Displayed text is translated
 * via `id` reusing onboarding.json's goal.chips.* keys (identical chip set). */
const GOAL_CHIPS = [
  { id: 'vacation', label: 'Vacation', emoji: '🏝️' },
  { id: 'newCar', label: 'New Car', emoji: '🚗' },
  { id: 'houseDeposit', label: 'House Deposit', emoji: '🏠' },
  { id: 'emergencyFund', label: 'Emergency Fund', emoji: '💰' },
  { id: 'somethingElse', label: 'Something Else', emoji: '✏️' },
];

const GOAL_ICONS: Record<string, string> = {
  Vacation: '🏝️',
  'New Car': '🚗',
  'House Deposit': '🏠',
  'Emergency Fund': '💰',
  'Something Else': '✏️',
};

/** Named steps for the add-goal flow — see the equivalent enum in app/onboarding.tsx. */
enum CreateStep {
  GoalDeclaration = 0,
  TargetAmount = 1,
  Contribution = 2,
  Review = 3,
}

const TOTAL_STEPS = 4;

export default function Goals() {
  const { t } = useTranslation(['goals', 'onboarding']);
  const { t: tPlans } = useTranslation('plans');
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const goals = useStore((state) => state.goals);
  const currency = useStore((state) => state.profile.currency);
  const language = useStore((state) => state.profile.language);
  const { plan, goals: goalQuota } = useEntitlements();
  const [gate, setGate] = useState<GateInfo | null>(null);
  const replay = useFocusReplay();
  const { confettiProgress: depositConfettiProgress, celebrate: celebrateDeposit, active: depositConfettiActive } = useCelebrate();
  const { confettiProgress: creationConfettiProgress, celebrate: celebrateCreation, active: creationConfettiActive } = useCelebrate();
  const monthlyIncome = useStore((state) => state.profile.monthlyIncome);
  const addGoal = useStore((state) => state.addGoal);
  const updateGoal = useStore((state) => state.updateGoal);
  const addXP = useStore((state) => state.addXP);
  const unlockAchievement = useStore((state) => state.unlockAchievement);

  const renderGoalListRow = useCallback(
    ({ item, index }: { item: Goal; index: number }) => (
      <GoalListRow goal={item} index={index} currency={currency} replay={replay} onPress={setViewGoal} />
    ),
    [currency, replay]
  );

  // Create flow state
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>(CreateStep.GoalDeclaration);

  // Step 0 – goal name
  const [goalName, setGoalName] = useState('');
  const [goalNameError, setGoalNameError] = useState('');

  // Step 1 – target amount
  const [targetAmount, setTargetAmount] = useState('');
  const [targetAmountError, setTargetAmountError] = useState('');

  // Step 2 – contribution. `targetDate` ends up holding the derived date
  // (contribution mode) or the picked date (deadline mode) either way.
  const [planningMode, setPlanningMode] = useState<PlanningMode>('contribution');
  const [contributionInput, setContributionInput] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState(0);

  // Goal detail / deposit
  const [viewGoal, setViewGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');


  // Derived
  // Multiple-goals reality check: sum what every other active goal already
  // sets aside so review can warn if adding this one pushes the total over
  // income — a check that couldn't exist in the old date-first flow.
  const otherActiveGoalsMonthlyTotal = useMemo(
    () =>
      goals
        .filter((g) => !g.archived)
        .reduce((sum, g) => sum + resolveMonthlyContribution(g.targetAmount, g.deadline, g.createdAt, g.monthlyContribution), 0),
    [goals]
  );
  const totalMonthlyWithNewGoal = otherActiveGoalsMonthlyTotal + monthlyContribution;
  const savingsExceedsIncome =
    !!monthlyIncome && monthlyIncome > 0 && totalMonthlyWithNewGoal > monthlyIncome;

  const goalIcon = GOAL_ICONS[goalName] ?? '🎯';

  // Resolved current goal + its deposits reversed (most-recent first). Hoisted
  // above the viewGoal conditional so useMemo stays unconditional; `g.deposits`
  // only changes reference when a deposit is actually added, so this stays
  // stable across unrelated re-renders (e.g. typing in the deposit input).
  const g = viewGoal ? goals.find((x) => x.id === viewGoal.id) || viewGoal : null;
  const reversedDeposits = useMemo(() => (g ? [...g.deposits].reverse() : []), [g]);

  const startCreate = () => {
    // Goal quota gate (C6/C13): if the active-goal limit is reached, keep the
    // create button visible but open the upgrade popup instead of the flow.
    if (!goalQuota.allowed) {
      setGate(gateInfo('goals', plan, tPlans));
      return;
    }
    setCreating(true);
    setCreateStep(CreateStep.GoalDeclaration);
    setGoalName('');
    setGoalNameError('');
    setTargetAmount('');
    setTargetAmountError('');
    setPlanningMode('contribution');
    setContributionInput('');
    setTargetDate('');
    setMonthlyContribution(0);
  };

  const finishCreate = () => {
    const goal: Goal = {
      id: Math.random().toString(36).substring(7),
      template: '',
      icon: goalIcon,
      name: goalName,
      targetAmount: Number(targetAmount),
      savedAmount: 0,
      deadline: targetDate,
      createdAt: new Date().toISOString(),
      deposits: [],
      isPrimary: goals.length === 0,
      planningMode,
      monthlyContribution,
    };
    addGoal(goal);
    setCreating(false);
    celebrateCreation();
    addXP(20);
  };

  const addDeposit = (goal: Goal) => {
    if (!depositAmount || Number(depositAmount) <= 0) return;
    const amount = Number(depositAmount);
    const updated = {
      savedAmount: goal.savedAmount + amount,
      // Calendar day (YYYY-MM-DD), not a timestamp — per-day readers compare
      // against day strings. See the contract note in src/lib/deposits.ts.
      deposits: [...goal.deposits, { date: getTodayString(), amount }],
    };
    updateGoal(goal.id, updated);
    const newGoal = { ...goal, ...updated };
    setViewGoal(newGoal);
    setDepositAmount('');
    addXP(10);
    celebrateDeposit();
    const pct = (newGoal.savedAmount / newGoal.targetAmount) * 100;
    if (pct >= 25) unlockAchievement('a5');
    if (pct >= 50) unlockAchievement('a6');
    if (pct >= 75) unlockAchievement('a7');
    if (pct >= 100) unlockAchievement('a8');
  };


  // ─── Goal detail view ────────────────────────────────────────────────────────
  if (viewGoal && g) {
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    const monthlySetAside = resolveMonthlyContribution(g.targetAmount, g.deadline, g.createdAt, g.monthlyContribution);
    return (
      <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <FlashList
            data={reversedDeposits}
            keyExtractor={(d) => `${d.date}-${d.amount}`}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24 }}
            renderItem={({ item: d }) => (
              <View className="flex-row justify-between items-center rounded-2xl bg-surface-container-low p-4 mb-2">
                <Text className="text-sm font-medium text-on-surface-variant">{d.date.split('T')[0]}</Text>
                <Text className="text-sm font-bold text-tertiary">+{formatCurrency(d.amount, currency)}</Text>
              </View>
            )}
            ListHeaderComponent={
              <View>
                <TouchableOpacity onPress={() => setViewGoal(null)} className="mb-4 flex-row items-center gap-1">
                  <ArrowLeft size={16} color="#64748B" />
                  <Text className="text-sm font-semibold text-on-surface-variant">{t('detail.back')}</Text>
                </TouchableOpacity>

                <View className="items-center mb-6">
                  <ProgressRing progress={pct} size={180} strokeWidth={16}>
                    <Text className="text-4xl">{g.icon}</Text>
                    <Text className="mt-1 text-4xl font-black text-on-surface">{pct}%</Text>
                  </ProgressRing>
                  <Text className="mt-4 text-xl font-black text-on-surface">{g.name}</Text>
                  <Text className="text-sm font-semibold text-tertiary mt-1">
                    {t('detail.savedOfTarget', {
                      saved: formatCurrency(g.savedAmount, currency),
                      target: formatCurrency(g.targetAmount, currency),
                    })}
                  </Text>
                  <Text className="text-xs text-on-surface-variant mt-2">
                    {t('detail.settingAside', {
                      amount: formatCurrency(monthlySetAside, currency),
                      date: formatMonthYear(g.deadline, language),
                    })}
                  </Text>
                </View>

                <View className="mb-6 flex-row gap-3">
                  <View className="flex-1">
                    <Input keyboardType="numeric" value={depositAmount} onChangeText={setDepositAmount} placeholder={t('detail.addSavingsPlaceholder')} />
                  </View>
                  <Button onPress={() => addDeposit(g)} disabled={!depositAmount} label={t('detail.save')} />
                </View>

                <View className="mb-6">
                  <Text className="mb-3 text-sm font-bold text-on-surface">{t('detail.milestones')}</Text>
                  <View className="gap-2">
                    {[25, 50, 75, 100].map((m) => (
                      <View
                        key={m}
                        className={`flex-row items-center gap-3 rounded-2xl p-4 ${pct >= m ? 'bg-tertiary-container' : 'bg-surface-container-low'}`}
                        style={pct >= m ? { borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' } : {}}
                      >
                        <Text className="text-lg">{pct >= m ? '✅' : '⬜'}</Text>
                        <View className="flex-1">
                          <Text className="text-sm font-black text-on-surface">{m}%</Text>
                          <Text className="text-xs text-on-surface-variant mt-0.5">
                            {formatCurrency(Math.round((g.targetAmount * m) / 100), currency)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {reversedDeposits.length > 0 && (
                  <Text className="mb-3 text-sm font-bold text-on-surface">{t('detail.depositHistory')}</Text>
                )}
              </View>
            }
          />
        </KeyboardAvoidingView>
        {depositConfettiActive && (
          <SkiaConfetti progress={depositConfettiProgress} width={windowWidth} height={windowHeight} />
        )}
      </SafeAreaView>
      </ScreenTransition>
    );
  }

  // ─── Create flow ─────────────────────────────────────────────────────────────
  if (creating) {
    return (
      <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          {/* Progress bar */}
          <View className="px-5 pt-6 pb-2">
            <Text className="mb-2 text-xs font-semibold text-on-surface-variant text-center">
              {t('onboarding:common.stepProgress', { current: createStep + 1, total: TOTAL_STEPS })}
            </Text>
            <View className="flex-row gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <ProgressSegment key={i} active={i <= createStep} />
              ))}
            </View>
          </View>

          <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">

            {/* Step 0: What are we saving for? */}
            {createStep === CreateStep.GoalDeclaration && (
              <Animated.View entering={FadeInDown.springify()}>
                <Text className="mb-2 text-3xl font-black text-on-surface">{t('onboarding:goal.headline')}</Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">{t('onboarding:goal.sub')}</Text>

                <View className="flex-row flex-wrap gap-2 mb-5">
                  {GOAL_CHIPS.map((chip) => (
                    <PressableScale
                      key={chip.id}
                      onPress={() => { setGoalName(chip.label); setGoalNameError(''); }}
                    >
                      <View
                        className={`flex-row items-center gap-1.5 rounded-full px-4 py-2.5 border ${
                          goalName === chip.label
                            ? 'bg-primary-container border-2 border-primary'
                            : 'bg-surface-container-low border-outline'
                        }`}
                      >
                        <Text className="text-lg">{chip.emoji}</Text>
                        <Text className={`text-sm font-semibold ${goalName === chip.label ? 'text-on-primary-container' : 'text-on-surface'}`}>
                          {t(`onboarding:goal.chips.${chip.id}`)}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>

                <Input
                  value={goalName}
                  onChangeText={(v) => { setGoalName(v); if (v.trim().length >= 1) setGoalNameError(''); }}
                  placeholder={t('onboarding:goal.placeholder')}
                />
                {goalNameError ? <Text className="mt-2 text-xs text-destructive">{goalNameError}</Text> : null}

                <View className="mt-8 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreating(false)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button
                    onPress={() => {
                      if (goalName.trim().length < 1) { setGoalNameError(t('onboarding:goal.errorEmpty')); return; }
                      setCreateStep(CreateStep.TargetAmount);
                    }}
                    className="flex-1 items-center justify-center flex-row gap-2"
                  >
                    <Text className="text-sm font-bold text-primary-foreground">{t('onboarding:common.continue')}</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </Animated.View>
            )}

            {/* Step 1: Target amount */}
            {createStep === CreateStep.TargetAmount && (
              <Animated.View entering={FadeInDown.springify()}>
                <Text className="mb-2 text-3xl font-black text-on-surface">
                  {t('onboarding:targetAmount.headline', { goalName })}
                </Text>
                <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                  {t('onboarding:targetAmount.sub')}
                </Text>

                <CurrencyAmountInput
                  currencyCode={currency}
                  value={targetAmount}
                  onChangeText={(v) => { setTargetAmount(v); if (targetAmountError) setTargetAmountError(''); }}
                  placeholder={t('onboarding:contribution.amountPlaceholder')}
                />
                {targetAmountError ? <Text className="mt-2 text-xs text-destructive">{targetAmountError}</Text> : null}

                <View className="mt-8 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(CreateStep.GoalDeclaration)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button
                    onPress={() => {
                      if (!(Number(targetAmount) > 0)) { setTargetAmountError(t('onboarding:targetAmount.errorEmpty')); return; }
                      setCreateStep(CreateStep.Contribution);
                    }}
                    className="flex-1 items-center justify-center flex-row gap-2"
                  >
                    <Text className="text-sm font-bold text-primary-foreground">{t('onboarding:common.continue')}</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </Animated.View>
            )}

            {/* Step 2: Contribution (shared with onboarding) */}
            {createStep === CreateStep.Contribution && (
              <Animated.View entering={FadeInDown.springify()}>
                <ContributionStep
                  currency={currency}
                  language={language}
                  targetAmount={Number(targetAmount)}
                  monthlyIncome={monthlyIncome}
                  incomeSkipped={!monthlyIncome}
                  planningMode={planningMode}
                  onPlanningModeChange={setPlanningMode}
                  contribution={contributionInput}
                  onContributionChange={setContributionInput}
                  deadline={targetDate}
                  onDeadlineChange={setTargetDate}
                  onBack={() => setCreateStep(CreateStep.TargetAmount)}
                  onContinue={(result) => {
                    setMonthlyContribution(result.monthlyContribution);
                    setTargetDate(result.targetDate);
                    setPlanningMode(result.planningMode);
                    setCreateStep(CreateStep.Review);
                  }}
                />
              </Animated.View>
            )}

            {/* Step 3: Review */}
            {createStep === CreateStep.Review && (
              <Animated.View entering={FadeInDown.springify()}>
                <Text className="mb-2 text-3xl font-black text-on-surface">{t('review.headline')}</Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                  {t('review.sub')}
                </Text>

                <View className="rounded-3xl bg-surface p-6 gap-4 mb-4" style={CARD_SHADOW}>
                  <ReviewRow label={t('onboarding:blueprint.rowGoal')} value={`${goalIcon}  ${goalName}`} />
                  <ReviewRow label={t('onboarding:blueprint.rowTarget')} value={formatCurrency(Number(targetAmount), currency)} />
                  <View className="h-px bg-outline-variant" />
                  <ReviewRow
                    label={t('onboarding:blueprint.rowMonthlySetAside')}
                    value={formatCurrency(monthlyContribution, currency)}
                    highlight
                  />
                  <ReviewRow label={t('onboarding:blueprint.rowGoalReached')} value={formatMonthYear(targetDate, language)} />
                </View>

                {savingsExceedsIncome && (
                  <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mb-4">
                    <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-sm text-warning">
                      {otherActiveGoalsMonthlyTotal > 0
                        ? t('review.warningMultiGoal')
                        : t('review.warningSingleGoal')}
                    </Text>
                  </View>
                )}

                <View className="flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(CreateStep.Contribution)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button onPress={finishCreate} className="flex-1 items-center justify-center flex-row gap-2 h-14">
                    <Text className="text-base font-bold text-primary-foreground">{t('review.createGoal')}</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </ScreenTransition>
    );
  }

  // ─── Goals list ──────────────────────────────────────────────────────────────
  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-5 py-6">
        <Text className="mb-6 text-2xl font-black text-on-surface">{t('yourGoals')}</Text>

        {goals.length === 0 ? (
          <View className="rounded-3xl bg-primary-container p-10 items-center" style={CARD_SHADOW}>
            <Mascot size={48} />
            <Text className="mb-2 mt-4 text-xl font-black text-on-primary-container">{t('empty.title')}</Text>
            <Text className="mb-6 text-sm font-medium text-center text-on-primary-container/70">
              {t('empty.body')}
            </Text>
            <Button onPress={startCreate} className="flex-row items-center gap-2" label={t('empty.cta')} />
          </View>
        ) : (
          <FlashList
            data={goals}
            keyExtractor={(goal) => goal.id}
            renderItem={renderGoalListRow}
            contentContainerStyle={{ paddingBottom: 96 }}
            ItemSeparatorComponent={GoalListRowSeparator}
            showsVerticalScrollIndicator={false}
          />
        )}

        {goals.length > 0 && (
          <TouchableOpacity
            onPress={startCreate}
            className="absolute bottom-6 right-5 z-40 h-14 w-14 items-center justify-center rounded-2xl bg-primary"
            style={{ ...CARD_SHADOW, shadowOpacity: 0.2 }}
          >
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      {creationConfettiActive && (
        <SkiaConfetti progress={creationConfettiProgress} width={windowWidth} height={windowHeight} />
      )}

      <UpgradeModal
        isVisible={gate !== null}
        gate={gate}
        onClose={() => setGate(null)}
        onUpgrade={(target: UserPlan) => {
          setGate(null);
          router.push(`/plans?highlight=${target}`);
        }}
      />
    </SafeAreaView>
    </ScreenTransition>
  );
}

const GoalListRowSeparator = () => <View style={{ height: 16 }} />;

const GoalListRow = memo(function GoalListRow({
  goal,
  index,
  currency,
  replay,
  onPress,
}: {
  goal: Goal;
  index: number;
  currency: string;
  replay: SharedValue<number>;
  onPress: (g: Goal) => void;
}) {
  const { t } = useTranslation('goals');
  const pct = Math.round((goal.savedAmount / goal.targetAmount) * 100);
  return (
    <FadeInStagger index={index} delayStep={100} replay={replay}>
      <TouchableOpacity onPress={() => onPress(goal)} className="w-full rounded-3xl bg-surface p-4" style={CARD_SHADOW}>
        <View className="flex-row items-center gap-4">
          <Text className="text-3xl">{goal.icon}</Text>
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-on-surface" numberOfLines={1}>{goal.name}</Text>
              {goal.isPrimary && (
                <View className="bg-primary-container px-2 py-0.5 rounded-full">
                  <Text className="text-[10px] font-bold text-on-primary-container">{t('primary')}</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-on-surface-variant mt-1">
              {formatCurrency(goal.savedAmount, currency)} / {formatCurrency(goal.targetAmount, currency)}
            </Text>
            <View className="mt-3">
              <AnimatedProgressBar progress={pct / 100} color="#22C55E" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </FadeInStagger>
  );
});

function ProgressSegment({ active }: { active: boolean }) {
  const fill = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    fill.value = withSpring(active ? 1 : 0, springPresets.press);
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }],
  }));

  return (
    <View className="h-2.5 flex-1 rounded-full bg-surface-container overflow-hidden">
      <Animated.View
        className="h-full w-full rounded-full bg-primary"
        style={[{ transformOrigin: 'left' }, style]}
      />
    </View>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm font-medium text-on-surface-variant">{label}</Text>
      <Text className={`text-sm font-bold ${highlight ? 'text-primary' : 'text-on-surface'}`}>{value}</Text>
    </View>
  );
}
