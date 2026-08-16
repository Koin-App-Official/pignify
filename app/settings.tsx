/**
 * Settings hub — pushed as a modal from Profile. Account / Security /
 * Subscription / Support sections. Subscription card, Change PIN, and the
 * app-version footer were relocated here from profile.tsx (which keeps only
 * profile display + notification toggles).
 */
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  LogOut,
  Trash2,
  Lock,
  Timer,
  Crown,
  ChevronRight,
  ChevronLeft,
  FileText,
  ShieldCheck,
  Mail,
  X,
} from 'lucide-react-native';

import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { getPlanConfig, formatUSD } from '@/lib/entitlements';
import { ScreenTransition } from '@/components/ScreenTransition';
import { FadeInStagger } from '@/components/animation/FadeInStagger';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 9,
  elevation: 4,
};

const PRIVACY_URL = 'https://piggnify.com/privacy-policy';
const TERMS_URL = 'https://piggnify.com/terms-of-service';
const SUPPORT_EMAIL = 'support@piggnify.com';

/**
 * Linking.openURL rejects (unhandled promise) when there's no app registered
 * to handle the URL — e.g. no Mail account configured on the Simulator.
 * canOpenURL first lets us fail with a friendly alert instead of a crash log.
 */
async function safeOpenURL(url: string, notAvailableMessage: string) {
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

const AUTO_LOCK_OPTIONS: { label: string; value: 0 | 1 | 5 | null }[] = [
  { label: 'Immediately', value: 0 },
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: 'Never', value: null },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-[9px] ml-[5px] text-[14px] font-bold uppercase tracking-widest text-on-surface-variant/60">
      {children}
    </Text>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center justify-between py-4"
    >
      <View className="flex-row items-center gap-[14px]">
        {icon}
        <Text className={`text-[16px] font-semibold ${destructive ? 'text-destructive' : 'text-on-surface'}`}>
          {label}
        </Text>
      </View>
      <ChevronRight size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
}

export default function Settings() {
  const router = useRouter();
  const profile = useStore((state) => state.profile);
  const updateProfile = useStore((state) => state.updateProfile);
  const logout = useAuthLock((state) => state.logout);

  const planConfig = getPlanConfig(profile.plan);
  const pendingConfig = profile.pendingPlan ? getPlanConfig(profile.pendingPlan) : null;

  const handleLogout = () => {
    Alert.alert('Log out', 'You can log back in anytime with your email.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center px-6 pt-6 pb-5">
          <TouchableOpacity onPress={() => router.back()} className="p-[5px] -ml-[5px]" hitSlop={14}>
            <ChevronLeft size={25} color="#0F172A" />
          </TouchableOpacity>
          <Text className="ml-[10px] text-[23px] font-black text-on-surface">Settings</Text>
        </View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 140 }}>
          {/* Subscription */}
          <FadeInStagger index={0} delayStep={60}>
            <SectionLabel>Subscription</SectionLabel>
            <TouchableOpacity
              onPress={() => router.push('/plans')}
              className="mb-7 rounded-2xl bg-surface-container-low p-6"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-[14px] flex-1">
                  <View className="h-[45px] w-[45px] items-center justify-center rounded-2xl bg-primary-container">
                    <Crown size={20} color="#1D4ED8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[16px] font-bold text-on-surface">{planConfig.displayName} plan</Text>
                    <Text className="text-[14px] font-medium text-on-surface-variant mt-[2px]">
                      {profile.planStatus === 'canceled'
                        ? 'Canceled — active until period end'
                        : profile.planStatus === 'expired'
                          ? 'Free trial ended'
                          : profile.planStatus === 'trialing'
                            ? 'Free trial'
                            : pendingConfig
                              ? `Switching to ${pendingConfig.displayName} next cycle`
                              : `${formatUSD(planConfig.priceUSD)}/mo`}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-[5px]">
                  <Text className="text-[14px] font-bold text-primary">Manage</Text>
                  <ChevronRight size={18} color="#1D4ED8" />
                </View>
              </View>
            </TouchableOpacity>
          </FadeInStagger>

          {/* Security */}
          <FadeInStagger index={1} delayStep={60}>
            <SectionLabel>Security</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              <Row
                icon={<Lock size={18} color="#64748B" />}
                label="Change PIN"
                onPress={() => router.push('/change-pin')}
              />
              <View className="h-px bg-outline/10" />
              <View className="py-4">
                <View className="flex-row items-center gap-[14px] mb-[14px]">
                  <Timer size={18} color="#64748B" />
                  <Text className="text-[16px] font-semibold text-on-surface">Auto-lock</Text>
                </View>
                <View className="flex-row gap-[9px]">
                  {AUTO_LOCK_OPTIONS.map((opt) => {
                    const active = profile.autoLockMinutes === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => updateProfile({ autoLockMinutes: opt.value })}
                        className={`flex-1 items-center rounded-[14px] py-[9px] px-1 ${active ? 'bg-primary' : 'bg-surface-container'}`}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          className={`text-[14px] font-bold ${active ? 'text-primary-foreground' : 'text-on-surface-variant'}`}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </FadeInStagger>

          {/* Account */}
          <FadeInStagger index={2} delayStep={60}>
            <SectionLabel>Account</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              <Row icon={<LogOut size={18} color="#64748B" />} label="Log out" onPress={handleLogout} />
              <View className="h-px bg-outline/10" />
              <Row
                icon={<Trash2 size={18} color="#DC2626" />}
                label="Delete account"
                destructive
                onPress={() => router.push('/delete-account')}
              />
            </View>
          </FadeInStagger>

          {/* Support & About */}
          <FadeInStagger index={3} delayStep={60}>
            <SectionLabel>Support & About</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              {PRIVACY_URL ? (
                <>
                  <Row
                    icon={<ShieldCheck size={18} color="#64748B" />}
                    label="Privacy Policy"
                    onPress={() => safeOpenURL(PRIVACY_URL, 'Could not open the Privacy Policy link.')}
                  />
                  <View className="h-px bg-outline/10" />
                </>
              ) : null}
              {TERMS_URL ? (
                <>
                  <Row
                    icon={<FileText size={18} color="#64748B" />}
                    label="Terms of Service"
                    onPress={() => safeOpenURL(TERMS_URL, 'Could not open the Terms of Service link.')}
                  />
                  <View className="h-px bg-outline/10" />
                </>
              ) : null}
              {SUPPORT_EMAIL ? (
                <Row
                  icon={<Mail size={18} color="#64748B" />}
                  label="Contact Support"
                  onPress={() =>
                    safeOpenURL(
                      `mailto:${SUPPORT_EMAIL}`,
                      `No email app is set up on this device. Reach us at ${SUPPORT_EMAIL}.`
                    )
                  }
                />
              ) : null}
              {!PRIVACY_URL && !TERMS_URL && !SUPPORT_EMAIL ? (
                <View className="py-4">
                  <Text className="text-[14px] font-medium text-on-surface-variant/60">
                    Support links not configured yet.
                  </Text>
                </View>
              ) : null}
            </View>
          </FadeInStagger>

          <FadeInStagger index={4} delayStep={60}>
            <View className="mb-[54px] items-center">
              <Text className="text-[11px] text-on-surface-variant/40 uppercase tracking-widest">
                Piggy v{Constants.expoConfig?.version || '1.0.0'}
              </Text>
            </View>
          </FadeInStagger>
        </ScrollView>

        {/*
          Close FAB — same size/style/right-offset as the Settings FAB on Profile.
          Profile is a TAB screen, so its FAB sits 24px above the 80px tab bar
          (bottom-6, relative to the tab content area which already excludes the
          bar). Settings has no tab bar under it, so matching that same visual
          height from the true screen bottom requires 80 (tab bar) + 24 = 104px.
        */}
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute right-5 z-40 h-14 w-14 items-center justify-center rounded-2xl bg-primary"
          style={{ ...CARD_SHADOW, shadowOpacity: 0.2, bottom: 104 }}
        >
          <X size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>
    </ScreenTransition>
  );
}
