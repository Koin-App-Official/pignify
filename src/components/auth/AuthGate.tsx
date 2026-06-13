/**
 * Top-level gate. Wraps the app and decides — based on the app-lock state machine
 * — whether to show the real UI (children) or an auth/lock screen over it.
 *
 *   loading          → nothing (native splash still covers, or blank)
 *   unauthenticated  → onboarding (new user) OR login (returning user / new device)
 *   needs_pin_setup  → set PIN
 *   locked           → lock screen
 *   unlocked         → children (the normal navigation stack)
 *
 * A brand-new install has no completed onboarding, so we let the normal stack
 * render (the dashboard redirects to /onboarding, which performs OTP + set-PIN
 * inline). A returning user whose local profile exists but whose PIN was wiped
 * (forgot PIN / new device) sees the dedicated login screen.
 */
import { View } from 'react-native';
import { useStore } from '@/lib/store';
import { useAppLock } from '@/hooks/useAppLock';
import { LoginGate } from './LoginGate';
import { SetPinGate } from './SetPinGate';
import { LockGate } from './LockGate';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAppLock();
  const onboardingCompleted = useStore((s) => s.profile.onboardingCompleted);

  if (status === 'loading') {
    return <View className="flex-1 bg-surface" />;
  }

  if (status === 'needs_pin_setup') return <SetPinGate />;
  if (status === 'locked') return <LockGate />;

  if (status === 'unauthenticated') {
    // New user → let onboarding render (it handles OTP + set-PIN inline).
    // Returning user (profile exists, PIN wiped) → dedicated login.
    if (onboardingCompleted) return <LoginGate />;
    return <>{children}</>;
  }

  // unlocked
  return <>{children}</>;
}
