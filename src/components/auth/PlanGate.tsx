/**
 * The plan gate — one screen, two jobs.
 *
 * `trial_intro`: shown once after onboarding. Its whole purpose is that the
 * user learns a 14-day trial started, since nothing else in the app says so and
 * a silent day-15 lockout would feel like a bug.
 *
 * `locked`: the trial lapsed (or a subscription was cancelled). Leads with the
 * fact that nothing was deleted — constraint C4 — because that's the first
 * thing a user in this state actually worries about.
 *
 * There is no way to subscribe from here (#173): the app carries no purchase
 * path. It does link to web billing, though — this gate replaces the whole
 * navigation stack, so the Settings row is out of reach and without a link here
 * a locked user had no way forward at all (#199, reversing D3 for this screen).
 *
 * A user who subscribes on the web is unlocked by the entitlements read, never
 * by their own say-so: the AppState listener re-reads on every return from the
 * background, and "I've already subscribed" is the manual fallback.
 */
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/Mascot';
import { Icon } from '@/components/icons/Icon';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { getPlanConfig } from '@/lib/entitlements';
import { planGateReason, trialDaysRemaining, lockoutEnforced } from '@/lib/planGate';
import { requestAccountDeletion } from '@/lib/account';
import { syncEntitlements } from '@/lib/entitlementsRefresh';
import { safeOpenURL, SUPPORT_EMAIL, ACCOUNT_URL, ACCOUNT_URL_DISPLAY } from '@/lib/linking';

export function PlanGate() {
  const { t } = useTranslation('plans');
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const resetForDemo = useStore((s) => s.resetForDemo);
  const onPlanAcknowledged = useAuthLock((s) => s.onPlanAcknowledged);
  const userId = useAuthLock((s) => s.userId);
  const authLogout = useAuthLock((s) => s.logout);
  const resetToLogin = useAuthLock((s) => s.resetToLogin);

  const reason = planGateReason({
    planStatus: profile.planStatus,
    trialIntroSeen: !!profile.trialIntroSeen,
    onboardingCompleted: profile.onboardingCompleted,
  });

  // Enforcement stays conditional on the user having somewhere to go — see
  // lockoutEnforced(). ACCOUNT_URL is a constant now rather than an env var, so
  // this is true in every build; the check is kept because the guarantee it
  // encodes (never trap a user behind an escape hatch that doesn't exist) is
  // what stops a future change from re-creating the trap by omission.
  const enforced = lockoutEnforced(ACCOUNT_URL.length > 0);
  const planName = getPlanConfig(profile.plan).displayName;
  const daysLeft = trialDaysRemaining(profile.trialEndsAt);

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const acknowledge = () => {
    updateProfile({ trialIntroSeen: true });
    onPlanAcknowledged();
  };

  /**
   * Re-reads entitlements from the server. A subscription bought on the web
   * flips `planStatus` away from expired, which clears this gate on the next
   * render — the gate is never dismissed on the user's say-so alone. Forced,
   * because the hourly throttle would otherwise swallow exactly the read this
   * user is waiting on.
   */
  const refreshSubscriptionState = async () => {
    if (!profile.userID) return;
    setChecking(true);
    setError('');
    try {
      await syncEntitlements({ force: true });
      const { planStatus } = useStore.getState().profile;
      if (planStatus === 'expired' || planStatus === 'canceled') {
        setError(t('planGate.locked.noActiveSubscription'));
      }
    } finally {
      setChecking(false);
    }
  };

  /**
   * Same shape as Settings' openWebBilling: `safeOpenURL` routes https through
   * `expo-web-browser`, which resolves on dismissal without ever backgrounding
   * the app — so the AppState listener below never sees this round trip, and
   * the re-read has to happen here. Quiet on purpose: closing the page without
   * subscribing isn't an error worth showing.
   */
  const openWebBilling = async () => {
    await safeOpenURL(ACCOUNT_URL, t('settings:manageOnWebError'), t('common:notAvailable'));
    if (!profile.userID) return;
    setChecking(true);
    setError('');
    try {
      await syncEntitlements({ force: true });
    } finally {
      setChecking(false);
    }
  };

  /**
   * The user subscribes in a browser, outside the app entirely, so a return
   * from the background is the only signal that anything might have changed —
   * there is no deep link to listen for. "I've already subscribed" below stays
   * as the manual fallback.
   *
   * Watches specifically for a background→active round trip, not just any
   * 'active' event — 'inactive' also fires for transient interruptions
   * (control center, a phone call banner) that aren't a return from the web.
   */
  useEffect(() => {
    if (reason !== 'locked') return;
    let wasBackgrounded = false;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        wasBackgrounded = true;
        return;
      }
      if (next === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        refreshSubscriptionState();
      }
    });
    return () => sub.remove();
  }, [reason, profile.userID]);

  /**
   * A locked user has exactly two ways out short of subscribing: log out, or
   * delete their account. Both bypass the PIN — this gate can appear ahead of
   * the PIN step entirely (a fresh login on a new device), so there may be no
   * device PIN to re-confirm yet. The server session is already verified by
   * the time either gate reason can show.
   */
  const handleLogout = () => {
    Alert.alert(t('planGate.locked.logOut'), t('planGate.locked.logoutBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('planGate.locked.logOut'), style: 'destructive', onPress: () => authLogout() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('planGate.locked.deleteAccountTitle'),
      t('planGate.locked.deleteAccountBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('planGate.locked.deleteAction'), style: 'destructive', onPress: performDeleteAccount },
      ]
    );
  };

  const performDeleteAccount = async () => {
    if (!userId) return;
    setDeletingAccount(true);
    const ok = await requestAccountDeletion(userId);
    if (!ok) {
      setDeletingAccount(false);
      Alert.alert(t('planGate.locked.somethingWrongTitle'), t('planGate.locked.somethingWrongBody'));
      return;
    }
    resetForDemo();
    await resetToLogin();
  };

  // The gate is driven by store state, so a status change can clear the reason
  // out from under it. Continuing is always the right move in that case.
  if (!reason) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <Button onPress={acknowledge} className="w-full h-14">
          <Text className="text-base font-bold text-primary-foreground">{t('planGate.continue')}</Text>
        </Button>
      </SafeAreaView>
    );
  }

  if (reason === 'locked') {
    const lapsedTrial = profile.planStatus === 'expired';
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <Animated.View entering={FadeInDown.springify()}>
            <View className="items-center mb-6">
              <Icon name="padlock" size={72} />
            </View>
            <Text className="mb-3 text-3xl font-black text-on-surface text-center">
              {lapsedTrial ? t('planGate.locked.trialEndedTitle') : t('planGate.locked.subscriptionEndedTitle')}
            </Text>
            <Text className="mb-8 text-base font-medium text-on-surface-variant text-center leading-6">
              {t('planGate.locked.featuresPaused', { plan: planName })}
            </Text>

            <View className="rounded-2xl bg-surface-container p-4 flex-row items-start gap-3">
              <ShieldCheck size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm leading-5 text-on-surface-variant">
                <Text className="font-bold text-on-surface">{t('planGate.locked.nothingDeletedBold')}</Text>
                {t('planGate.locked.nothingDeletedRest')}
              </Text>
            </View>

            {/* The second of the app's two links to web billing (#199) — the
                Settings row is unreachable from behind this gate. Neutral
                wording, no prices, no purchase CTA. */}
            <TouchableOpacity
              onPress={openWebBilling}
              disabled={checking}
              accessibilityRole="link"
              accessibilityLabel={t('settings:manageOnWeb')}
              className="mt-6 rounded-2xl bg-surface-container-low p-4"
            >
              <Text className="text-sm leading-5 text-on-surface-variant text-center">
                {t('planGate.locked.managedOnWeb')}
              </Text>
              <Text className="mt-1 text-sm font-bold text-primary text-center underline">
                {ACCOUNT_URL_DISPLAY}
              </Text>
            </TouchableOpacity>

            {error ? (
              <View className="mt-4 rounded-2xl bg-destructive/10 p-4">
                <Text className="text-sm text-destructive">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={refreshSubscriptionState}
              disabled={checking}
              className="mt-5 items-center py-2"
            >
              {checking ? (
                <ActivityIndicator color="#1D4ED8" />
              ) : (
                <Text className="text-sm font-semibold text-primary underline">
                  {t('planGate.locked.alreadySubscribed')}
                </Text>
              )}
            </TouchableOpacity>

            {!enforced && (
              <Button onPress={acknowledge} className="mt-4 w-full h-14 flex-row gap-2">
                <Text className="text-base font-bold text-primary-foreground">
                  {t('planGate.locked.continueWithoutSubscribing')}
                </Text>
                <ArrowRight size={18} color="#ffffff" />
              </Button>
            )}

            <View className="mt-8 pt-5 border-t border-outline/10">
              {deletingAccount ? (
                <View className="flex-row items-center justify-center gap-2 py-2">
                  <ActivityIndicator color="#DC2626" />
                  <Text className="text-sm font-medium text-on-surface-variant">
                    {t('planGate.locked.deletingAccount')}
                  </Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap items-center justify-center gap-5">
                  <TouchableOpacity onPress={handleLogout} disabled={checking}>
                    <Text className="text-sm font-semibold text-on-surface-variant underline">
                      {t('planGate.locked.logOut')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      safeOpenURL(
                        `mailto:${SUPPORT_EMAIL}`,
                        t('common:noEmailApp', { email: SUPPORT_EMAIL }),
                        t('common:notAvailable')
                      )
                    }
                    disabled={checking}
                  >
                    <Text className="text-sm font-semibold text-on-surface-variant underline">
                      {t('planGate.locked.contactSupport')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDeleteAccount} disabled={checking}>
                    <Text className="text-sm font-semibold text-destructive underline">
                      {t('planGate.locked.deleteAccount')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // trial_intro
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <Animated.View entering={FadeInDown.springify()} className="items-center">
          <Mascot expression="celebrating" size={120} />
          {/* planGate.trialIntro.title carries a deliberate `\n` (audited,
              Phase 8, implementations/I18N_SCALE.md) — "on us" is meant to
              land alone as the payoff line, same reasoning as welcome.tsx's
              slide headlines. Not tied to a fixed-height container. */}
          <Text className="mt-8 mb-2 text-3xl font-black text-on-surface text-center">
            {t('planGate.trialIntro.title', { days: daysLeft ?? 14, plan: planName })}
          </Text>
          <Text className="mb-8 text-base font-medium text-on-surface-variant text-center leading-6">
            {t('planGate.trialIntro.body')}
          </Text>
        </Animated.View>

        <View className="gap-3">
          <Perk text={t('planGate.trialIntro.perk1')} />
          <Perk text={t('planGate.trialIntro.perk2')} />
          <Perk text={t('planGate.trialIntro.perk3')} />
        </View>

        <Button onPress={acknowledge} className="mt-8 w-full h-14 flex-row gap-2">
          <Text className="text-base font-bold text-primary-foreground">{t('planGate.trialIntro.cta')}</Text>
          <ArrowRight size={18} color="#ffffff" />
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-surface-container-low p-4">
      <Check size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-sm leading-5 text-on-surface">{text}</Text>
    </View>
  );
}
