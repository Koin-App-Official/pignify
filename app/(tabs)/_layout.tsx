import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Home, Target, Zap, MessageCircle, User, type LucideIcon } from 'lucide-react-native';
import { AppState, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useStore } from '@/lib/store';
import { springPresets } from '@/lib/springPresets';

function AnimatedTabIcon({ focused, color, Icon }: { focused: boolean; color: string; Icon: LucideIcon }) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, springPresets.press);
  }, [focused]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.8, 1]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.1]) }],
  }));

  return (
    <View className="w-16 h-9 items-center justify-center">
      <Animated.View className="absolute w-16 h-9 rounded-2xl bg-primary-container" style={pillStyle} />
      <Animated.View style={iconStyle}>
        <Icon size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
      </Animated.View>
    </View>
  );
}

const SYNC_URL = 'https://n8n.piggnify.com/webhook/claude-plan';
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export default function TabLayout() {
  const checkAndResetMissions = useStore((state) => state.checkAndResetMissions);
  const updateProfile = useStore((state) => state.updateProfile);
  const setLastProfileSync = useStore((state) => state.setLastProfileSync);

  const syncUserProfile = async () => {
    const { profile, lastProfileSync } = useStore.getState();
    if (!profile.userID) return;
    if (lastProfileSync && Date.now() - new Date(lastProfileSync).getTime() < SYNC_INTERVAL_MS) return;
    try {
      const res = await fetch(`${SYNC_URL}?user_id=${encodeURIComponent(profile.userID)}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;
      if (data.plan) updateProfile({ plan: data.plan });
      setLastProfileSync(new Date().toISOString());
    } catch {
      // silent failure — never block the UI
    }
  };

  useEffect(() => {
    checkAndResetMissions();
    syncUserProfile();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndResetMissions();
        syncUserProfile();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 80,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#1D4ED8',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon focused={focused} color={color} Icon={Home} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon focused={focused} color={color} Icon={Target} />,
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          title: 'Missions',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon focused={focused} color={color} Icon={Zap} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon focused={focused} color={color} Icon={MessageCircle} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon focused={focused} color={color} Icon={User} />,
        }}
      />
    </Tabs>
  );
}
