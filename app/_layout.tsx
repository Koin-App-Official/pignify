import '../global.css';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';

// React Native 0.81 uses its own deprecated SafeAreaView internally (LogBox UI).
// Our app already uses react-native-safe-area-context everywhere — this warning
// is a false positive from RN internals and cannot be fixed in userland.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  );
}
