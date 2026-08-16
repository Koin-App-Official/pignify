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
 * There is deliberately no "subscribe" button: the payment rail is issue H and
 * doesn't exist yet. Until it does, `LOCKOUT_ENFORCED` keeps this from becoming
 * a screen with no way out.
 */
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/Mascot';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { getPlanConfig } from '@/lib/entitlements';
import { planGateReason, trialDaysRemaining, LOCKOUT_ENFORCED } from '@/lib/planGate';

export function PlanGate() {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const onPlanAcknowledged = useAuthLock((s) => s.onPlanAcknowledged);

  const reason = planGateReason({
    planStatus: profile.planStatus,
    trialIntroSeen: !!profile.trialIntroSeen,
    onboardingCompleted: profile.onboardingCompleted,
  });

  const planName = getPlanConfig(profile.plan).displayName;
  const daysLeft = trialDaysRemaining(profile.trialEndsAt);

  const acknowledge = () => {
    updateProfile({ trialIntroSeen: true });
    onPlanAcknowledged();
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

            {!LOCKOUT_ENFORCED && (
              <>
                <Text className="mt-8 text-sm text-on-surface-variant text-center leading-5">
                  Subscriptions aren't open yet — you can keep using Piggy in the meantime.
                </Text>
                <Button onPress={acknowledge} className="mt-4 w-full h-14 flex-row gap-2">
                  <Text className="text-base font-bold text-primary-foreground">Continue</Text>
                  <ArrowRight size={18} color="#ffffff" />
                </Button>
              </>
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

function Perk({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-surface-container-low p-4">
      <Check size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-sm leading-5 text-on-surface">{text}</Text>
    </View>
  );
}
