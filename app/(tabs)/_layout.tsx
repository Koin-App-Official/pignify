import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Home, Target, Zap, MessageCircle, User } from 'lucide-react-native';
import { AppState, View } from 'react-native';
import { useStore } from '@/lib/store';

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
          tabBarIcon: ({ color, focused }) => (
            <View className={`w-16 h-9 items-center justify-center rounded-2xl ${focused ? 'bg-primary-container' : ''}`}>
              <Home size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, focused }) => (
            <View className={`w-16 h-9 items-center justify-center rounded-2xl ${focused ? 'bg-primary-container' : ''}`}>
              <Target size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          title: 'Missions',
          tabBarIcon: ({ color, focused }) => (
            <View className={`w-16 h-9 items-center justify-center rounded-2xl ${focused ? 'bg-primary-container' : ''}`}>
              <Zap size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, focused }) => (
            <View className={`w-16 h-9 items-center justify-center rounded-2xl ${focused ? 'bg-primary-container' : ''}`}>
              <MessageCircle size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View className={`w-16 h-9 items-center justify-center rounded-2xl ${focused ? 'bg-primary-container' : ''}`}>
              <User size={24} color={focused ? '#1D4ED8' : color} strokeWidth={focused ? 2.2 : 1.6} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
