import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProgressRing } from '@/components/ProgressRing';
import { useStore, GOAL_TEMPLATES, Goal } from '@/lib/store';
import ConfettiCannon from 'react-native-confetti-cannon';

export default function Goals() {
  const goals = useStore((state) => state.goals);
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [viewGoal, setViewGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  
  const [confetti, setConfetti] = useState<boolean>(false);
  const [smallConfetti, setSmallConfetti] = useState<boolean>(false);

  const addGoal = useStore((state) => state.addGoal);
  const updateGoal = useStore((state) => state.updateGoal);
  const addXP = useStore((state) => state.addXP);
  const unlockAchievement = useStore((state) => state.unlockAchievement);

  const template = GOAL_TEMPLATES.find((t) => t.id === selectedTemplate);

  const startCreate = () => {
    setCreating(true);
    setCreateStep(0);
    setSelectedTemplate('');
    setGoalName('');
    setTargetAmount('');
    setDeadline('');
  };

  const handleTemplateSelect = (id: string) => {
    const t = GOAL_TEMPLATES.find((t) => t.id === id)!;
    setSelectedTemplate(id);
    setGoalName(t.name);
    setTargetAmount(String(t.suggestedAmount));
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    setDeadline(d.toISOString().split('T')[0]);
  };

  const finishCreate = () => {
    const goal: Goal = {
      id: Math.random().toString(36).substring(7),
      template: selectedTemplate,
      icon: template?.icon || '🎯',
      name: goalName,
      targetAmount: Number(targetAmount),
      savedAmount: 0,
      deadline,
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
    
    // We update the local viewGoal reference so it reflects immediately
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

  const triggerConfetti = () => {
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3000);
  };

  const triggerSmallConfetti = () => {
    setSmallConfetti(true);
    setTimeout(() => setSmallConfetti(false), 2000);
  };

  if (viewGoal) {
    const g = goals.find((x) => x.id === viewGoal.id) || viewGoal;
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <ScrollView className="flex-1 px-5 py-6">
            <TouchableOpacity onPress={() => setViewGoal(null)} className="mb-4 flex-row items-center gap-1">
              <ArrowLeft size={16} color="#64748B" />
              <Text className="text-sm font-medium text-on-surface-variant">Back</Text>
            </TouchableOpacity>

            <View className="items-center mb-6">
              <ProgressRing progress={pct} size={180} strokeWidth={14}>
                <Text className="text-4xl">{g.icon}</Text>
                <Text className="mt-1 text-4xl font-bold text-on-surface">{pct}%</Text>
              </ProgressRing>
              <Text className="mt-4 text-xl font-bold text-on-surface">{g.name}</Text>
              <Text className="text-sm font-medium text-tertiary mt-1">
                ${g.savedAmount.toLocaleString()} of ${g.targetAmount.toLocaleString()}
              </Text>
            </View>

            <View className="mb-6 flex-row gap-3">
              <View className="flex-1">
                <Input 
                  keyboardType="numeric" 
                  value={depositAmount} 
                  onChangeText={setDepositAmount} 
                  placeholder="Add savings..." 
                />
              </View>
              <Button onPress={() => addDeposit(g)} disabled={!depositAmount} label="Save" />
            </View>

            <View className="mb-6">
              <Text className="mb-3 text-sm font-bold text-on-surface">Milestones</Text>
              <View className="gap-2">
                {[25, 50, 75, 100].map((m) => (
                  <View 
                    key={m} 
                    className={`flex-row items-center gap-3 rounded-2xl p-4 ${
                      pct >= m ? 'bg-tertiary-container' : 'bg-surface-container-low'
                    }`}
                  >
                    <Text className="text-lg">{pct >= m ? '✅' : '⬜'}</Text>
                    <Text className="text-sm font-medium text-on-surface">
                      {m}% — ${Math.round((g.targetAmount * m) / 100).toLocaleString()}
                    </Text>
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
                      <Text className="text-sm font-medium text-on-surface-variant">
                        {d.date.split('T')[0]}
                      </Text>
                      <Text className="text-sm font-bold text-tertiary">+${d.amount}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        {smallConfetti && <ConfettiCannon count={50} origin={{x: -10, y: 0}} fallSpeed={3000} />}
      </SafeAreaView>
    );
  }

  if (creating) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <ScrollView className="flex-1 px-5 py-6">
            <TouchableOpacity onPress={() => setCreating(false)} className="mb-4 flex-row items-center gap-1">
              <ArrowLeft size={16} color="#64748B" />
              <Text className="text-sm font-medium text-on-surface-variant">Cancel</Text>
            </TouchableOpacity>

            {createStep === 0 && (
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -20 }}
              >
                <Text className="mb-2 text-2xl font-bold text-on-surface">New Goal</Text>
                <Text className="mb-6 text-sm font-medium text-on-surface-variant">What are you saving for?</Text>
                <View className="flex-row flex-wrap justify-between">
                  {GOAL_TEMPLATES.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => handleTemplateSelect(t.id)}
                      className={`mb-3 w-[48%] flex-col items-center gap-2 rounded-2xl p-4 ${
                        selectedTemplate === t.id
                          ? 'bg-primary-container border-2 border-primary'
                          : 'bg-surface-container-low'
                      }`}
                    >
                      <Text className="text-3xl">{t.icon}</Text>
                      <Text 
                        className={`text-sm font-medium ${
                          selectedTemplate === t.id ? 'text-on-primary-container' : 'text-on-surface'
                        }`}
                      >
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Button 
                  onPress={() => setCreateStep(1)} 
                  disabled={!selectedTemplate} 
                  className="mt-6 w-full flex-row items-center justify-center gap-2"
                  label="Continue"
                >
                </Button>
              </MotiView>
            )}

            {createStep === 1 && (
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -20 }}
              >
                <Text className="mb-4 text-center text-4xl">{template?.icon}</Text>
                <Text className="mb-6 text-2xl font-bold text-on-surface text-center">Set your target</Text>
                
                <View className="gap-5">
                  <View>
                    <Text className="mb-2 text-xs font-medium text-on-surface-variant">Name</Text>
                    <Input value={goalName} onChangeText={setGoalName} />
                  </View>
                  <View>
                    <Text className="mb-2 text-xs font-medium text-on-surface-variant">Amount ($)</Text>
                    <Input 
                      keyboardType="numeric" 
                      value={targetAmount} 
                      onChangeText={setTargetAmount} 
                      className="text-xl font-bold" 
                    />
                  </View>
                  <View>
                    <Text className="mb-2 text-xs font-medium text-on-surface-variant">Deadline (YYYY-MM-DD)</Text>
                    <Input value={deadline} onChangeText={setDeadline} />
                  </View>
                </View>
                
                <View className="mt-8 flex-row gap-3">
                  <Button variant="outline" onPress={() => setCreateStep(0)} className="w-14 items-center justify-center">
                    <ArrowLeft size={16} color="#1D4ED8" />
                  </Button>
                  <Button 
                    onPress={finishCreate} 
                    disabled={!targetAmount || !deadline} 
                    className="flex-1"
                    label="Create Goal 🎉"
                  />
                </View>
              </MotiView>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-5 py-6">
        <Text className="mb-6 text-2xl font-bold text-on-surface">Your Goals</Text>
        
        {goals.length === 0 ? (
          <View className="rounded-3xl bg-primary-container p-10 items-center">
            <Text className="mb-4 text-4xl">🎯</Text>
            <Text className="mb-2 text-xl font-bold text-on-primary-container">No goals yet</Text>
            <Text className="mb-6 text-sm text-center text-on-primary-container/70">
              Create your first savings goal to get started!
            </Text>
            <Button onPress={startCreate} className="flex-row items-center gap-2" label="Create Goal" />
          </View>
        ) : (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="gap-4 pb-24">
              {goals.map((g, index) => {
                const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
                return (
                  <MotiView
                    key={g.id}
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ delay: index * 100 }}
                  >
                    <TouchableOpacity 
                      onPress={() => setViewGoal(g)} 
                      className="w-full rounded-2xl bg-surface-container-low p-4"
                    >
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
                          ${g.savedAmount.toLocaleString()} / ${g.targetAmount.toLocaleString()}
                        </Text>
                        <View className="mt-3 h-1.5 w-full rounded-full bg-surface-container overflow-hidden">
                          <View className="h-1.5 rounded-full bg-tertiary" style={{ width: `${pct}%` }} />
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
            className="absolute bottom-6 right-5 z-40 h-14 w-14 items-center justify-center rounded-2xl bg-primary-container shadow-lg"
          >
            <Plus size={24} color="#1D4ED8" />
          </TouchableOpacity>
        )}
      </View>
      {confetti && <ConfettiCannon count={100} origin={{x: -10, y: 0}} fallSpeed={2000} />}
    </SafeAreaView>
  );
}
