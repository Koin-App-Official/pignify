/**
 * Login screen (Email OTP) — primary account authentication for returning users,
 * new devices, and after a forgot-PIN / forced re-login. Brand-new users go
 * through onboarding instead (which performs the same OTP step inline).
 *
 * The emailed code here is the account login OTP — NOT the device PIN. Copy keeps
 * them distinct on purpose.
 */
import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { requestEmailOtp, verifyEmailOtp } from '@/lib/auth';
import { clearClientSession } from '@/lib/appwrite';
import NitroCookies from 'react-native-nitro-cookies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PLACEHOLDER_COLOR } from '@/lib/utils';

const isEmailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function LoginGate() {
  const profileEmail = useStore((s) => s.profile.email);
  const onLoggedIn = useAuthLock((s) => s.onLoggedIn);

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(profileEmail ?? '');
  const [code, setCode] = useState('');
  const [otpUserId, setOtpUserId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isEmailValid(email)) return setError('Please enter a valid email address.');
    setBusy(true);
    setError('');
    try {
      const { userId } = await requestEmailOtp(email.trim());
      setOtpUserId(userId);
      setStage('code');
    } catch {
      setError('Could not send the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.');
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
      onLoggedIn(userId, secret); // → needs_pin_setup
    } catch (err) {
      console.error('[LoginGate] verify failed:', err);
      setError('That code is incorrect or expired. Request a new one.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 justify-center px-8">
          <Animated.View entering={FadeInDown.springify()}>
            <Text className="text-5xl mb-4 text-center">🐷</Text>

            {stage === 'email' ? (
              <>
                <Text className="text-2xl font-black text-on-surface mb-2 text-center">Reset your PIN</Text>
                <Text className="text-sm font-medium text-on-surface-variant mb-8 text-center">
                  Enter your email and we'll send you a sign-in code.
                </Text>
                <Input
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="you@example.com"
                />
                {error ? <Text className="mt-2 text-xs text-destructive">{error}</Text> : null}
                <Button onPress={sendCode} disabled={busy} className="mt-8 w-full h-14">
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-base font-bold text-primary-foreground">Send code</Text>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Text className="text-2xl font-black text-on-surface mb-2 text-center">Enter your code</Text>
                <Text className="text-sm font-medium text-on-surface-variant mb-8 text-center">
                  We emailed a 6-digit code to {email}.
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
                  className="h-16 rounded-2xl border border-outline bg-surface-container-low text-center text-3xl font-bold tracking-[12px] text-on-surface"
                  maxLength={6}
                  autoFocus
                />
                {error ? <Text className="mt-2 text-xs text-destructive">{error}</Text> : null}
                <Button onPress={verify} disabled={busy || code.length !== 6} className="mt-8 w-full h-14">
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-base font-bold text-primary-foreground">Verify</Text>
                  )}
                </Button>
                <Pressable onPress={sendCode} disabled={busy} className="mt-4 items-center py-2">
                  <Text className="text-sm font-semibold text-primary underline">Resend code</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
