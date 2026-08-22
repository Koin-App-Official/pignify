/**
 * Login screen (Email OTP) — primary account authentication for returning users,
 * new devices, a normal logout, and after a forgot-PIN / forced re-login.
 * Brand-new users go through onboarding instead (which performs the same OTP
 * step inline). onLoggedIn() sorts out afterward whether the device still has
 * a PIN to re-confirm (needs_pin_confirm) or needs a brand-new one
 * (needs_pin_setup) — this screen's copy stays neutral since it doesn't know
 * which case it is.
 *
 * The emailed code here is the account login OTP — NOT the device PIN. Copy keeps
 * them distinct on purpose.
 */
import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { requestEmailOtp, verifyEmailOtp, SessionSecretUnavailableError } from '@/lib/auth';
import { clearClientSession } from '@/lib/appwrite';
import { createLogger } from '@/lib/logger';
import NitroCookies from 'react-native-nitro-cookies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';
import { Mascot } from '@/components/Mascot';

const log = createLogger('LoginGate');

const isEmailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function LoginGate() {
  const { t } = useTranslation('auth');
  const profileEmail = useStore((s) => s.profile.email);
  const onboardingCompleted = useStore((s) => s.profile.onboardingCompleted);
  const updateProfile = useStore((s) => s.updateProfile);
  const onLoggedIn = useAuthLock((s) => s.onLoggedIn);
  const cancelLoginRequest = useAuthLock((s) => s.cancelLoginRequest);
  // Reached two ways: a real post-logout/forgot-PIN login (onboardingCompleted
  // is true — this is the only way back into the app, nothing to back out to),
  // or "I already have an account" on a brand-new install (onboardingCompleted
  // is false — that detour needs an exit back to onboarding).
  const canGoBack = !onboardingCompleted;

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(profileEmail ?? '');
  const [code, setCode] = useState('');
  const [otpUserId, setOtpUserId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isEmailValid(email)) return setError(t('login.invalidEmail'));
    setBusy(true);
    setError('');
    try {
      const { userId } = await requestEmailOtp(email.trim());
      setOtpUserId(userId);
      setStage('code');
    } catch {
      setError(t('login.sendCodeError'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) return setError(t('login.invalidCode'));
    setBusy(true);
    setError('');
    try {
      // Defensive: createSession 401s if a session is already active on the
      // client (e.g. a stale/lingering session from an earlier state). Clearing
      // our own header isn't enough — react-native-appwrite sends every request
      // with credentials: 'include', so the native cookie jar re-sends any prior
      // session cookie regardless.
      clearClientSession();
      await NitroCookies.clearAll();
      const { userId, secret } = await verifyEmailOtp(otpUserId, code.trim());
      // A successful OTP verification is by definition an existing account —
      // reached ahead of onboarding completing (the "I already have an
      // account" entry point), this device's onboardingCompleted is still
      // false. Two things depend on it being true before onLoggedIn runs:
      // the dashboard's own redirect (index.tsx) would otherwise bounce a
      // freshly-unlocked user straight back into onboarding, and onLoggedIn's
      // internal plan-gate check skips entirely while onboardingCompleted is
      // false (planGateReason returns null), which would silently skip the
      // trial-intro/lockout gate for a returning trialing/locked user.
      //
      // userID is set unconditionally (every login, not just first-time) --
      // onboarding.tsx is the only other place that sets it, so a user who
      // signs into an existing account here (rather than completing fresh
      // onboarding on this device) would otherwise have profile.userID stuck
      // undefined forever, silently breaking anything keyed on it (e.g.
      // billing.ts's startCheckout, which falls back to the "Simulate
      // Payment" dev path when userID is missing).
      updateProfile({ userID: userId, ...(!onboardingCompleted && { onboardingCompleted: true }) });
      onLoggedIn(userId, secret); // → needs_pin_setup or needs_pin_confirm
    } catch (err) {
      log.error('verify failed:', err);
      if (err instanceof SessionSecretUnavailableError) {
        // The code was right and createSession succeeded — only reading back the
        // token failed. Don't imply the code was wrong, but it IS consumed now,
        // so a retry needs a fresh one.
        setError(t('login.sessionSecretError'));
        setCode('');
      } else {
        setError(t('login.codeIncorrect'));
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {canGoBack && (
        <Pressable
          onPress={cancelLoginRequest}
          hitSlop={12}
          className="ml-4 mt-2 h-10 w-10 items-center justify-center rounded-full"
        >
          <ArrowLeft size={22} color="#6b7280" />
        </Pressable>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 justify-center px-8">
          <Animated.View entering={FadeInDown.springify()}>
            <View className="items-center mb-4"><Mascot size={48} /></View>

            {stage === 'email' ? (
              <>
                <Text className="text-2xl font-black text-on-surface mb-2 text-center">{t('login.signBackIn')}</Text>
                <Text className="text-sm font-medium text-on-surface-variant mb-8 text-center">
                  {t('login.signBackInSub')}
                </Text>
                <Input
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder={t('login.emailPlaceholder')}
                />
                {error ? <Text className="mt-2 text-xs text-destructive">{error}</Text> : null}
                <Button onPress={sendCode} disabled={busy} className="mt-8 w-full h-14">
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-base font-bold text-primary-foreground">{t('login.sendCode')}</Text>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Text className="text-2xl font-black text-on-surface mb-2 text-center">{t('login.enterCode')}</Text>
                <Text className="text-sm font-medium text-on-surface-variant mb-8 text-center">
                  {t('login.codeSentTo', { email })}
                </Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => {
                    setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                    if (error) setError('');
                  }}
                  keyboardType="number-pad"
                  placeholder="••••••"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  style={TEXT_INPUT_CENTERING}
                  className="h-16 rounded-2xl border border-outline bg-surface-container-low text-center text-3xl font-bold tracking-[12px] text-on-surface"
                  maxLength={6}
                  autoFocus
                />
                {error ? <Text className="mt-2 text-xs text-destructive">{error}</Text> : null}
                <Button onPress={verify} disabled={busy || code.length !== 6} className="mt-8 w-full h-14">
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-base font-bold text-primary-foreground">{t('login.verify')}</Text>
                  )}
                </Button>
                <Pressable onPress={sendCode} disabled={busy} className="mt-4 items-center py-2">
                  <Text className="text-sm font-semibold text-primary underline">{t('login.resendCode')}</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
