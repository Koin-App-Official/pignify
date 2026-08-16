/**
 * Linking.openURL rejects (unhandled promise) when there's no app registered
 * to handle the URL — e.g. no Mail account configured on the Simulator.
 * canOpenURL first lets us fail with a friendly alert instead of a crash log.
 */
import { Alert, Linking } from 'react-native';

export const SUPPORT_EMAIL = 'support@piggnify.com';

export async function safeOpenURL(url: string, notAvailableMessage: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Not available', notAvailableMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Not available', notAvailableMessage);
  }
}
