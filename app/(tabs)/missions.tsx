import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Zap, Trophy, Check, Lock } from 'lucide-react-native';
import { useStore, formatCurrency, type ActiveMission } from '@/lib/store';
import {
  MISSION_CATALOG,
  buildMissionContext,
  getMissionProgress,
  getTier,
  renderMissionCopy,
  type MissionContext,
  type MissionDef,
  type MissionTier,
} from '@/lib/missions';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useFocusReplay } from '@/hooks/useFocusReplay';
import { FadeInStagger } from '@/components/animation/FadeInStagger';
import { PressableScale } from '@/components/animation/PressableScale';
import { AnimatedProgressBar } from '@/components/animation/AnimatedProgressBar';
import { SkiaConfetti } from '@/components/animation/SkiaConfetti';
import { useCelebrate } from '@/components/animation/useCelebrate';
import { springPresets } from '@/lib/springPresets';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

const TIER_LABELS: Record<MissionTier, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

type CardState = 'claimed' | 'ready' | 'locked' | 'manual';

function getCardState(am: ActiveMission, def: MissionDef, ctx: MissionContext): CardState {
  if (am.claimed) return 'claimed';
  if (def.verify === 'manual') return 'manual';
  return def.verify(ctx) ? 'ready' : 'locked';
}

interface ResolvedMission {
  am: ActiveMission;
  def: MissionDef;
}

export default function Missions() {
  const activeMissions = useStore((state) => state.activeMissions);
  const achievements = useStore((state) => state.achievements);
  const goals = useStore((s) => s.goals);
  const level = useStore((s) => s.profile.level);
  const xp = useStore((s) => s.profile.xp);
  const streak = useStore((s) => s.profile.streak);
  const monthlyContribution = useStore((s) => s.profile.monthlyContribution);
  const currency = useStore((s) => s.profile.currency);
  const lastActiveDate = useStore((s) => s.profile.lastActiveDate);
  const expenses = useStore((s) => s.profile.expenses);
  const claimMissionAction = useStore((state) => state.claimMission);

  const [tab, setTab] = useState<'missions' | 'achievements'>('missions');
  const replay = useFocusReplay();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { confettiProgress, celebrate, active: confettiActive } = useCelebrate();

  const profileSlice = useMemo(
    () => ({ level, streak, monthlyContribution, currency, lastActiveDate }),
    [level, streak, monthlyContribution, currency, lastActiveDate]
  );

  const ctx = useMemo(
    () => buildMissionContext({ goals, profile: profileSlice, expenses }),
    [goals, profileSlice, expenses]
  );

  const tier = useMemo(() => getTier(profileSlice), [profileSlice]);

  const resolved = useMemo<ResolvedMission[]>(
    () =>
      activeMissions
        .map((am) => {
          const def = MISSION_CATALOG.find((d) => d.id === am.defId);
          return def ? { am, def } : null;
        })
        .filter((r): r is ResolvedMission => r !== null),
    [activeMissions]
  );

  const dailyMissions = resolved.filter((r) => r.am.cadence === 'daily');
  const weeklyMissions = resolved.filter((r) => r.am.cadence === 'weekly');
  const claimedCount = resolved.filter((r) => r.am.claimed).length;

  const handleClaim = (defId: string) => {
    if (claimMissionAction(defId)) celebrate();
  };

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 py-6">
        <View>
        <Text className="mb-1 text-2xl font-black text-on-surface">Missions</Text>
        <Text className="mb-6 text-sm font-medium text-on-surface-variant">Complete missions to earn XP and build habits</Text>

        {/* Level bar */}
        <View className="mb-6 rounded-2xl bg-surface-container-low p-4" style={CARD_SHADOW}>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Zap size={18} color="#22C55E" />
              <Text className="text-sm font-bold text-on-surface">Saver Lv.{level}</Text>
              <View className="rounded-full bg-primary-container px-2 py-0.5">
                <Text className="text-[10px] font-bold text-primary">{TIER_LABELS[tier]}</Text>
              </View>
            </View>
            <Text className="text-xs font-bold text-on-surface-variant">{xp % 100}/100 XP</Text>
          </View>
          <AnimatedProgressBar progress={(xp % 100) / 100} />
          <Text className="mt-3 text-xs font-medium text-on-surface-variant">{claimedCount}/{resolved.length} missions completed</Text>
        </View>

        {/* Segmented Button */}
        <SegmentedControl tab={tab} onChange={setTab} />

        {tab === 'missions' ? (
          <View className="pb-10">
            <Text className="mb-3 text-sm font-bold text-on-surface-variant uppercase tracking-wide">Daily Missions</Text>
            <View className="mb-6 gap-3">
              {dailyMissions.map((r, index) => (
                <MissionCard key={r.am.defId} entry={r} ctx={ctx} currency={currency} onComplete={() => handleClaim(r.am.defId)} index={index} replay={replay} />
              ))}
            </View>
            <Text className="mb-3 text-sm font-bold text-on-surface-variant uppercase tracking-wide">Weekly Missions</Text>
            <View className="mb-6 gap-3">
              {weeklyMissions.map((r, index) => (
                <MissionCard key={r.am.defId} entry={r} ctx={ctx} currency={currency} onComplete={() => handleClaim(r.am.defId)} index={index} replay={replay} />
              ))}
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between pb-10">
            {achievements.map(a => (
              <Animated.View
                key={a.id}
                entering={ZoomIn.springify()}
                className={`mb-3 w-[31%] flex-col items-center gap-1.5 rounded-3xl p-4 text-center ${
                  a.unlocked ? 'bg-tertiary-container' : 'bg-surface-container-low opacity-50'
                }`}
                style={a.unlocked ? { borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' } : {}}
              >
                <Text className="text-3xl">{a.icon}</Text>
                <Text className="text-xs font-bold text-on-surface text-center leading-tight">{a.title}</Text>
                <Text className="text-[9px] text-on-surface-variant text-center leading-tight">{a.description}</Text>
              </Animated.View>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
      {confettiActive && <SkiaConfetti progress={confettiProgress} width={windowWidth} height={windowHeight} />}
    </SafeAreaView>
    </ScreenTransition>
  );
}

function SegmentedControl({
  tab,
  onChange,
}: {
  tab: 'missions' | 'achievements';
  onChange: (t: 'missions' | 'achievements') => void;
}) {
  const [segmentWidth, setSegmentWidth] = useState(0);
  const indicator = useSharedValue(tab === 'missions' ? 0 : 1);

  useEffect(() => {
    indicator.value = withSpring(tab === 'missions' ? 0 : 1, springPresets.press);
  }, [tab]);

  const onLayout = (e: LayoutChangeEvent) => {
    setSegmentWidth(e.nativeEvent.layout.width / 2);
  };

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value * segmentWidth }],
  }));

  return (
    <View className="mb-6 flex-row rounded-full bg-surface-container-low p-1" onLayout={onLayout}>
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              width: segmentWidth - 8,
              borderRadius: 999,
              backgroundColor: '#1D4ED8',
            },
            pillStyle,
          ]}
        />
      )}
      <PressableScale onPress={() => onChange('missions')} style={{ flex: 1 }}>
        <View className="rounded-full py-3 items-center">
          <Text className={`text-sm font-bold ${tab === 'missions' ? 'text-primary-foreground' : 'text-on-surface-variant'}`}>
            Missions
          </Text>
        </View>
      </PressableScale>
      <PressableScale onPress={() => onChange('achievements')} style={{ flex: 1 }}>
        <View className="rounded-full py-3 flex-row items-center justify-center gap-2">
          <Trophy size={14} color={tab === 'achievements' ? '#FFFFFF' : '#64748B'} />
          <Text className={`text-sm font-bold ${tab === 'achievements' ? 'text-primary-foreground' : 'text-on-surface-variant'}`}>
            Badges
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

/** Ambient "tap me" breathing ring for the ready state — state-driven, not gesture-driven, so a looping withTiming is the right tool (guide §3 rule 3). */
function PulsingRing({ children }: { children: React.ReactNode }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => {
      pulse.value = 0;
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
    opacity: 1 - pulse.value * 0.15,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

const CARD_STATE_STYLES: Record<CardState, { row: string; circle: string; dimmed: boolean }> = {
  claimed: { row: 'bg-tertiary-container', circle: 'border-tertiary bg-tertiary', dimmed: false },
  ready: { row: 'bg-primary-container border border-primary/30', circle: 'border-primary bg-transparent', dimmed: false },
  locked: { row: 'bg-surface border border-outline-variant', circle: 'border-outline bg-transparent', dimmed: true },
  manual: { row: 'bg-surface border border-outline-variant', circle: 'border-outline bg-transparent', dimmed: false },
};

function formatProgress(progress: { current: number; target: number; isCurrency: boolean }, currency: string): string {
  if (progress.isCurrency) {
    return `${formatCurrency(Math.max(0, progress.current), currency)} of ${formatCurrency(progress.target, currency)} saved`;
  }
  const current = Math.max(0, Math.min(progress.current, progress.target));
  return `${current} of ${progress.target}`;
}

function MissionCard({
  entry,
  ctx,
  currency,
  onComplete,
  index = 0,
  replay,
}: {
  entry: ResolvedMission;
  ctx: MissionContext;
  currency: string;
  onComplete: () => void;
  index?: number;
  replay: SharedValue<number>;
}) {
  const { am, def } = entry;
  const state = getCardState(am, def, ctx);
  const copy = renderMissionCopy(def, ctx, (n) => formatCurrency(n, currency));
  const progress = state === 'locked' || state === 'ready' ? getMissionProgress(def, ctx) : null;
  const styles = CARD_STATE_STYLES[state];

  const circle = (
    <PressableScale onPress={onComplete} disabled={state === 'claimed' || state === 'locked'}>
      <View className={`h-10 w-10 items-center justify-center rounded-full border-2 ${styles.circle}`}>
        {state === 'claimed' && (
          <Animated.View entering={ZoomIn.springify()}>
            <Check size={16} color="#FFFFFF" />
          </Animated.View>
        )}
        {state === 'locked' && <Lock size={14} color="#94A3B8" />}
      </View>
    </PressableScale>
  );

  return (
    <FadeInStagger index={index} delayStep={100} replay={replay}>
      <View
        className={`gap-3 rounded-2xl p-4 min-h-[72px] ${styles.row}`}
        style={state === 'claimed' || state === 'ready' ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}
      >
        <View className="flex-row items-center gap-4">
          {state === 'ready' ? <PulsingRing>{circle}</PulsingRing> : circle}
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text className={`text-sm font-bold ${state === 'claimed' ? 'line-through text-on-surface-variant' : styles.dimmed ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                {copy.title}
              </Text>
              {state === 'manual' && (
                <View className="rounded-full bg-surface-container px-2 py-0.5">
                  <Text className="text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">On your honour</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-on-surface-variant">
              {progress ? formatProgress(progress, currency) : copy.description}
            </Text>
          </View>
          <View className="bg-primary-container rounded-full px-3 py-1">
            <Text className="text-xs font-bold text-primary">+{def.reward} XP</Text>
          </View>
        </View>
        {progress && progress.target > 0 && (
          <AnimatedProgressBar progress={Math.max(0, Math.min(1, progress.current / progress.target))} height={6} />
        )}
      </View>
    </FadeInStagger>
  );
}
