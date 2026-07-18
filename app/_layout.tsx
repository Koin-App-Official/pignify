import '../global.css';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { AuthGate } from '@/components/auth/AuthGate';

// React Native 0.81 uses its own deprecated SafeAreaView internally (LogBox UI).
// Our app already uses react-native-safe-area-context everywhere — this warning
// is a false positive from RN internals and cannot be fixed in userland.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="plans" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthGate>
    </GestureHandlerRootView>
  );
}
