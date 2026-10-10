/**
 * Linking.openURL rejects (unhandled promise) when there's no app registered
 * to handle the URL — e.g. no Mail account configured on the Simulator.
 * canOpenURL first lets us fail with a friendly alert instead of a crash log.
 */
import { Alert, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export const SUPPORT_EMAIL = 'support@piggnify.com';
/** Single source of truth for the legal URLs — previously duplicated across
 * app/settings.tsx and app/onboarding.tsx (App Review Phase 5, see
 * implementations/APP_REVIEW_BLOCKERS.md). */
export const PRIVACY_URL = 'https://piggnify.com/privacy-policy';
export const TERMS_URL = 'https://piggnify.com/terms-of-service';
/** Single source of truth for the AI Transparency page — referenced by the
 * onboarding legal links and by AiConsentModal (App Review 5.1.2(i)). */
export const AI_TRANSPARENCY_URL = 'https://piggnify.com/ai-transparency';
/**
 * Web billing / account management (#173). The app has no purchase path of its
 * own — subscribing, changing plan, cancelling and buying extra AI messages all
 * happen here. Deliberately a plain constant like the three URLs above rather
 * than an env var: an env var that can go missing is exactly how the lockout
 * trap documented in planGate.ts came about, and this one is the only way a
 * locked-out user can get their subscription back.
 */
export const ACCOUNT_URL = 'https://piggnify.com/account/';
/** `ACCOUNT_URL` as something a user can read off the screen and type — the
 * locked plan gate shows it as the label of its link, so the address is still
 * visible if the in-app browser can't open. */
export const ACCOUNT_URL_DISPLAY = ACCOUNT_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

export async function safeOpenURL(url: string, notAvailableMessage: string, notAvailableTitle: string) {
  try {
    // Legal/informational pages open in an in-app browser (SFSafariViewController
    // / Custom Tabs) instead of a full context-switch to Safari — every http(s)
    // link routed through this helper gets this for free (App Review 4.0 design
    // guidance, audit note 13). Non-http schemes (mailto:, tel:, the app's own
    // deep-link scheme) still need the system Linking API, which WebBrowser
    // doesn't handle.
    if (/^https?:\/\//i.test(url)) {
      await WebBrowser.openBrowserAsync(url);
      return;
    }
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(notAvailableTitle, notAvailableMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert(notAvailableTitle, notAvailableMessage);
  }
}
