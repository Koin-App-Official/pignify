import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { Zap, Trophy, Check } from 'lucide-react-native';
import { useStore, Mission } from '@/lib/store';
import ConfettiCannon from 'react-native-confetti-cannon';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useFocusKey } from '@/hooks/useFocusKey';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

export default function Missions() {
  const missions = useStore((state) => state.missions);
  const achievements = useStore((state) => state.achievements);
  const profile = useStore((state) => state.profile);
  const completeMissionAction = useStore((state) => state.completeMission);
  const addXP = useStore((state) => state.addXP);
  const unlockAchievement = useStore((state) => state.unlockAchievement);

  const [tab, setTab] = useState<'missions' | 'achievements'>('missions');
  const animKey = useFocusKey();
  const [smallConfetti, setSmallConfetti] = useState<boolean>(false);

  const completeMission = (m: Mission) => {
    completeMissionAction(m.id);
    addXP(m.reward);

    setSmallConfetti(true);
    setTimeout(() => setSmallConfetti(false), 2000);

    const currentMissions = useStore.getState().missions;
    const completedCount = currentMissions.filter(x => x.completed).length;
    if (completedCount >= 5) {
      unlockAchievement('a4');
    }
  };

  const dailyMissions = missions.filter(m => m.type === 'daily');
  const weeklyMissions = missions.filter(m => m.type === 'weekly');
  const completedCount = missions.filter(m => m.completed).length;

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 py-6">
        <View key={animKey}>
        <Text className="mb-1 text-2xl font-black text-on-surface">Missions</Text>
        <Text className="mb-6 text-sm font-medium text-on-surface-variant">Complete missions to earn XP and build habits</Text>

        {/* Level bar */}
        <View className="mb-6 rounded-2xl bg-surface-container-low p-4" style={CARD_SHADOW}>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Zap size={18} color="#22C55E" />
              <Text className="text-sm font-bold text-on-surface">Saver Lv.{profile.level}</Text>
            </View>
            <Text className="text-xs font-bold text-on-surface-variant">{profile.xp % 100}/100 XP</Text>
          </View>
          <View className="h-2.5 w-full rounded-full bg-surface-container overflow-hidden">
            <View className="h-2.5 rounded-full bg-primary" style={{ width: `${profile.xp % 100}%` }} />
          </View>
          <Text className="mt-3 text-xs font-medium text-on-surface-variant">{completedCount}/{missions.length} missions completed</Text>
        </View>

        {/* Segmented Button */}
        <View className="mb-6 flex-row rounded-full bg-surface-container-low p-1">
          <TouchableOpacity
            onPress={() => setTab('missions')}
            className={`flex-1 rounded-full py-3 items-center ${
              tab === 'missions' ? 'bg-primary' : 'bg-transparent'
            }`}
          >
            <Text className={`text-sm font-bold ${tab === 'missions' ? 'text-primary-foreground' : 'text-on-surface-variant'}`}>
              Missions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('achievements')}
            className={`flex-1 rounded-full py-3 flex-row items-center justify-center gap-2 ${
              tab === 'achievements' ? 'bg-primary' : 'bg-transparent'
            }`}
          >
            <Trophy size={14} color={tab === 'achievements' ? '#FFFFFF' : '#64748B'} />
            <Text className={`text-sm font-bold ${tab === 'achievements' ? 'text-primary-foreground' : 'text-on-surface-variant'}`}>
              Badges
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'missions' ? (
          <View className="pb-10">
            <Text className="mb-3 text-sm font-bold text-on-surface-variant uppercase tracking-wide">Daily Missions</Text>
            <View className="mb-6 gap-3">
              {dailyMissions.map((m, index) => (
                <MissionCard key={m.id} mission={m} onComplete={() => completeMission(m)} index={index} />
              ))}
            </View>
            <Text className="mb-3 text-sm font-bold text-on-surface-variant uppercase tracking-wide">Weekly Missions</Text>
            <View className="mb-6 gap-3">
              {weeklyMissions.map((m, index) => (
                <MissionCard key={m.id} mission={m} onComplete={() => completeMission(m)} index={index} />
              ))}
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between pb-10">
            {achievements.map(a => (
              <MotiView
                key={a.id}
                from={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`mb-3 w-[31%] flex-col items-center gap-1.5 rounded-3xl p-4 text-center ${
                  a.unlocked ? 'bg-tertiary-container' : 'bg-surface-container-low opacity-50'
                }`}
                style={a.unlocked ? { borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' } : {}}
              >
                <Text className="text-3xl">{a.icon}</Text>
                <Text className="text-xs font-bold text-on-surface text-center leading-tight">{a.title}</Text>
                <Text className="text-[9px] text-on-surface-variant text-center leading-tight">{a.description}</Text>
              </MotiView>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
      {smallConfetti && <ConfettiCannon count={50} origin={{x: -10, y: 0}} fallSpeed={3000} />}
    </SafeAreaView>
    </ScreenTransition>
  );
}

function MissionCard({ mission, onComplete, index = 0 }: { mission: Mission; onComplete: () => void; index?: number }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: index * 100 }}
      className={`flex-row items-center gap-4 rounded-2xl p-4 min-h-[72px] ${
        mission.completed ? 'bg-tertiary-container' : 'bg-surface border border-outline-variant'
      }`}
      style={mission.completed ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}
    >
      <TouchableOpacity
        onPress={onComplete}
        disabled={mission.completed}
        className={`h-10 w-10 items-center justify-center rounded-full border-2 ${
          mission.completed
            ? 'border-tertiary bg-tertiary'
            : 'border-outline bg-transparent'
        }`}
      >
        {mission.completed && <Check size={16} color="#FFFFFF" />}
      </TouchableOpacity>
      <View className="flex-1">
        <Text className={`text-sm font-bold mb-1 ${mission.completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
          {mission.title}
        </Text>
        <Text className="text-xs text-on-surface-variant">{mission.description}</Text>
      </View>
      <View className="bg-primary-container rounded-full px-3 py-1">
        <Text className="text-xs font-bold text-primary">+{mission.reward} XP</Text>
      </View>
    </MotiView>
  );
}
