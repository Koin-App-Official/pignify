import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore, COUNTRIES, CURRENCIES, Goal } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { requestEmailOtp, verifyEmailOtp } from '@/lib/auth';
import { ArrowRight, ArrowLeft, ChevronDown, AlertTriangle } from 'lucide-react-native';
import { formatCurrency } from '@/lib/store';
import ConfettiCannon from 'react-native-confetti-cannon';
import { PickerModal, PickerItem } from '@/components/ui/picker-modal';
import { PLACEHOLDER_COLOR } from '@/lib/utils';
import { ContributionStep, PlanningMode } from '@/components/ContributionStep';
import { monthDiff } from '@/lib/goalMath';

const GOAL_CHIPS = [
  { label: 'Vacation', emoji: '🏝️' },
  { label: 'New Car', emoji: '🚗' },
  { label: 'House Deposit', emoji: '🏠' },
  { label: 'Emergency Fund', emoji: '💰' },
  { label: 'Something Else', emoji: '✏️' },
];

/**
 * Named steps instead of raw indices — reordering (income now before the
 * contribution question) touches every conditional, progress dot, and
 * back-navigation call, so magic numbers would make that swap unreviewable.
 */
enum OnboardingStep {
  Name = 0,
  Localization = 1,
  GoalDeclaration = 2,
  TargetAmount = 3,
  Income = 4,
  Contribution = 5,
  BlueprintReview = 6,
  AccountFinalization = 7,
  Success = 8,
}

const TOTAL_STEPS = 6;

function formatTargetDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getCurrencySymbol(currencyCode: string): string {
  return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? currencyCode;
}

function detectLocaleCountry(): { country: string; currency: string } {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-')[1]?.toUpperCase();
    if (region) {
      const match = COUNTRIES.find((c) => c.code === region);
      if (match) return { country: match.code, currency: match.currency };
    }
  } catch {}
  return { country: 'US', currency: 'USD' };
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.Name);

  const [firstName, setFirstName] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [firstNameTouched, setFirstNameTouched] = useState(false);

  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');

  const [goalName, setGoalName] = useState('');
  const [goalNameError, setGoalNameError] = useState('');

  const [targetAmount, setTargetAmount] = useState('');
  const [targetAmountError, setTargetAmountError] = useState('');

  // Contribution-first fields. `targetDate` ends up holding the derived date
  // (contribution mode) or the picked date (deadline mode) either way.
  const [planningMode, setPlanningMode] = useState<PlanningMode>('contribution');
  const [contributionInput, setContributionInput] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState(0);

  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [incomeSkipped, setIncomeSkipped] = useState(false);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  // Email OTP (primary account auth). The emailed code here is NOT the device PIN.
  const [otpSent, setOtpSent] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [code, setCode] = useState('');
  // Session captured at verification, handed to the lock state machine on finish.
  const [pendingSession, setPendingSession] = useState<{ userId: string; secret: string } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');

  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);

  const addGoal = useStore((s) => s.addGoal);
  const updateProfile = useStore((s) => s.updateProfile);
  const unlockAchievement = useStore((s) => s.unlockAchievement);
  const onLoggedIn = useAuthLock((s) => s.onLoggedIn);

  useEffect(() => {
    const detected = detectLocaleCountry();
    setCountry(detected.country);
    setCurrency(detected.currency);
  }, []);

  const currencySymbol = getCurrencySymbol(currency);
  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country;
  const currencyName = CURRENCIES.find((c) => c.code === currency)?.name ?? currency;

  const handleCountrySelect = (item: PickerItem) => {
    setCountry(item.code);
    const matched = COUNTRIES.find((c) => c.code === item.code);
    if (matched) setCurrency(matched.currency);
  };

  const handleSkipIncome = () => {
    setIncomeSkipped(true);
    setMonthlyIncome('');
    setStep(OnboardingStep.Contribution);
  };

  const totalMonths = targetDate ? monthDiff(new Date(), new Date(targetDate)) : 1;
  const incomeNumber = Number(monthlyIncome);
  const savingsExceedsIncome = !incomeSkipped && incomeNumber > 0 && monthlyContribution > incomeNumber;

  const isEmailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // Step 1: validate email and send the Appwrite Email OTP (creates the account).
  const handleRequestCode = async () => {
    if (!isEmailValid(email)) {
      setEmailTouched(true);
      setEmailError('Please enter a valid email address 📧');
      return;
    }
    setIsLoading(true);
    setNetworkError('');
    try {
      const { userId } = await requestEmailOtp(email.trim());
      setOtpUserId(userId);
      setOtpSent(true);
    } catch {
      setNetworkError(
        "Oops! We couldn't send your code. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: verify the OTP (establishes the session), then provision the profile
  // via the n8n webhook keyed off the canonical Appwrite account id.
  const handleVerifyAndCreate = async () => {
    if (code.length !== 6) {
      setNetworkError('Enter the 6-digit code from your email.');
      return;
    }
    setIsLoading(true);
    setNetworkError('');

    try {
      const { userId, secret } = await verifyEmailOtp(otpUserId, code.trim());

      const payload = {
        userID: userId, // canonical id = Appwrite account $id
        email,
        firstName,
        country,
        currency,
        goalName,
        goal_name: goalName,
        targetAmount: Number(targetAmount),
        targetDate: new Date(targetDate).toISOString(),
        monthlyIncome: incomeSkipped ? null : incomeNumber,
        incomeSkipped,
        planningMode,
        monthlyContribution,
        // Deprecated alias, kept for workflows that haven't migrated yet.
        estimatedMonthlySavings: monthlyContribution,
      };

      const res = await fetch(
        'https://n8n.piggnify.com/webhook/claude-onboarding',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const goal: Goal = {
        id: Math.random().toString(36).substring(7),
        template: '',
        icon: '🎯',
        name: goalName,
        targetAmount: Number(targetAmount),
        savedAmount: 0,
        deadline: targetDate,
        createdAt: new Date().toISOString(),
        deposits: [],
        isPrimary: true,
        planningMode,
        monthlyContribution,
      };
      addGoal(goal);
      updateProfile({
        userID: userId,
        name: firstName,
        email,
        country,
        currency,
        monthlyIncome: incomeSkipped ? null : incomeNumber,
        incomeSkipped,
        planningMode,
        monthlyContribution,
        estimatedMonthlySavings: monthlyContribution,
        onboardingCompleted: true,
      });
      unlockAchievement('a1');
      // Hold the session; hand it to the lock machine after the success screen so
      // the user is routed into PIN setup.
      setPendingSession({ userId, secret });
      setStep(OnboardingStep.Success);
    } catch {
      setNetworkError(
        'That code is incorrect or expired, or the network failed. Request a new code and try again.'
      );
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => setStep((s) => (s - 1) as OnboardingStep);

  const showProgress = step < OnboardingStep.BlueprintReview;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {showProgress && (
          <View className="px-5 pt-6 pb-2">
            <Text className="mb-2 text-xs font-semibold text-on-surface-variant text-center">
              Step {step + 1} of {TOTAL_STEPS}
            </Text>
            <View className="flex-row gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View
                  key={i}
                  className={`h-2.5 flex-1 rounded-full ${
                    i <= step ? 'bg-primary' : 'bg-surface-container'
                  }`}
                />
              ))}
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">
          {/* Screen 0: Name */}
          {step === OnboardingStep.Name && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="text-6xl text-center mb-4">🐷</Text>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Welcome to Piggy!{'\n'}What should we call you?
              </Text>
              <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                Let's make this personal.
              </Text>

              <Input
                value={firstName}
                onChangeText={(v) => {
                  setFirstName(v);
                  if (firstNameTouched && v.trim().length >= 1) setFirstNameError('');
                  if (firstNameTouched && v.trim().length === 0)
                    setFirstNameError("Hey, we'd love to know your name! 😊");
                }}
                placeholder="Your first name"
                maxLength={50}
                autoCapitalize="words"
              />
              {firstNameError ? (
                <Text className="mt-2 text-xs text-destructive">{firstNameError}</Text>
              ) : null}

              <Button
                onPress={() => {
                  setFirstNameTouched(true);
                  if (firstName.trim().length < 1) {
                    setFirstNameError("Hey, we'd love to know your name! 😊");
                    return;
                  }
                  setStep(OnboardingStep.Localization);
                }}
                className="mt-8 w-full flex-row items-center justify-center gap-2 h-14"
              >
                <Text className="text-base font-bold text-primary-foreground">Next</Text>
                <ArrowRight size={18} color="#ffffff" />
              </Button>
            </MotiView>
          )}

          {/* Screen 1: Localization */}
          {step === OnboardingStep.Localization && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Where are you based,{'\n'}{firstName}?
              </Text>
              <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                We'll use this to format currency and set helpful defaults.
              </Text>

              <View className="gap-4">
                <View>
                  <Text className="mb-2 text-xs font-semibold text-on-surface-variant">Country</Text>
                  <TouchableOpacity
                    onPress={() => setCountryPickerVisible(true)}
                    className="h-14 flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-4 active:bg-surface-container"
                  >
                    <Text className="text-base font-medium text-on-surface">{countryName || 'Select country'}</Text>
                    <ChevronDown size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View>
                  <Text className="mb-2 text-xs font-semibold text-on-surface-variant">Currency</Text>
                  <TouchableOpacity
                    onPress={() => setCurrencyPickerVisible(true)}
                    className="h-14 flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-4 active:bg-surface-container"
                  >
                    <Text className="text-base font-medium text-on-surface">
                      {currency ? `${currencySymbol} — ${currencyName}` : 'Select currency'}
                    </Text>
                    <ChevronDown size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mt-8 flex-row gap-3">
                <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => setStep(OnboardingStep.GoalDeclaration)}
                  className="flex-1 items-center justify-center flex-row gap-2"
                >
                  <Text className="text-sm font-bold text-primary-foreground">Looks right, let's go!</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {/* Screen 2: Goal Declaration */}
          {step === OnboardingStep.GoalDeclaration && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                What are we saving for?
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                Pick a goal or type your own below.
              </Text>

              <View className="flex-row flex-wrap gap-2 mb-5">
                {GOAL_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip.label}
                    onPress={() => {
                      setGoalName(chip.label);
                      setGoalNameError('');
                    }}
                    className={`flex-row items-center gap-1.5 rounded-full px-4 py-2.5 border ${
                      goalName === chip.label
                        ? 'bg-primary-container border-2 border-primary'
                        : 'bg-surface-container-low border-outline'
                    }`}
                  >
                    <Text className="text-lg">{chip.emoji}</Text>
                    <Text
                      className={`text-sm font-semibold ${
                        goalName === chip.label ? 'text-on-primary-container' : 'text-on-surface'
                      }`}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                value={goalName}
                onChangeText={(v) => {
                  setGoalName(v);
                  if (v.trim().length >= 1) setGoalNameError('');
                }}
                placeholder="I want to..."
                autoFocus={false}
              />
              {goalNameError ? (
                <Text className="mt-2 text-xs text-destructive">{goalNameError}</Text>
              ) : null}

              <View className="mt-8 flex-row gap-3">
                <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => {
                    if (goalName.trim().length < 1) {
                      setGoalNameError("Tell us what you're saving for! 🎯");
                      return;
                    }
                    setStep(OnboardingStep.TargetAmount);
                  }}
                  className="flex-1 items-center justify-center flex-row gap-2"
                >
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {/* Screen 3: Target Amount */}
          {step === OnboardingStep.TargetAmount && (
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
                  onChangeText={(v) => {
                    setTargetAmount(v.replace(/[^0-9.]/g, ''));
                    if (targetAmountError) setTargetAmountError('');
                  }}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
              </View>
              {targetAmountError ? (
                <Text className="mt-2 text-xs text-destructive">{targetAmountError}</Text>
              ) : null}

              <View className="mt-8 flex-row gap-3">
                <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => {
                    if (!(Number(targetAmount) > 0)) {
                      setTargetAmountError('Please enter an amount greater than 0 💸');
                      return;
                    }
                    setStep(OnboardingStep.Income);
                  }}
                  className="flex-1 items-center justify-center flex-row gap-2"
                >
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {/* Screen 4: Income (moved before the contribution question, so the
              suggestion chips have an anchor to prefill from) */}
          {step === OnboardingStep.Income && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                To build your roadmap,{'\n'}what is your average{'\n'}monthly income?
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                We use this only to calculate how much you need to set aside. Your data is encrypted and completely private.
              </Text>

              <View className="flex-row items-center rounded-2xl bg-surface-container-low border border-outline-variant px-4 h-14">
                <Text className="text-xl font-bold text-on-surface-variant mr-2">{currencySymbol}</Text>
                <TextInput
                  className="flex-1 text-xl font-bold text-on-surface"
                  value={monthlyIncome}
                  onChangeText={(v) => setMonthlyIncome(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
              </View>

              <View className="mt-8 flex-row gap-3">
                <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => {
                    setIncomeSkipped(false);
                    setStep(OnboardingStep.Contribution);
                  }}
                  disabled={!(Number(monthlyIncome) > 0)}
                  className="flex-1 items-center justify-center flex-row gap-2"
                >
                  <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>

              <TouchableOpacity onPress={handleSkipIncome} className="mt-4 items-center py-2">
                <Text className="text-sm font-medium text-primary underline">
                  I'd rather not say right now
                </Text>
              </TouchableOpacity>
            </MotiView>
          )}

          {/* Screen 5: Contribution (replaces the old timeline/date-chip screen) */}
          {step === OnboardingStep.Contribution && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <ContributionStep
                currency={currency}
                targetAmount={Number(targetAmount)}
                monthlyIncome={incomeSkipped ? null : incomeNumber}
                incomeSkipped={incomeSkipped}
                planningMode={planningMode}
                onPlanningModeChange={setPlanningMode}
                contribution={contributionInput}
                onContributionChange={setContributionInput}
                deadline={targetDate}
                onDeadlineChange={setTargetDate}
                onBack={goBack}
                onContinue={(result) => {
                  setMonthlyContribution(result.monthlyContribution);
                  setTargetDate(result.targetDate);
                  setPlanningMode(result.planningMode);
                  setStep(OnboardingStep.BlueprintReview);
                }}
              />
            </MotiView>
          )}

          {/* Screen 6: Blueprint Review */}
          {step === OnboardingStep.BlueprintReview && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Let's make this official!
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                Here's your personal savings blueprint.
              </Text>

              <View className="rounded-3xl bg-surface p-6 gap-4 mb-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 }}>
                <Row label="Name" value={firstName} />
                <Row label="Goal" value={goalName} />
                <Row label="Target" value={formatCurrency(Number(targetAmount), currency)} />
                <Row
                  label="Monthly Income"
                  value={incomeSkipped ? 'Not provided' : formatCurrency(Number(monthlyIncome), currency)}
                />

                <View className="h-px bg-outline-variant" />

                <Row
                  label="Monthly set-aside"
                  value={formatCurrency(monthlyContribution, currency)}
                  highlight
                />
                <Row label="Goal reached" value={formatTargetDate(targetDate)} />
              </View>

              {savingsExceedsIncome && (
                <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mb-4">
                  <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-sm text-warning">
                    This plan sets aside more than your income each month. We can adjust it anytime!
                  </Text>
                </View>
              )}

              {incomeSkipped && (
                <View className="rounded-2xl bg-surface-container p-4 mb-4">
                  <Text className="text-xs text-on-surface-variant">
                    Providing your income on the dashboard will unlock deep affordability insights tailored to your situation.
                  </Text>
                </View>
              )}

              <Text className="mb-6 text-sm font-medium text-on-surface-variant text-center">
                You're only {totalMonths} months away from your dream. Let's make it happen.
              </Text>

              <View className="flex-row gap-3">
                <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={() => setStep(OnboardingStep.AccountFinalization)}
                  className="flex-1 items-center justify-center flex-row gap-2 h-14"
                >
                  <Text className="text-base font-bold text-primary-foreground">Create My Piggy Account</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </Button>
              </View>
            </MotiView>
          )}

          {/* Screen 7: Account Finalization */}
          {step === OnboardingStep.AccountFinalization && (
            <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
              <Text className="text-6xl text-center mb-4">🐷</Text>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Your Piggy Plan is ready!
              </Text>
              <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                {otpSent
                  ? `Enter the 6-digit code we emailed to ${email} to finish setting up your account.`
                  : `Enter your email — we'll send a sign-in code to lock in your plan for your ${goalName} by ${formatTargetDate(targetDate)}.`}
              </Text>

              <Input
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!otpSent}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailTouched && isEmailValid(v)) setEmailError('');
                  if (emailTouched && !isEmailValid(v))
                    setEmailError('Please enter a valid email address 📧');
                }}
                onBlur={() => {
                  if (email && !isEmailValid(email)) {
                    setEmailTouched(true);
                    setEmailError('Please enter a valid email address 📧');
                  }
                }}
                placeholder="you@example.com"
                className={otpSent ? 'opacity-60' : ''}
              />
              {emailError ? (
                <Text className="mt-2 text-xs text-destructive">{emailError}</Text>
              ) : null}

              {otpSent && (
                <View className="mt-4">
                  <Text className="mb-2 text-xs font-semibold text-on-surface-variant">
                    Sign-in code (this is not your app PIN)
                  </Text>
                  <TextInput
                    value={code}
                    onChangeText={(v) => {
                      setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                      if (networkError) setNetworkError('');
                    }}
                    keyboardType="number-pad"
                    placeholder="••••••"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                    className="h-16 rounded-2xl border border-outline bg-surface-container-low text-center text-3xl font-bold tracking-[12px] text-on-surface"
                    maxLength={6}
                    autoFocus
                  />
                  <TouchableOpacity onPress={handleRequestCode} disabled={isLoading} className="mt-3 items-center py-1">
                    <Text className="text-sm font-semibold text-primary underline">Resend code</Text>
                  </TouchableOpacity>
                </View>
              )}

              {networkError ? (
                <View className="mt-4 rounded-2xl bg-destructive/10 p-4">
                  <Text className="text-sm text-destructive">{networkError}</Text>
                </View>
              ) : null}

              <View className="mt-8 flex-row gap-3">
                <Button
                  variant="outline"
                  onPress={otpSent ? () => { setOtpSent(false); setCode(''); setNetworkError(''); } : goBack}
                  className="w-14 items-center justify-center"
                >
                  <ArrowLeft size={16} color="#1D4ED8" />
                </Button>
                <Button
                  onPress={otpSent ? handleVerifyAndCreate : handleRequestCode}
                  disabled={isLoading || (otpSent ? code.length !== 6 : !isEmailValid(email))}
                  className="flex-1 items-center justify-center flex-row gap-2 h-14"
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Text className="text-base font-bold text-primary-foreground">
                        {otpSent ? 'Verify & Create Account' : 'Send Code'}
                      </Text>
                      <ArrowRight size={16} color="#ffffff" />
                    </>
                  )}
                </Button>
              </View>
            </MotiView>
          )}

          {/* Screen 8: Success */}
          {step === OnboardingStep.Success && (
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              className="flex-1 items-center justify-center min-h-[70vh]"
            >
              <Text className="text-7xl text-center mb-6">🐷</Text>
              <Text className="mb-3 text-3xl font-black text-on-surface text-center">
                You're all set, {firstName}! 🎉
              </Text>
              <Text className="mb-2 text-base font-medium text-on-surface-variant text-center px-4">
                Your Piggy Plan is live. Time to start saving for your {goalName}.
              </Text>
              <Text className="mb-10 text-sm text-on-surface-variant text-center px-6">
                {formatTargetDate(targetDate)} is closer than you think.
              </Text>

              <Button
                onPress={() => {
                  if (pendingSession) {
                    // → needs_pin_setup; AuthGate swaps to the set-PIN screen.
                    onLoggedIn(pendingSession.userId, pendingSession.secret);
                  } else {
                    router.replace('/(tabs)');
                  }
                }}
                className="w-full flex-row items-center justify-center gap-2 h-14"
              >
                <Text className="text-base font-bold text-primary-foreground">Go to my dashboard</Text>
                <ArrowRight size={18} color="#ffffff" />
              </Button>
            </MotiView>
          )}
        </ScrollView>

        {step === OnboardingStep.Success && <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} fallSpeed={2000} />}

        <PickerModal
          isVisible={countryPickerVisible}
          onClose={() => setCountryPickerVisible(false)}
          onSelect={handleCountrySelect}
          items={COUNTRIES.map((c) => ({ code: c.code, name: c.name }))}
          selectedCode={country}
          title="Select Country"
        />

        <PickerModal
          isVisible={currencyPickerVisible}
          onClose={() => setCurrencyPickerVisible(false)}
          onSelect={(item) => setCurrency(item.code)}
          items={CURRENCIES.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))}
          selectedCode={currency}
          title="Select Currency"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm font-medium text-on-surface-variant">{label}</Text>
      <Text className={`text-sm font-bold ${highlight ? 'text-primary' : 'text-on-surface'}`}>
        {value}
      </Text>
    </View>
  );
}
