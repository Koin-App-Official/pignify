import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { springPresets } from '@/lib/springPresets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore, COUNTRIES, CURRENCIES, Goal } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { requestEmailOtp, verifyEmailOtp, SessionSecretUnavailableError } from '@/lib/auth';
import { ArrowRight, ArrowLeft, ChevronDown, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { formatCurrency } from '@/lib/store';
import { PickerModal, PickerItem } from '@/components/ui/picker-modal';
import { DobWheelPicker } from '@/components/ui/dob-picker';
import { DobConfirmModal } from '@/components/ui/dob-confirm-modal';
import { PressableScale } from '@/components/animation/PressableScale';
import { AnimatedProgressBar } from '@/components/animation/AnimatedProgressBar';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';
import { ContributionStep, PlanningMode } from '@/components/ContributionStep';
import { deriveGoalDate, monthDiff, requiredContribution } from '@/lib/goalMath';
import { loadDraft, saveDraft, clearDraft } from '@/lib/onboardingDraft';
import { fetchEntitlementsSync } from '@/lib/entitlementsSync';
import { requestNotificationPermission } from '@/lib/notifications';
import { Mascot } from '@/components/Mascot';
import { formatMonthYear } from '@/lib/i18n/format';
import type { SupportedLanguage } from '@/lib/i18n/detect';

const GOAL_CHIPS = [
  { label: 'Vacation', emoji: '🏝️' },
  { label: 'New Car', emoji: '🚗' },
  { label: 'House Deposit', emoji: '🏠' },
  { label: 'Emergency Fund', emoji: '💰' },
  { label: 'Something Else', emoji: '✏️' },
];

const LEGAL_LINK_STYLE = 'text-primary underline';

const LEGAL_LINKS = [
  { label: 'Privacy Policy', url: 'https://piggnify.com/privacy-policy' },
  { label: 'Terms of Service', url: 'https://piggnify.com/terms-of-service' },
  { label: 'AI Transparency', url: 'https://piggnify.com/ai-transparency' },
  { label: 'Services', url: 'https://piggnify.com/services' },
  { label: 'AI & Feature Access', url: 'https://piggnify.com/ai-feature-access' },
];

/**
 * Reassurance first, obligations second — at the email step specifically.
 *
 * All five legal documents used to be rendered as underlined links stacked
 * directly under the email input, i.e. a wall of commitments at the single
 * highest-anxiety moment in the flow. Nothing is removed here: the same five
 * links live one tap away, and the acceptance notice is still shown in full.
 * What changes is what the user reads first.
 *
 * The headline claim is worth stating plainly because, unlike every
 * Plaid-based competitor writing the same reassurance as a promise, for Piggy
 * it is structural — there is no bank connection to abuse.
 */
function LegalLinksNote() {
  const [expanded, setExpanded] = useState(false);
  const open = (url: string) => Linking.openURL(url);

  return (
    <View className="mt-6">
      <View className="rounded-2xl bg-surface-container p-4">
        <View className="flex-row items-start gap-2">
          <ShieldCheck size={16} color="#1D4ED8" style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-on-surface">
              We're asking for your email. Not your bank.
            </Text>
            <Text className="mt-1 text-xs leading-5 text-on-surface-variant">
              Piggy never connects to your accounts — there's nothing to link, and nothing for
              anyone to steal. Your plan is encrypted and private.
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="mt-3 flex-row items-center justify-center gap-1 py-2"
      >
        <Text className="text-xs font-semibold text-on-surface-variant">
          By creating an account you accept our terms
        </Text>
        <ChevronDown
          size={14}
          color="#64748B"
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {expanded && (
        <Animated.View entering={FadeInDown.springify()} className="items-center gap-2 pb-2">
          {LEGAL_LINKS.map((link) => (
            <Text
              key={link.url}
              className={`text-xs ${LEGAL_LINK_STYLE}`}
              onPress={() => open(link.url)}
            >
              {link.label}
            </Text>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Named steps instead of raw indices — reordering (income before the
 * contribution question; the age gate hoisted out of account finalization)
 * touches every conditional, progress dot, and back-navigation call, so magic
 * numbers would make those swaps unreviewable.
 *
 * The age gate sits at position 1 deliberately. It used to live inside
 * AccountFinalization, which meant an under-18 user built an entire savings
 * plan across seven screens before being permanently refused. Asking second —
 * right after the name — costs a rejected user almost nothing.
 *
 * PushPermission sits between the blueprint and the email step for the same
 * kind of reason: it lands right after the payoff (the plan the user just
 * built is still on screen) and right before the highest-friction screen, and
 * it's the only channel that can reach someone who abandons before giving us
 * an email.
 */
enum OnboardingStep {
  Name = 0,
  AgeGate = 1,
  Localization = 2,
  GoalDeclaration = 3,
  TargetAmount = 4,
  Income = 5,
  Contribution = 6,
  BlueprintReview = 7,
  PushPermission = 8,
  AccountFinalization = 9,
}

/**
 * Every step, all of which show the progress bar. Derived rather than
 * hardcoded: the previous literal 6 drifted out of sync with the real screen
 * count and told users "Step 6 of 6" with three screens to go.
 *
 * Onboarding has no success screen of its own any more — it hands straight off
 * to the plan gate and PIN setup, and the celebration fires on the dashboard
 * once all of that is genuinely finished (profile.justOnboarded).
 */
const TOTAL_STEPS = OnboardingStep.AccountFinalization + 1;

const ONBOARDING_WEBHOOK_TIMEOUT_MS = 15_000;

function formatTargetDate(isoDate: string, language: SupportedLanguage): string {
  return formatMonthYear(isoDate, language);
}

function getCurrencySymbol(currencyCode: string): string {
  return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? currencyCode;
}

function computeAge(isoDate: string): number {
  const dob = new Date(isoDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age--;
  return age;
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
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.Name);
  const emailInputRef = useRef<TextInput>(null);

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

  // Age gate (18+, legal requirement), its own step right after the name.
  // Once confirmed underage this is a terminal state: no path back to re-enter
  // a different DOB, and it's persisted in the draft so relaunching the app
  // doesn't reset it. Seeded with a plausible default (not left blank) since
  // the wheel picker is inline and always shows a selected date.
  // Confirmation isn't tracked separately — being past AgeGate *is* the proof.
  const [dateOfBirth, setDateOfBirth] = useState(() => `${new Date().getFullYear() - 25}-01-01`);
  const [dobConfirmModalVisible, setDobConfirmModalVisible] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  // Email OTP (primary account auth). The emailed code here is NOT the device PIN.
  const [otpSent, setOtpSent] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [code, setCode] = useState('');
  /**
   * Set once the OTP has been accepted but provisioning hasn't finished. An OTP
   * is single-use, so after this point re-verifying the same code is guaranteed
   * to fail — the only correct recovery is retrying the (idempotent) webhook
   * with the session we already hold.
   */
  const [verifiedSession, setVerifiedSession] = useState<{ userId: string; secret: string } | null>(
    null
  );

  // Draft restore. Nothing is persisted until the draft has been read back,
  // otherwise the first render's empty defaults would overwrite it.
  const [hydrated, setHydrated] = useState(false);
  const [resumed, setResumed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');

  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);

  const addGoal = useStore((s) => s.addGoal);
  const updateProfile = useStore((s) => s.updateProfile);
  const unlockAchievement = useStore((s) => s.unlockAchievement);
  const refreshNotifications = useStore((s) => s.refreshNotifications);
  const language = useStore((s) => s.profile.language);
  const onLoggedIn = useAuthLock((s) => s.onLoggedIn);
  const requestLogin = useAuthLock((s) => s.requestLogin);

  // Restore a previous session's answers, falling back to locale detection for a
  // fresh start. Both live in one effect so the detected country/currency can't
  // race ahead and clobber what the user already picked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft();
      if (cancelled) return;

      if (draft) {
        setFirstName(draft.firstName);
        setCountry(draft.country);
        setCurrency(draft.currency);
        setGoalName(draft.goalName);
        setTargetAmount(draft.targetAmount);
        setPlanningMode(draft.planningMode);
        setContributionInput(draft.contributionInput);
        setTargetDate(draft.targetDate);
        setMonthlyContribution(draft.monthlyContribution);
        setMonthlyIncome(draft.monthlyIncome);
        setIncomeSkipped(draft.incomeSkipped);
        setDateOfBirth(draft.dateOfBirth);
        setAgeBlocked(draft.ageBlocked);
        setEmail(draft.email);
        // Success is never restored: the session secret behind it is memory-only
        // and deliberately never persisted, so there's nothing to hand to the
        // lock machine. Such a user re-enters email/OTP — Appwrite resolves the
        // same account and the provisioning webhook is idempotent.
        const restoredStep = Math.min(draft.step, OnboardingStep.AccountFinalization);
        setStep(restoredStep);
        // No cheery "welcome back" for someone the age gate already refused.
        setResumed(restoredStep > OnboardingStep.Name && !draft.ageBlocked);
      } else {
        const detected = detectLocaleCountry();
        setCountry(detected.country);
        setCurrency(detected.currency);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after every change (debounced inside saveDraft).
  useEffect(() => {
    if (!hydrated) return;
    saveDraft({
      step,
      firstName,
      country,
      currency,
      goalName,
      targetAmount,
      planningMode,
      contributionInput,
      targetDate,
      monthlyContribution,
      monthlyIncome,
      incomeSkipped,
      dateOfBirth,
      ageBlocked,
      email,
    });
  }, [
    hydrated,
    step,
    firstName,
    country,
    currency,
    goalName,
    targetAmount,
    planningMode,
    contributionInput,
    targetDate,
    monthlyContribution,
    monthlyIncome,
    incomeSkipped,
    dateOfBirth,
    ageBlocked,
    email,
  ]);

  // The resume banner is a one-time acknowledgement, not a persistent state.
  useEffect(() => {
    if (!resumed) return;
    const t = setTimeout(() => setResumed(false), 6000);
    return () => clearTimeout(t);
  }, [resumed]);

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

  // Mirrors ContributionStep's own canContinue/handleContinue, computed here
  // from the same state onboarding already owns (contributionInput/targetDate/
  // planningMode/targetAmount) so the fixed footer can drive it directly —
  // no need for ContributionStep to report its internal state back up.
  const contributionNumber = Number(contributionInput);
  const contributionCanContinue = planningMode === 'contribution' ? contributionNumber > 0 : !!targetDate;

  const handleContributionContinue = () => {
    if (!contributionCanContinue) return;
    if (planningMode === 'contribution') {
      const result = deriveGoalDate(Number(targetAmount), contributionNumber);
      setMonthlyContribution(Math.round(contributionNumber * 100) / 100);
      setTargetDate(result.date);
    } else {
      const monthly = requiredContribution(Number(targetAmount), new Date(targetDate));
      setMonthlyContribution(Math.round(monthly * 100) / 100);
      setTargetDate(new Date(targetDate).toISOString());
    }
    setStep(OnboardingStep.BlueprintReview);
  };

  /**
   * Notification opt-in. Always advances — a declined permission must never
   * block account creation.
   *
   * `notificationPrefs` defaults to all-on, which would leave a declining user
   * looking at four enabled toggles in Settings that can never fire anything.
   * So the outcome is written back either way: granted keeps the defaults and
   * schedules, declined (or skipped without asking) turns them off. The user
   * can still switch any of them on later from Settings, which re-runs its own
   * soft-ask before the OS prompt.
   */
  const resolvePushChoice = async (optIn: boolean) => {
    setIsLoading(true);
    try {
      const granted = optIn ? await requestNotificationPermission() : false;
      if (granted) {
        refreshNotifications();
      } else {
        updateProfile({
          notificationPrefs: {
            paydayReminder: false,
            streakProtection: false,
            milestoneAlerts: false,
            weeklyReflection: false,
          },
        });
      }
    } catch {
      // A permission API failure is not worth stranding onboarding over.
    } finally {
      setIsLoading(false);
      setStep(OnboardingStep.AccountFinalization);
    }
  };

  const handleDobEdit = () => {
    setDobConfirmModalVisible(false);
  };

  const handleDobConfirmed = () => {
    setDobConfirmModalVisible(false);
    if (computeAge(dateOfBirth) < 18) {
      setAgeBlocked(true);
    } else {
      setStep(OnboardingStep.Localization);
    }
  };

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

  // Step 2b: provision the profile via the n8n webhook, keyed off the canonical
  // Appwrite account id. Split out from OTP verification so a backend failure
  // here can be retried directly — the code has already been consumed by then,
  // so re-verifying it would always fail.
  const provisionAccount = async (userId: string, secret: string) => {
    setIsLoading(true);
    setNetworkError('');
    try {
      const payload = {
        userID: userId, // canonical id = Appwrite account $id
        email,
        firstName,
        dateOfBirth,
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

      // Onboarding is idempotent server-side (retrying with the same userID
      // repairs rather than re-creates), so a timeout here is safe to retry.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ONBOARDING_WEBHOOK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch('https://n8n.piggnify.com/webhook/claude-onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
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
        dateOfBirth,
        country,
        currency,
        monthlyIncome: incomeSkipped ? null : incomeNumber,
        incomeSkipped,
        planningMode,
        monthlyContribution,
        estimatedMonthlySavings: monthlyContribution,
        // NOT onboardingCompleted yet — AuthGate treats "onboardingCompleted +
        // status unauthenticated" as a returning user and shows LoginGate, so it
        // is flipped below in the same tick as the onLoggedIn handoff.
      });
      unlockAchievement('a1');
      // Provisioning is done; the draft has nothing left to protect.
      await clearDraft();
      setVerifiedSession(null);

      // Pull the entitlements the webhook just wrote, so the plan gate can show
      // the real trial (tier, days left) instead of a hardcoded guess. Purely
      // best-effort: fetchEntitlementsSync never throws, and if it returns
      // nothing the gate simply doesn't fire — the hourly sync corrects it later.
      const entitlements = await fetchEntitlementsSync(userId);

      // One update, so AuthGate never observes a half-applied profile.
      updateProfile({
        onboardingCompleted: true,
        justOnboarded: true,
        ...(entitlements?.plan ? { plan: entitlements.plan } : {}),
        ...(entitlements?.status ? { planStatus: entitlements.status } : {}),
        ...(entitlements?.trialEndsAt !== undefined
          ? { trialEndsAt: entitlements.trialEndsAt }
          : {}),
      });
      // → needs_plan (trial intro) then the PIN step. The celebration now waits
      // for the far side of that, so it lands on a finished account.
      onLoggedIn(userId, secret);
    } catch {
      // The code was already accepted — this is a backend/network failure
      // setting up the account, not a bad code. Keep the verified session so
      // the footer can offer a direct retry instead of a pointless resend.
      setVerifiedSession({ userId, secret });
      setNetworkError(
        "We verified your email but couldn't finish setting up your account. Your code is still good — tap Retry."
      );
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2a: verify the OTP (establishes the session), then provision.
  const handleVerifyAndCreate = async () => {
    // Already past verification and only provisioning failed — go straight back
    // to the webhook rather than burning the (now spent) code.
    if (verifiedSession) {
      await provisionAccount(verifiedSession.userId, verifiedSession.secret);
      return;
    }

    if (code.length !== 6) {
      setNetworkError('Enter the 6-digit code from your email.');
      return;
    }
    setIsLoading(true);
    setNetworkError('');

    let userId: string;
    let secret: string;
    try {
      ({ userId, secret } = await verifyEmailOtp(otpUserId, code.trim()));
    } catch (err) {
      if (err instanceof SessionSecretUnavailableError) {
        // createSession actually succeeded — only reading the token back out of
        // the cookie jar failed. Same "request a new code" remedy (the code is
        // spent either way), but don't tell the user their code was wrong when
        // it wasn't. Deliberately no setVerifiedSession: there is no usable
        // secret to retry provisioning with.
        setNetworkError(
          'Signed in, but we could not secure the session. Request a new code and try again.'
        );
      } else {
        // Bad/expired OTP — distinct from a webhook/network failure, so the user
        // isn't told their code was wrong when the account was actually fine.
        setNetworkError('That code is incorrect or expired. Request a new code and try again.');
      }
      setCode('');
      setIsLoading(false);
      return;
    }

    await provisionAccount(userId, secret);
  };

  const goBack = () => setStep((s) => (s - 1) as OnboardingStep);

  // Fixed footer for the paginated steps — pulled out of the scrolling
  // content so it docks right above the keyboard (via the KeyboardAvoidingView
  // below) instead of sitting immediately under the input. The Contribution
  // step keeps its own inline buttons (shared ContributionStep component,
  // also used by the Goals tab) and Success has no keyboard to dodge, so
  // both are left out of this footer.
  const renderFooter = () => {
    switch (step) {
      case OnboardingStep.Name:
        return (
          <Button
            onPress={() => {
              setFirstNameTouched(true);
              if (firstName.trim().length < 1) {
                setFirstNameError("Hey, we'd love to know your name! 😊");
                return;
              }
              setStep(OnboardingStep.AgeGate);
            }}
            className="w-full flex-row items-center justify-center gap-2 h-14"
          >
            <Text className="text-base font-bold text-primary-foreground">Next</Text>
            <ArrowRight size={18} color="#ffffff" />
          </Button>
        );

      case OnboardingStep.AgeGate:
        // The blocked state is terminal — renderFooter isn't reached for it
        // (see showFixedFooter), so there's deliberately no way forward or back.
        return (
          <View className="flex-row gap-3">
            <Button variant="outline" onPress={goBack} className="w-14 h-14 items-center justify-center">
              <ArrowLeft size={16} color="#1D4ED8" />
            </Button>
            <Button
              onPress={() => setDobConfirmModalVisible(true)}
              className="flex-1 items-center justify-center flex-row gap-2 h-14"
            >
              <Text className="text-base font-bold text-primary-foreground">Continue</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Button>
          </View>
        );

      case OnboardingStep.Localization:
        return (
          <View className="flex-row gap-3">
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
        );

      case OnboardingStep.GoalDeclaration:
        return (
          <View className="flex-row gap-3">
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
        );

      case OnboardingStep.TargetAmount:
        return (
          <View className="flex-row gap-3">
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
        );

      case OnboardingStep.Income:
        return (
          <View>
            <View className="flex-row gap-3">
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
          </View>
        );

      case OnboardingStep.Contribution:
        return (
          <View>
            <View className="flex-row gap-3">
              <Button variant="outline" onPress={goBack} className="w-14 items-center justify-center">
                <ArrowLeft size={16} color="#1D4ED8" />
              </Button>
              <Button
                onPress={handleContributionContinue}
                disabled={!contributionCanContinue}
                className="flex-1 items-center justify-center flex-row gap-2"
              >
                <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
                <ArrowRight size={16} color="#ffffff" />
              </Button>
            </View>
            <TouchableOpacity
              onPress={() => setPlanningMode(planningMode === 'contribution' ? 'deadline' : 'contribution')}
              className="mt-4 items-center py-2"
            >
              <Text className="text-sm font-medium text-primary underline">
                {planningMode === 'contribution'
                  ? 'I have a fixed deadline instead'
                  : 'Switch back to monthly set-aside'}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case OnboardingStep.BlueprintReview:
        return (
          <View className="flex-row gap-3">
            <Button variant="outline" onPress={goBack} className="w-14 h-14 items-center justify-center">
              <ArrowLeft size={16} color="#1D4ED8" />
            </Button>
            <Button
              onPress={() => setStep(OnboardingStep.PushPermission)}
              className="flex-1 items-center justify-center flex-row gap-2 h-14"
            >
              <Text className="text-base font-bold text-primary-foreground">Create My Piggy Account</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Button>
          </View>
        );

      case OnboardingStep.PushPermission:
        return (
          <View>
            <Button
              onPress={() => resolvePushChoice(true)}
              disabled={isLoading}
              className="w-full flex-row items-center justify-center gap-2 h-14"
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text className="text-base font-bold text-primary-foreground">
                    Keep me on track
                  </Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </Button>
            <TouchableOpacity
              onPress={() => resolvePushChoice(false)}
              disabled={isLoading}
              className="mt-4 items-center py-2"
            >
              <Text className="text-sm font-medium text-primary underline">Not now</Text>
            </TouchableOpacity>
          </View>
        );

      case OnboardingStep.AccountFinalization:
        return (
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              // Once the code is spent, "back to the email field" would strand the
              // user on a screen whose only working action is the retry.
              disabled={!!verifiedSession}
              onPress={
                otpSent
                  ? () => {
                      setOtpSent(false);
                      setCode('');
                      setNetworkError('');
                      emailInputRef.current?.focus();
                    }
                  : goBack
              }
              className="w-14 h-14 items-center justify-center"
            >
              <ArrowLeft size={16} color="#1D4ED8" />
            </Button>
            <Button
              onPress={otpSent ? handleVerifyAndCreate : handleRequestCode}
              disabled={
                isLoading ||
                (verifiedSession ? false : otpSent ? code.length !== 6 : !isEmailValid(email))
              }
              className="flex-1 items-center justify-center flex-row gap-2 h-14"
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text className="text-base font-bold text-primary-foreground">
                    {verifiedSession
                      ? 'Retry'
                      : otpSent
                        ? 'Verify & Create Account'
                        : 'Send Code'}
                  </Text>
                  <ArrowRight size={16} color="#ffffff" />
                </>
              )}
            </Button>
          </View>
        );

      default:
        return null;
    }
  };

  const showFixedFooter =
    [
      OnboardingStep.Name,
      OnboardingStep.AgeGate,
      OnboardingStep.Localization,
      OnboardingStep.GoalDeclaration,
      OnboardingStep.TargetAmount,
      OnboardingStep.Income,
      OnboardingStep.Contribution,
      OnboardingStep.BlueprintReview,
      OnboardingStep.PushPermission,
      OnboardingStep.AccountFinalization,
    ].includes(step) && !(step === OnboardingStep.AgeGate && ageBlocked);

  // Hold the first frame until the draft has been read, so a resuming user never
  // sees the name step flash before being moved to where they left off.
  if (!hydrated) {
    return <SafeAreaView className="flex-1 bg-surface" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="px-5 pt-6 pb-2">
          <Text className="mb-2 text-xs font-semibold text-on-surface-variant text-center">
            Step {step + 1} of {TOTAL_STEPS}
          </Text>
          <View className="flex-row gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <ProgressSegment key={i} active={i <= step} />
            ))}
          </View>
        </View>

        {resumed && (
          <Animated.View entering={FadeInDown.springify()} className="px-5 pb-1">
            <View className="rounded-2xl bg-surface-container px-4 py-3">
              <Text className="text-xs font-medium text-on-surface-variant text-center">
                {firstName
                  ? `Welcome back, ${firstName} — picking up where you left off.`
                  : 'Picking up where you left off.'}
              </Text>
            </View>
          </Animated.View>
        )}

        <ScrollView className="flex-1 px-5 py-6" keyboardShouldPersistTaps="handled">
          {/* Screen 0: Name */}
          {step === OnboardingStep.Name && (
            <Animated.View entering={FadeInDown.springify()}>
              <View className="items-center mb-4"><Mascot size={64} /></View>
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
                autoFocus
              />
              {firstNameError ? (
                <Text className="mt-2 text-xs text-destructive">{firstNameError}</Text>
              ) : null}

              <TouchableOpacity onPress={requestLogin} className="mt-6 items-center py-2">
                <Text className="text-sm font-semibold text-on-surface-variant">
                  Already have an account? <Text className="text-primary underline">Sign in</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Screen 1a: Age gate blocked (terminal — no retry, and persisted in
              the draft so relaunching the app doesn't hand out a fresh gate) */}
          {step === OnboardingStep.AgeGate && ageBlocked && (
            <Animated.View entering={FadeInDown.springify()} className="items-center pt-10">
              <Text className="text-6xl text-center mb-4">🔒</Text>
              <Text className="mb-3 text-2xl font-black text-on-surface text-center">
                Piggy is for adults 18+
              </Text>
              <Text className="text-sm font-medium text-on-surface-variant text-center px-4">
                We're not able to create an account for you based on the date of birth you confirmed.
                This app isn't available to users under 18.
              </Text>
            </Animated.View>
          )}

          {/* Screen 1b: Age gate — DOB not yet confirmed */}
          {step === OnboardingStep.AgeGate && !ageBlocked && (
            <Animated.View entering={FadeInDown.springify()}>
              <Text className="text-6xl text-center mb-4">🎂</Text>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                When were you born,{'\n'}{firstName}?
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                Piggy is only available to users 18 and older, so we need to confirm your age before
                we go any further.
              </Text>

              <View className="mb-6 flex-row items-start gap-2 rounded-2xl bg-surface-container p-4">
                <ShieldCheck size={16} color="#1D4ED8" style={{ marginTop: 1 }} />
                <Text className="flex-1 text-xs leading-5 text-on-surface-variant">
                  This is a legal age requirement, not profiling. We use your date of birth to
                  confirm you're 18 — it's never used to target you or shared with anyone.
                </Text>
              </View>

              <DobWheelPicker value={dateOfBirth} onChange={setDateOfBirth} />
            </Animated.View>
          )}

          {/* Screen 2: Localization */}
          {step === OnboardingStep.Localization && (
            <Animated.View entering={FadeInDown.springify()}>
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
            </Animated.View>
          )}

          {/* Screen 3: Goal Declaration */}
          {step === OnboardingStep.GoalDeclaration && (
            <Animated.View entering={FadeInDown.springify()}>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                What are we saving for?
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                Pick a goal or type your own below.
              </Text>

              <View className="flex-row flex-wrap gap-2 mb-5">
                {GOAL_CHIPS.map((chip) => (
                  <PressableScale
                    key={chip.label}
                    onPress={() => {
                      setGoalName(chip.label);
                      setGoalNameError('');
                    }}
                  >
                    <View
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
                    </View>
                  </PressableScale>
                ))}
              </View>

              <Input
                value={goalName}
                onChangeText={(v) => {
                  setGoalName(v);
                  if (v.trim().length >= 1) setGoalNameError('');
                }}
                placeholder="I want to..."
                autoFocus
              />
              {goalNameError ? (
                <Text className="mt-2 text-xs text-destructive">{goalNameError}</Text>
              ) : null}
            </Animated.View>
          )}

          {/* Screen 4: Target Amount */}
          {step === OnboardingStep.TargetAmount && (
            <Animated.View entering={FadeInDown.springify()}>
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
                  style={TEXT_INPUT_CENTERING}
                  autoFocus
                />
              </View>
              {targetAmountError ? (
                <Text className="mt-2 text-xs text-destructive">{targetAmountError}</Text>
              ) : null}
            </Animated.View>
          )}

          {/* Screen 5: Income (moved before the contribution question, so the
              suggestion chips have an anchor to prefill from) */}
          {step === OnboardingStep.Income && (
            <Animated.View entering={FadeInDown.springify()}>
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
                  style={TEXT_INPUT_CENTERING}
                  autoFocus
                />
              </View>
            </Animated.View>
          )}

          {/* Screen 6: Contribution (replaces the old timeline/date-chip screen) */}
          {step === OnboardingStep.Contribution && (
            <Animated.View entering={FadeInDown.springify()}>
              <ContributionStep
                currency={currency}
                language={language}
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
                hideFooter
              />
            </Animated.View>
          )}

          {/* Screen 7: Blueprint Review */}
          {step === OnboardingStep.BlueprintReview && (
            <Animated.View entering={FadeInDown.springify()}>
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
                <Row label="Goal reached" value={formatTargetDate(targetDate, language)} />
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
            </Animated.View>
          )}

          {/* Screen 8: Notification pre-permission. A custom screen before the
              OS dialog — iOS allows exactly one native prompt and a denial
              can't be re-triggered in-app, so the ask has to earn itself
              first. Placed after the blueprint (the payoff is still fresh) and
              before the email step (the biggest drop-off), because push is the
              only way to reach someone who leaves before giving us an email. */}
          {step === OnboardingStep.PushPermission && (
            <Animated.View entering={FadeInDown.springify()}>
              <Text className="text-6xl text-center mb-4">🔔</Text>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Want a nudge when{'\n'}it counts, {firstName}?
              </Text>
              <Text className="mb-6 text-sm font-medium text-on-surface-variant">
                Saving {formatCurrency(monthlyContribution, currency)} a month is easy to plan and
                easy to forget. A quick reminder is what keeps a streak alive.
              </Text>

              <View className="gap-3">
                <PermissionPoint
                  emoji="🔥"
                  title="Streak protection"
                  body="A heads-up when today's set-aside is still outstanding."
                />
                <PermissionPoint
                  emoji="🎯"
                  title="Milestone celebrations"
                  body={`We'll tell you the moment your ${goalName || 'goal'} hits 25%, 50%, 75%.`}
                />
                <PermissionPoint
                  emoji="🧘"
                  title="A weekly recap"
                  body="One calm summary of how the week went. No spam, ever."
                />
              </View>

              <Text className="mt-6 text-xs text-on-surface-variant text-center">
                You can change any of this later in Settings.
              </Text>
            </Animated.View>
          )}

          {/* Screen 9: Account Finalization (email / OTP) */}
          {step === OnboardingStep.AccountFinalization && (
            <Animated.View entering={FadeInDown.springify()}>
              <View className="items-center mb-4"><Mascot expression="celebrating" size={64} /></View>
              <Text className="mb-2 text-3xl font-black text-on-surface">
                Your Piggy Plan is ready!
              </Text>
              <Text className="mb-8 text-sm font-medium text-on-surface-variant">
                {verifiedSession
                  ? `Your email is confirmed — we just need to finish building your plan for your ${goalName}.`
                  : otpSent
                    ? `Enter the 6-digit code we emailed to ${email} to finish setting up your account.`
                    : `Enter your email — we'll send a sign-in code to lock in your plan for your ${goalName} by ${formatTargetDate(targetDate, language)}.`}
              </Text>

              <Input
                ref={emailInputRef}
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
                autoFocus
              />
              {emailError ? (
                <Text className="mt-2 text-xs text-destructive">{emailError}</Text>
              ) : null}

              {/* Hidden once the code has been accepted — it's single-use, so
                  re-entering or resending it can only make things worse. */}
              {otpSent && !verifiedSession && (
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
                    style={TEXT_INPUT_CENTERING}
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

              <LegalLinksNote />
            </Animated.View>
          )}

        </ScrollView>

        {showFixedFooter && (
          <View className="px-5 pt-4 pb-6">
            {renderFooter()}
          </View>
        )}

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

        <DobConfirmModal
          isVisible={dobConfirmModalVisible}
          dateOfBirth={dateOfBirth}
          language={language}
          onEdit={handleDobEdit}
          onConfirm={handleDobConfirmed}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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

/** One benefit row on the notification pre-permission screen. */
function PermissionPoint({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-surface-container-low p-4">
      <Text className="text-xl">{emoji}</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-on-surface">{title}</Text>
        <Text className="mt-0.5 text-xs leading-5 text-on-surface-variant">{body}</Text>
      </View>
    </View>
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
