import '../global.css';
import { useEffect } from 'react';
import { LogBox, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { AuthGate } from '@/components/auth/AuthGate';
import { initNotifications } from '@/lib/notifications';

// React Native 0.81 uses its own deprecated SafeAreaView internally (LogBox UI).
// Our app already uses react-native-safe-area-context everywhere — this warning
// is a false positive from RN internals and cannot be fixed in userland.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    initNotifications();
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type;
      if (type === 'trial-ending') {
        router.push('/plans');
      } else if (type === 'daily-checkin') {
        router.push('/(tabs)?openExpense=1');
      } else if (type === 'milestone') {
        router.push('/(tabs)/goals');
      } else {
        router.push('/(tabs)');
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return <View className="flex-1 bg-surface" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="plans" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="change-pin" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="delete-account" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthGate>
    </GestureHandlerRootView>
  );
}
