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
 * Subscribing goes through hosted Stripe Checkout in the external browser, the
 * same rail `plans.tsx` already uses. The plan is never applied on the browser
 * merely opening — only after the entitlements read confirms it, which is also
 * what clears this gate.
 *
 * With `LOCKOUT_ENFORCED` on there is no escape hatch, so every failure path
 * here has to stay visible: a checkout that can't start says so rather than
 * doing nothing, which would be indistinguishable from a dead button.
 */
import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/Mascot';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { getPlanConfig, PLAN_ORDER, formatUSD } from '@/lib/entitlements';
import { planGateReason, trialDaysRemaining, lockoutEnforced } from '@/lib/planGate';
import { startCheckout, requestSubscriptionSync, isBillingConfigured } from '@/lib/billing';
import { fetchEntitlementsSync } from '@/lib/entitlementsSync';
import type { UserPlan } from '@/lib/store';

export function PlanGate() {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const onPlanAcknowledged = useAuthLock((s) => s.onPlanAcknowledged);

  const reason = planGateReason({
    planStatus: profile.planStatus,
    trialIntroSeen: !!profile.trialIntroSeen,
    onboardingCompleted: profile.onboardingCompleted,
  });

  // Enforcement is conditional on checkout actually being reachable — see
  // lockoutEnforced(). Never trap the user behind a broken button.
  const enforced = lockoutEnforced(isBillingConfigured());
  const planName = getPlanConfig(profile.plan).displayName;
  const daysLeft = trialDaysRemaining(profile.trialEndsAt);

  const [busy, setBusy] = useState<UserPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const acknowledge = () => {
    updateProfile({ trialIntroSeen: true });
    onPlanAcknowledged();
  };

  const subscribe = async (target: UserPlan) => {
    setBusy(target);
    setError('');
    try {
      const result = await startCheckout(target, profile.userID);
      if (result.status !== 'completed') {
        // 'completed' only means the browser opened. Anything else has to be
        // said out loud — with no escape hatch, a silent no-op is a dead button.
        setError(
          "We couldn't open checkout. Check your connection and try again, or email us at hello@piggnify.com."
        );
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Called when the user returns from the browser. Asks n8n to re-read Stripe
   * first (covering a webhook that hasn't landed yet), then re-reads
   * entitlements. A successful subscription flips `planStatus` away from
   * expired, which clears this gate on the next render — the gate is never
   * dismissed on the user's say-so alone.
   */
  const refreshAfterCheckout = async () => {
    if (!profile.userID) return;
    setChecking(true);
    setError('');
    try {
      await requestSubscriptionSync(profile.userID);
      const entitlements = await fetchEntitlementsSync(profile.userID);
      if (entitlements?.plan) {
        updateProfile({
          plan: entitlements.plan,
          ...(entitlements.status ? { planStatus: entitlements.status } : {}),
          ...(entitlements.trialEndsAt !== undefined
            ? { trialEndsAt: entitlements.trialEndsAt }
            : {}),
        });
      }
      if (!entitlements || entitlements.status === 'expired' || entitlements.status === 'canceled') {
        setError(
          "We couldn't find an active subscription yet. If you've just paid, give it a moment and tap again."
        );
      }
    } finally {
      setChecking(false);
    }
  };

  // The gate is driven by store state, so a status change can clear the reason
  // out from under it. Continuing is always the right move in that case.
  if (!reason) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <Button onPress={acknowledge} className="w-full h-14">
          <Text className="text-base font-bold text-primary-foreground">Continue</Text>
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
            <Text className="text-6xl text-center mb-6">🔒</Text>
            <Text className="mb-3 text-3xl font-black text-on-surface text-center">
              {lapsedTrial ? 'Your free trial has ended' : 'Your subscription has ended'}
            </Text>
            <Text className="mb-8 text-base font-medium text-on-surface-variant text-center leading-6">
              {planName} features are paused for now.
            </Text>

            <View className="rounded-2xl bg-surface-container p-4 flex-row items-start gap-3">
              <ShieldCheck size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm leading-5 text-on-surface-variant">
                <Text className="font-bold text-on-surface">Nothing has been deleted.</Text> Your
                goals, deposits, streak and history are all exactly where you left them, and they
                come straight back when you subscribe.
              </Text>
            </View>

            {!isBillingConfigured() && (
              <View className="mt-6 rounded-2xl bg-warning-container p-4">
                <Text className="text-sm text-warning">
                  Checkout isn't configured in this build, so subscribing won't work here. You can
                  keep using Piggy for now.
                </Text>
              </View>
            )}

            <Text className="mt-8 mb-3 text-sm font-bold text-on-surface">
              Pick a plan to carry on
            </Text>
            <View className="gap-3">
              {PLAN_ORDER.map((id) => {
                const c = getPlanConfig(id);
                return (
                  <PlanChoice
                    key={id}
                    name={c.displayName}
                    price={`${formatUSD(c.priceUSD)}/mo`}
                    busy={busy === id}
                    disabled={busy !== null || checking}
                    onPress={() => subscribe(id)}
                  />
                );
              })}
            </View>

            {error ? (
              <View className="mt-4 rounded-2xl bg-destructive/10 p-4">
                <Text className="text-sm text-destructive">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={refreshAfterCheckout}
              disabled={checking || busy !== null}
              className="mt-5 items-center py-2"
            >
              {checking ? (
                <ActivityIndicator color="#1D4ED8" />
              ) : (
                <Text className="text-sm font-semibold text-primary underline">
                  I've already subscribed
                </Text>
              )}
            </TouchableOpacity>

            {!enforced && (
              <Button onPress={acknowledge} className="mt-4 w-full h-14 flex-row gap-2">
                <Text className="text-base font-bold text-primary-foreground">
                  Continue without subscribing
                </Text>
                <ArrowRight size={18} color="#ffffff" />
              </Button>
            )}
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
          <Text className="mt-8 mb-2 text-3xl font-black text-on-surface text-center">
            {daysLeft ?? 14} days of {planName},{'\n'}on us
          </Text>
          <Text className="mb-8 text-base font-medium text-on-surface-variant text-center leading-6">
            Everything is unlocked from today. We didn't ask for a card, so there's nothing to
            cancel.
          </Text>
        </Animated.View>

        <View className="gap-3">
          <Perk text="Every feature Piggy has, including the AI coach" />
          <Perk text="Unlimited goals, so you can plan more than one thing" />
          <Perk text="We'll remind you before it ends — no surprises" />
        </View>

        <Button onPress={acknowledge} className="mt-8 w-full h-14 flex-row gap-2">
          <Text className="text-base font-bold text-primary-foreground">Let's go</Text>
          <ArrowRight size={18} color="#ffffff" />
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One selectable tier on the lapsed screen. Tapping it opens Stripe Checkout. */
function PlanChoice({
  name,
  price,
  busy,
  disabled,
  onPress,
}: {
  name: string;
  price: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-5 py-4 ${
        disabled && !busy ? 'opacity-50' : ''
      }`}
    >
      <View>
        <Text className="text-base font-bold text-on-surface">{name}</Text>
        <Text className="text-xs font-medium text-on-surface-variant mt-0.5">{price}</Text>
      </View>
      {busy ? <ActivityIndicator color="#1D4ED8" /> : <ArrowRight size={18} color="#1D4ED8" />}
    </TouchableOpacity>
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
