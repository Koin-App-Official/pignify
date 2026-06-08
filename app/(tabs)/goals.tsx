import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useFocusKey } from '@/hooks/useFocusKey';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react-native';
import { MotiView } from 'moti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarModal } from '@/components/ui/calendar-modal';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore, CURRENCIES, Goal, formatCurrency } from '@/lib/store';
import { PLACEHOLDER_COLOR } from '@/lib/utils';
import ConfettiCannon from 'react-native-confetti-cannon';
import { ScreenTransition } from '@/components/ScreenTransition';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

const GOAL_CHIPS = [
  { label: 'Vacation', emoji: '🏝️' },
  { label: 'New Car', emoji: '🚗' },
  { label: 'House Deposit', emoji: '🏠' },
  { label: 'Emergency Fund', emoji: '💰' },
  { label: 'Something Else', emoji: '✏️' },
];

const TIMELINE_CHIPS = [
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: '2 years', months: 24 },
  { label: '3 years', months: 36 },
  { label: '5 years', months: 60 },
];

const GOAL_ICONS: Record<string, string> = {
  Vacation: '🏝️',
  'New Car': '🚗',
  'House Deposit': '🏠',
  'Emergency Fund': '💰',
  'Something Else': '✏️',
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthDiff(from: Date, to: Date): number {
  return Math.max(
    1,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  );
}

function formatTargetDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const TOTAL_STEPS = 4;

export default function Goals() {
  const goals = useStore((state) => state.goals);
  const currency = useStore((state) => state.profile.currency);
  const animKey = useFocusKey();
  const monthlyIncome = useStore((state) => state.profile.monthlyIncome);
  const addGoal = useStore((state) => state.addGoal);
  const updateGoal = useStore((state) => state.updateGoal);
  const addXP = useStore((state) => state.addXP);
  const unlockAchievement = useStore((state) => state.unlockAchievement);

  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  // Create flow state
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState(0);

  // Step 0 – goal name
  const [goalName, setGoalName] = useState('');
  const [goalNameError, setGoalNameError] = useState('');

  // Step 1 – target amount
  const [targetAmount, setTargetAmount] = useState('');
  const [targetAmountError, setTargetAmountError] = useState('');

  // Step 2 – timeline
  const [targetDate, setTargetDate] = useState('');
  const [selectedChipLabel, setSelectedChipLabel] = useState('');
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  // Goal detail / deposit
  const [viewGoal, setViewGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');

  const [confetti, setConfetti] = useState(false);
  const [smallConfetti, setSmallConfetti] = useState(false);

  // Derived
  const totalMonths = targetDate ? monthDiff(new Date(), new Date(targetDate)) : 1;
  const estimatedMonthlySavings = targetAmount ? Number(targetAmount) / totalMonths : 0;
  const savingsExceedsIncome =
    !!monthlyIncome && monthlyIncome > 0 && estimatedMonthlySavings > monthlyIncome;

  const goalIcon = GOAL_ICONS[goalName] ?? '🎯';

  const startCreate = () => {
    setCreating(true);
    setCreateStep(0);
    setGoalName('');
    setGoalNameError('');
    setTargetAmount('');
    setTargetAmountError('');
    setTargetDate('');
    setSelectedChipLabel('');
  };

  const handleTimelineChip = (months: number, label: string) => {
    setTargetDate(addMonths(new Date(), months).toISOString().split('T')[0]);
    setSelectedChipLabel(label);
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
    };
    addGoal(goal);
    setCreating(false);
    triggerConfetti();
    addXP(20);
  };

  const addDeposit = (goal: Goal) => {
    if (!depositAmount || Number(depositAmount) <= 0) return;
    const amount = Number(depositAmount);
    const updated = {
      savedAmount: goal.savedAmount + amount,
      deposits: [...goal.deposits, { date: new Date().toISOString(), amount }],
    };
    updateGoal(goal.id, updated);
    const newGoal = { ...goal, ...updated };
    setViewGoal(newGoal);
    setDepositAmount('');
    addXP(10);
    triggerSmallConfetti();
    const pct = (newGoal.savedAmount / newGoal.targetAmount) * 100;
    if (pct >= 25) unlockAchievement('a5');
    if (pct >= 50) unlockAchievement('a6');
    if (pct >= 75) unlockAchievement('a7');
    if (pct >= 100) unlockAchievement('a8');
  };

  const triggerConfetti = () => { setConfetti(true); setTimeout(() => setConfetti(false), 3000); };
  const triggerSmallConfetti = () => { setSmallConfetti(true); setTimeout(() => setSmallConfetti(false), 2000); };

  // ─── Goal detail view ────────────────────────────────────────────────────────
  if (viewGoal) {
    const g = goals.find((x) => x.id === viewGoal.id) || viewGoal;
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    return (
      <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView className="flex-1 px-5 py-6">
            <TouchableOpacity onPress={() => setViewGoal(null)} className="mb-4 flex-row items-center gap-1">
              <ArrowLeft size={16} color="#64748B" />
              <Text className="text-sm font-semibold text-on-surface-variant">Back</Text>
            </TouchableOpacity>

            <View className="items-center mb-6">
              <ProgressRing progress={pct} size={180} strokeWidth={16}>
                <Text className="text-4xl">{g.icon}</Text>
                <Text className="mt-1 text-4xl font-black text-on-surface">{pct}%</Text>
              </ProgressRing>
              <Text className="mt-4 text-xl font-black text-on-surface">{g.name}</Text>
              <Text className="text-sm font-semibold text-tertiary mt-1">
                {formatCurrency(g.savedAmount, currency)} of {formatCurrency(g.targetAmount, currency)}
              </Text>
            </View>

            <View className="mb-6 flex-row gap-3">
              <View className="flex-1">
                <Input keyboardType="numeric" value={depositAmount} onChangeText={setDepositAmount} placeholder="Add savings..." />
              </View>
              <Button onPress={() => addDeposit(g)} disabled={!depositAmount} label="Save" />
            </View>

            <View className="mb-6">
              <Text className="mb-3 text-sm font-bold text-on-surface">Milestones</Text>
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

            {g.deposits.length > 0 && (
              <View className="mb-8">
                <Text className="mb-3 text-sm font-bold text-on-surface">Deposit History</Text>
                <View className="gap-2">
                  {g.deposits.slice().reverse().map((d, i) => (
                    <View key={i} className="flex-row justify-between items-center rounded-2xl bg-surface-container-low p-4">
                      <Text className="text-sm font-medium text-on-surface-variant">{d.date.split('T')[0]}</Text>
                      <Text className="text-sm font-bold text-tertiary">+{formatCurrency(d.amount, currency)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        {smallConfetti && <ConfettiCannon count={50} origin={{ x: -10, y: 0 }} fallSpeed={3000} />}
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
              Step {createStep + 1} of {TOTAL_STEPS}
            </Text>
            <View className="flex-row gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View key={i} className={`h-2.5 flex-1 rounded-full ${i <= createStep ? 'bg-primary' : 'bg-surface-container'}`} />
              ))}
            </View>
          </View>

          <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">

            {/* Step 0: What are we saving for? */}
            {createStep === 0 && (
              <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
                <Text className="mb-2 text-3xl font-black text-on-surface">What are we saving for?</Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">Pick a goal or type your own below.</Text>

                <View className="flex-row flex-wrap gap-2 mb-5">
                  {GOAL_CHIPS.map((chip) => (
                    <TouchableOpacity
                      key={chip.label}
                      onPress={() => { setGoalName(chip.label); setGoalNameError(''); }}
                      className={`flex-row items-center gap-1.5 rounded-full px-4 py-2.5 border ${
                        goalName === chip.label
                          ? 'bg-primary-container border-2 border-primary'
                          : 'bg-surface-container-low border-outline'
                      }`}
                    >
                      <Text className="text-lg">{chip.emoji}</Text>
                      <Text className={`text-sm font-semibold ${goalName === chip.label ? 'text-on-primary-container' : 'text-on-surface'}`}>
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Input
                  value={goalName}
                  onChangeText={(v) => { setGoalName(v); if (v.trim().length >= 1) setGoalNameError(''); }}
                  placeholder="I want to..."
                />
                {goalNameError ? <Text className="mt-2 text-xs text-destructive">{goalNameError}</Text> : null}

                <View className="mt-8 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreating(false)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button
                    onPress={() => {
                      if (goalName.trim().length < 1) { setGoalNameError("Tell us what you're saving for! 🎯"); return; }
                      setCreateStep(1);
                    }}
                    className="flex-1 items-center justify-center flex-row gap-2"
                  >
                    <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </MotiView>
            )}

            {/* Step 1: Target amount */}
            {createStep === 1 && (
              <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
                <Text className="mb-2 text-3xl font-black text-on-surface">
                  How much do you need{'\n'}for your {goalName}?
                </Text>
                <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                  Don't worry, you can always adjust this later.
                </Text>

                <View className="flex-row items-center rounded-2xl bg-surface-container-low border border-outline-variant px-4 h-14">
                  <Text className="text-xl font-bold text-on-surface-variant mr-2">{currencySymbol}</Text>
                  <TextInput
                    className="flex-1 text-xl font-bold text-on-surface"
                    value={targetAmount}
                    onChangeText={(v) => { setTargetAmount(v.replace(/[^0-9.]/g, '')); if (targetAmountError) setTargetAmountError(''); }}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                </View>
                {targetAmountError ? <Text className="mt-2 text-xs text-destructive">{targetAmountError}</Text> : null}

                <View className="mt-8 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(0)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button
                    onPress={() => {
                      if (!(Number(targetAmount) > 0)) { setTargetAmountError('Please enter an amount greater than 0 💸'); return; }
                      setCreateStep(2);
                    }}
                    className="flex-1 items-center justify-center flex-row gap-2"
                  >
                    <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </MotiView>
            )}

            {/* Step 2: Timeline */}
            {createStep === 2 && (
              <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
                <Text className="mb-2 text-3xl font-black text-on-surface">
                  When do you want{'\n'}to achieve this?
                </Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                  Pick a timeframe or set a custom date.
                </Text>

                <View className="flex-row flex-wrap gap-2 mb-4">
                  {TIMELINE_CHIPS.map((chip) => (
                    <TouchableOpacity
                      key={chip.label}
                      onPress={() => handleTimelineChip(chip.months, chip.label)}
                      className={`rounded-full px-4 py-2.5 border ${
                        selectedChipLabel === chip.label
                          ? 'bg-primary-container border-2 border-primary'
                          : 'bg-surface-container-low border-outline'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${selectedChipLabel === chip.label ? 'text-on-primary-container' : 'text-on-surface'}`}>
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setIsCalendarVisible(true)}
                    className={`rounded-full px-4 py-2.5 border ${
                      selectedChipLabel === 'custom'
                        ? 'bg-primary-container border-2 border-primary'
                        : 'bg-surface-container-low border-outline'
                    }`}
                  >
                    <Text className={`text-sm font-semibold ${selectedChipLabel === 'custom' ? 'text-on-primary-container' : 'text-on-surface'}`}>
                      Custom Date
                    </Text>
                  </TouchableOpacity>
                </View>

                {targetDate && selectedChipLabel === 'custom' && (
                  <View className="rounded-2xl bg-surface-container-low p-4 mb-2">
                    <Text className="text-sm text-on-surface-variant">Selected date</Text>
                    <Text className="text-base font-bold text-on-surface mt-0.5">
                      {new Date(targetDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </Text>
                  </View>
                )}

                <View className="mt-6 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(1)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button
                    onPress={() => setCreateStep(3)}
                    disabled={!targetDate}
                    className="flex-1 items-center justify-center flex-row gap-2"
                  >
                    <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </MotiView>
            )}

            {/* Step 3: Review */}
            {createStep === 3 && (
              <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
                <Text className="mb-2 text-3xl font-black text-on-surface">Looks good!</Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                  Here's your savings plan at a glance.
                </Text>

                <View className="rounded-3xl bg-surface p-6 gap-4 mb-4" style={CARD_SHADOW}>
                  <ReviewRow label="Goal" value={`${goalIcon}  ${goalName}`} />
                  <ReviewRow label="Target" value={formatCurrency(Number(targetAmount), currency)} />
                  <ReviewRow label="Deadline" value={formatTargetDate(targetDate)} />
                  <View className="h-px bg-outline-variant" />
                  <ReviewRow
                    label="Est. monthly savings"
                    value={formatCurrency(parseFloat(estimatedMonthlySavings.toFixed(2)), currency)}
                    highlight
                  />
                </View>

                {savingsExceedsIncome && (
                  <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mb-4">
                    <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-sm text-warning">
                      This target requires saving more than your monthly income. You can adjust it anytime.
                    </Text>
                  </View>
                )}

                <Text className="mb-6 text-sm font-medium text-on-surface-variant text-center">
                  You're only {totalMonths} month{totalMonths !== 1 ? 's' : ''} away. Let's make it happen!
                </Text>

                <View className="flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(2)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button onPress={finishCreate} className="flex-1 items-center justify-center flex-row gap-2 h-14">
                    <Text className="text-base font-bold text-primary-foreground">Create Goal 🎉</Text>
                    <ArrowRight size={16} color="#ffffff" />
                  </Button>
                </View>
              </MotiView>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <CalendarModal
          isVisible={isCalendarVisible}
          onClose={() => setIsCalendarVisible(false)}
          onConfirm={(date) => { setTargetDate(date); setSelectedChipLabel('custom'); setIsCalendarVisible(false); }}
          initialDate={targetDate}
        />
      </SafeAreaView>
      </ScreenTransition>
    );
  }

  // ─── Goals list ──────────────────────────────────────────────────────────────
  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-5 py-6">
        <Text className="mb-6 text-2xl font-black text-on-surface">Your Goals</Text>

        {goals.length === 0 ? (
          <View className="rounded-3xl bg-primary-container p-10 items-center" style={CARD_SHADOW}>
            <Text className="text-5xl mb-4">🐷</Text>
            <Text className="mb-2 text-xl font-black text-on-primary-container">No goals yet</Text>
            <Text className="mb-6 text-sm font-medium text-center text-on-primary-container/70">
              Create your first savings goal to get started!
            </Text>
            <Button onPress={startCreate} className="flex-row items-center gap-2" label="Create Goal" />
          </View>
        ) : (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View key={animKey} className="gap-4 pb-24">
              {goals.map((g, index) => {
                const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
                return (
                  <MotiView
                    key={g.id}
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ delay: index * 100 }}
                  >
                    <TouchableOpacity onPress={() => setViewGoal(g)} className="w-full rounded-3xl bg-surface p-4" style={CARD_SHADOW}>
                      <View className="flex-row items-center gap-4">
                        <Text className="text-3xl">{g.icon}</Text>
                        <View className="flex-1">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-sm font-bold text-on-surface" numberOfLines={1}>{g.name}</Text>
                            {g.isPrimary && (
                              <View className="bg-primary-container px-2 py-0.5 rounded-full">
                                <Text className="text-[10px] font-bold text-on-primary-container">Primary</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-xs text-on-surface-variant mt-1">
                            {formatCurrency(g.savedAmount, currency)} / {formatCurrency(g.targetAmount, currency)}
                          </Text>
                          <View className="mt-3 h-2.5 w-full rounded-full bg-surface-container overflow-hidden">
                            <View className="h-2.5 rounded-full bg-tertiary" style={{ width: `${pct}%` }} />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </MotiView>
                );
              })}
            </View>
          </ScrollView>
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
      {confetti && <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} fallSpeed={2000} />}
    </SafeAreaView>
    </ScreenTransition>
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
