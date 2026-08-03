/**
 * Top-level gate. Wraps the app and decides — based on the app-lock state machine
 * — whether to show the real UI (children) or an auth/lock screen over it.
 *
 *   loading            → nothing (native splash still covers, or blank)
 *   unauthenticated    → onboarding (new user) OR login (returning user / new device)
 *   needs_pin_setup    → set a brand-new PIN (no PIN exists on this device yet)
 *   needs_pin_confirm  → re-confirm the EXISTING PIN (normal logout, not forgot-PIN)
 *   locked             → lock screen
 *   unlocked           → children (the normal navigation stack)
 *
 * A brand-new install has no completed onboarding, so we let the normal stack
 * render (the dashboard redirects to /onboarding, which performs OTP + set-PIN
 * inline). A returning user whose local profile exists but whose PIN was wiped
 * (forgot PIN / new device) sees the dedicated login screen; if the PIN is
 * still on-device (a normal logout) they land on needs_pin_confirm instead of
 * needs_pin_setup, so they never have to invent a new PIN.
 */
import { View } from 'react-native';
import { useStore } from '@/lib/store';
import { useAppLock } from '@/hooks/useAppLock';
import { LoginGate } from './LoginGate';
import { SetPinGate } from './SetPinGate';
import { ConfirmPinGate } from './ConfirmPinGate';
import { LockGate } from './LockGate';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAppLock();
  const onboardingCompleted = useStore((s) => s.profile.onboardingCompleted);

  if (status === 'loading') {
    return <View className="flex-1 bg-surface" />;
  }

  if (status === 'needs_pin_setup') return <SetPinGate />;
  if (status === 'needs_pin_confirm') return <ConfirmPinGate />;
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
