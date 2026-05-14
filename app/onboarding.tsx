import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MotiView, AnimatePresence } from 'moti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore, GOAL_TEMPLATES, COUNTRIES, CURRENCIES, Goal } from '@/lib/store';
import { ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Picker } from '@react-native-picker/picker'; // Optional if not installed, I will use custom select or simple views

const QUIZ_QUESTIONS = [
  {
    question: 'When you get extra money, what do you usually do?',
    options: ['Spend it right away', 'Save some, spend some', 'Save most of it', 'Invest it'],
  },
  {
    question: 'How do you feel about budgeting?',
    options: ['I avoid it', 'I try but forget', 'I do it loosely', 'I track everything'],
  },
  {
    question: 'What motivates you to save?',
    options: ['A specific dream', 'Security & peace', 'Building wealth', 'Competing with myself'],
  },
];

const PERSONALITY_TYPES: Record<string, { title: string; emoji: string; desc: string }> = {
  dreamer: { title: 'The Dreamer', emoji: '✨', desc: 'You save best when you have a vivid goal to chase. Dream big!' },
  builder: { title: 'The Builder', emoji: '🏗️', desc: 'You like structure and steady progress. One brick at a time!' },
  challenger: { title: 'The Challenger', emoji: '⚡', desc: 'You thrive on competition and beating your own records!' },
  guardian: { title: 'The Guardian', emoji: '🛡️', desc: 'Security drives you. You value stability and peace of mind.' },
};

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [income, setIncome] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('US');
  const [currency, setCurrency] = useState('USD');
  const [emailError, setEmailError] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState(0);
  const [personalityResult, setPersonalityResult] = useState('');
  const [confetti, setConfetti] = useState(false);

  const addGoal = useStore((state) => state.addGoal);
  const updateProfile = useStore((state) => state.updateProfile);
  const unlockAchievement = useStore((state) => state.unlockAchievement);

  const template = GOAL_TEMPLATES.find((t) => t.id === selectedTemplate);

  const handleTemplateSelect = (id: string) => {
    const t = GOAL_TEMPLATES.find((t) => t.id === id)!;
    setSelectedTemplate(id);
    setGoalName(t.name);
    setTargetAmount(String(t.suggestedAmount));
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    setDeadline(d.toISOString().split('T')[0]);
  };

  const handleQuizAnswer = (idx: number) => {
    const newAnswers = [...quizAnswers, idx];
    setQuizAnswers(newAnswers);
    if (currentQuiz < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuiz(currentQuiz + 1);
    } else {
      const avg = newAnswers.reduce((a, b) => a + b, 0) / newAnswers.length;
      const type = avg < 1 ? 'dreamer' : avg < 2 ? 'builder' : avg < 3 ? 'challenger' : 'guardian';
      setPersonalityResult(type);
      updateProfile({ personalityType: type });
      unlockAchievement('a12');
    }
  };

  const finishOnboarding = async () => {
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
      isPrimary: true,
    };
    addGoal(goal);
    updateProfile({
      name: userName,
      email,
      country,
      currency,
      monthlyIncome: Number(income),
      onboardingCompleted: true,
    });
    unlockAchievement('a1');

    setConfetti(true);
    setTimeout(() => {
      router.replace('/(tabs)');
    }, 1500);
  };

  const projectedMonths = targetAmount && income
    ? Math.ceil(Number(targetAmount) / (Number(income) * 0.2))
    : null;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row justify-center gap-2 pt-6 pb-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === step ? 'w-6 bg-primary' : i < step ? 'w-2 bg-primary/40' : 'w-2 bg-surface-container'
                }`}
            />
          ))}
        </View>

        <ScrollView className="flex-1 px-5 py-6">
          {step === 0 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              className="flex-1 items-center justify-center min-h-[70vh]"
            >
              <Text className="mb-6 text-6xl">💰</Text>
              <Text className="mb-3 text-4xl font-bold text-on-surface">Welcome to Piggnify</Text>
              <Text className="mb-2 text-base font-medium text-on-surface-variant text-center">
                Your journey to financial freedom starts with one goal.
              </Text>
              <Text className="mb-8 text-sm font-medium text-on-surface-variant text-center">
                Let's set up your first savings goal in 60 seconds.
              </Text>
              <Button
                onPress={() => setStep(1)}
                className="w-full flex-row items-center justify-center gap-2 h-14"
              >
                <Text className="text-base font-bold text-primary-foreground">Start your first goal</Text>
                <ArrowRight size={18} color="#ffffff" />
              </Button>
            </MotiView>
          )}

          {step === 1 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text className="mb-2 text-2xl font-bold text-on-surface">What are you saving for?</Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">Pick a goal that excites you</Text>

              <View className="flex-row flex-wrap justify-between">
                {GOAL_TEMPLATES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => handleTemplateSelect(t.id)}
                    className={`mb-3 w-[48%] flex-col items-center gap-2 rounded-2xl p-4 ${selectedTemplate === t.id
                        ? 'bg-primary-container border-2 border-primary'
                        : 'bg-surface-container-low'
                      }`}
                  >
                    <Text className="text-3xl">{t.icon}</Text>
                    <Text className={`text-sm font-bold ${selectedTemplate === t.id ? 'text-on-primary-container' : 'text-on-surface'
                      }`}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mt-6 flex-row gap-3">
                <Button variant="outline" onPress={() => setStep(0)} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button onPress={() => setStep(2)} disabled={!selectedTemplate} className="flex-1 items-center justify-center flex-row gap-2">
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {step === 2 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text className="mb-4 text-center text-4xl">{template?.icon}</Text>
              <Text className="mb-2 text-2xl font-bold text-on-surface text-center">Set your {goalName} goal</Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant text-center">How much do you need?</Text>

              <View className="gap-5">
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Goal name</Text>
                  <Input value={goalName} onChangeText={setGoalName} />
                </View>
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Target amount ($)</Text>
                  <Input keyboardType="numeric" value={targetAmount} onChangeText={setTargetAmount} className="text-xl font-bold" placeholder="0" />
                </View>
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Target date (YYYY-MM-DD)</Text>
                  <Input value={deadline} onChangeText={setDeadline} />
                </View>
              </View>

              <View className="mt-6 flex-row gap-3">
                <Button variant="outline" onPress={() => setStep(1)} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button onPress={() => setStep(3)} disabled={!targetAmount || !deadline} className="flex-1 items-center justify-center flex-row gap-2">
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {step === 3 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text className="mb-2 text-2xl font-bold text-on-surface">A little about you</Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">This helps us personalize your experience</Text>

              <View className="gap-5">
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Your name</Text>
                  <Input value={userName} onChangeText={setUserName} placeholder="e.g. Alex" />
                </View>
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Monthly income ($)</Text>
                  <Input keyboardType="numeric" value={income} onChangeText={setIncome} placeholder="e.g. 3000" className="text-xl font-bold" />
                </View>
              </View>

              {projectedMonths && Number(income) > 0 ? (
                <View className="mt-6 rounded-2xl bg-tertiary-container p-4 items-center">
                  <Text className="text-sm font-medium text-on-tertiary-container">Saving 20% monthly, you'll reach your goal in</Text>
                  <Text className="mt-1 text-3xl font-bold text-on-tertiary-container">{projectedMonths} months</Text>
                  <Text className="mt-1 text-xs text-on-tertiary-container/70">(${Math.round(Number(income) * 0.2)}/month toward your goal)</Text>
                </View>
              ) : null}

              <View className="mt-6 flex-row gap-3">
                <Button variant="outline" onPress={() => setStep(2)} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button onPress={() => setStep(4)} disabled={!income || !userName.trim()} className="flex-1 items-center justify-center flex-row gap-2">
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {step === 4 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text className="mb-2 text-2xl font-bold text-on-surface">Where are you based?</Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">We'll use this to set your currency and reminders</Text>

              <View className="gap-5">
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Email</Text>
                  <Input
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (emailError) setEmailError('');
                    }}
                    onBlur={() => {
                      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        setEmailError('Please enter a valid email');
                      }
                    }}
                    placeholder="you@example.com"
                  />
                  {emailError ? <Text className="mt-1.5 text-xs text-[#ef4444]">{emailError}</Text> : null}
                </View>

                {/* Due to lacking @react-native-picker/picker, just a simple text input/button combo can work, but we'll use TextInput for simplicity since this is a demo. */}
                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Country (Code)</Text>
                  <Input value={country} onChangeText={setCountry} placeholder="US" autoCapitalize="characters" />
                </View>

                <View>
                  <Text className="mb-2 text-xs font-medium text-on-surface-variant">Currency</Text>
                  <Input value={currency} onChangeText={setCurrency} placeholder="USD" autoCapitalize="characters" />
                </View>
              </View>

              <View className="mt-8 flex-row gap-3">
                <Button variant="outline" onPress={() => setStep(3)} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => setStep(5)}
                  disabled={!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !country || !currency}
                  className="flex-1 items-center justify-center flex-row gap-2"
                >
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {step === 5 && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              {!personalityResult ? (
                <View>
                  <View className="mb-2 flex-row items-center gap-2">
                    <Sparkles size={20} color="#10B981" />
                    <Text className="text-2xl font-bold text-on-surface">Quick money quiz</Text>
                  </View>
                  <Text className="mb-3 text-sm font-medium text-on-surface-variant">Question {currentQuiz + 1} of {QUIZ_QUESTIONS.length}</Text>

                  <View className="mb-6 flex-row gap-1">
                    {QUIZ_QUESTIONS.map((_, i) => (
                      <View key={i} className={`h-1.5 flex-1 rounded-full ${i <= currentQuiz ? 'bg-primary' : 'bg-surface-container'}`} />
                    ))}
                  </View>

                  <Text className="mb-6 text-xl font-bold text-on-surface">{QUIZ_QUESTIONS[currentQuiz].question}</Text>

                  <View className="gap-3">
                    {QUIZ_QUESTIONS[currentQuiz].options.map((opt, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => handleQuizAnswer(i)}
                        className="w-full rounded-2xl bg-surface-container-low p-4"
                      >
                        <Text className="text-base font-bold text-on-surface">{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View className="items-center pt-8">
                  <Text className="mb-4 text-6xl">{PERSONALITY_TYPES[personalityResult].emoji}</Text>
                  <Text className="mb-2 text-2xl font-bold text-on-surface">{PERSONALITY_TYPES[personalityResult].title}</Text>
                  <Text className="mb-8 text-base font-medium text-on-surface-variant text-center">
                    {PERSONALITY_TYPES[personalityResult].desc}
                  </Text>

                  <View className="w-full rounded-2xl bg-tertiary-container p-4 mb-8">
                    <View className="flex-row items-center justify-center gap-2">
                      <Check size={18} color="#10B981" />
                      <Text className="text-sm font-bold text-on-tertiary-container">Achievement unlocked: Smart Saver 🧠</Text>
                    </View>
                  </View>

                  <Button onPress={finishOnboarding} className="w-full flex-row items-center justify-center gap-2 h-14">
                    <Text className="text-base font-bold text-primary-foreground">Let's go!</Text>
                    <ArrowRight size={18} color="#ffffff" />
                  </Button>
                </View>
              )}
            </MotiView>
          )}
        </ScrollView>
        {confetti && <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} fallSpeed={2000} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
