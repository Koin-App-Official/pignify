/**
 * Settings hub — pushed as a modal from Profile. Account / Security /
 * Subscription / Support sections. Subscription card, Change PIN, and the
 * app-version footer were relocated here from profile.tsx (which keeps only
 * profile display + notification toggles).
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
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
  FingerprintPattern as Fingerprint,
  ScanFace,
  Globe,
} from 'lucide-react-native';

import { useStore } from '@/lib/store';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n/detect';
import { useAuthLock } from '@/lib/authLock';
import { getPlanConfig, formatUSD } from '@/lib/entitlements';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricKind,
  disableBiometric,
  type BiometricKind,
} from '@/lib/biometrics';
import { safeOpenURL, SUPPORT_EMAIL } from '@/lib/linking';
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

const AUTO_LOCK_OPTIONS: { labelKey: 'immediately' | 'oneMin' | 'fiveMin' | 'never'; value: 0 | 1 | 5 | null }[] = [
  { labelKey: 'immediately', value: 0 },
  { labelKey: 'oneMin', value: 1 },
  { labelKey: 'fiveMin', value: 5 },
  { labelKey: 'never', value: null },
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
  const { t } = useTranslation(['settings', 'common']);
  const profile = useStore((state) => state.profile);
  const updateProfile = useStore((state) => state.updateProfile);
  const refreshNotifications = useStore((state) => state.refreshNotifications);
  const logout = useAuthLock((state) => state.logout);

  const planConfig = getPlanConfig(profile.plan);
  const pendingConfig = profile.pendingPlan ? getPlanConfig(profile.pendingPlan) : null;

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('none');
  const [bioEnabled, setBioEnabled] = useState(false);

  // Re-read on every focus: covers both the initial mount and returning from
  // /enable-biometric after a successful PIN confirmation.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [available, enabled, kind] = await Promise.all([
          isBiometricAvailable(),
          isBiometricEnabled(),
          getBiometricKind(),
        ]);
        if (cancelled) return;
        setBioAvailable(available);
        setBioEnabled(enabled);
        setBioKind(kind);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const bioLabel = bioKind === 'face' ? t('biometric.faceId') : bioKind === 'iris' ? t('biometric.irisUnlock') : t('biometric.fingerprintUnlock');
  const BioIcon = bioKind === 'face' ? ScanFace : Fingerprint;

  const handleBiometricToggle = (next: boolean) => {
    if (next) {
      router.push('/enable-biometric');
      return;
    }
    Alert.alert(t('biometric.turnOffTitle', { label: bioLabel }), t('biometric.turnOffBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('biometric.turnOff'),
        style: 'destructive',
        onPress: async () => {
          await disableBiometric();
          setBioEnabled(false);
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('logOut'), t('logOutConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logOut'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScreenTransition>
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center px-6 pt-6 pb-5">
          <TouchableOpacity onPress={() => router.back()} className="p-[5px] -ml-[5px]" hitSlop={14}>
            <ChevronLeft size={25} color="#0F172A" />
          </TouchableOpacity>
          <Text className="ml-[10px] text-[23px] font-black text-on-surface">{t('title')}</Text>
        </View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 140 }}>
          {/* Subscription */}
          <FadeInStagger index={0} delayStep={60}>
            <SectionLabel>{t('sections.subscription')}</SectionLabel>
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
                    <Text className="text-[16px] font-bold text-on-surface">{t('planLabel', { plan: planConfig.displayName })}</Text>
                    <Text className="text-[14px] font-medium text-on-surface-variant mt-[2px]">
                      {profile.planStatus === 'canceled'
                        ? t('planStatus.canceled')
                        : profile.planStatus === 'expired'
                          ? t('planStatus.expired')
                          : profile.planStatus === 'trialing'
                            ? t('planStatus.trialing')
                            : profile.planStatus === 'past_due'
                              ? t('planStatus.pastDue')
                              : pendingConfig
                                ? t('planStatus.switchingTo', { plan: pendingConfig.displayName })
                                : t('planStatus.priceMonthly', { price: formatUSD(planConfig.priceUSD) })}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-[5px]">
                  <Text className="text-[14px] font-bold text-primary">{t('manage')}</Text>
                  <ChevronRight size={18} color="#1D4ED8" />
                </View>
              </View>
            </TouchableOpacity>
          </FadeInStagger>

          {/* Security */}
          <FadeInStagger index={1} delayStep={60}>
            <SectionLabel>{t('sections.security')}</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              <Row
                icon={<Lock size={18} color="#64748B" />}
                label={t('changePin')}
                onPress={() => router.push('/change-pin')}
              />
              {bioAvailable ? (
                <>
                  <View className="h-px bg-outline/10" />
                  <View className="flex-row items-center justify-between py-4">
                    <View className="flex-row items-center gap-[14px]">
                      <BioIcon size={18} color="#64748B" />
                      <Text className="text-[16px] font-semibold text-on-surface">{bioLabel}</Text>
                    </View>
                    <Switch
                      value={bioEnabled}
                      onValueChange={handleBiometricToggle}
                      trackColor={{ false: '#CBD5E1', true: '#1D4ED8' }}
                      thumbColor={'#ffffff'}
                    />
                  </View>
                </>
              ) : null}
              <View className="h-px bg-outline/10" />
              <View className="py-4">
                <View className="flex-row items-center gap-[14px] mb-[14px]">
                  <Timer size={18} color="#64748B" />
                  <Text className="text-[16px] font-semibold text-on-surface">{t('autoLock.label')}</Text>
                </View>
                <View className="flex-row gap-[9px]">
                  {AUTO_LOCK_OPTIONS.map((opt) => {
                    const active = profile.autoLockMinutes === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.labelKey}
                        onPress={() => updateProfile({ autoLockMinutes: opt.value })}
                        className={`flex-1 items-center rounded-[14px] py-[9px] px-1 ${active ? 'bg-primary' : 'bg-surface-container'}`}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          className={`text-[14px] font-bold ${active ? 'text-primary-foreground' : 'text-on-surface-variant'}`}
                        >
                          {t(`autoLock.${opt.labelKey}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </FadeInStagger>

          {/* Language */}
          <FadeInStagger index={2} delayStep={60}>
            <SectionLabel>{t('language.sectionLabel')}</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              <View className="py-4">
                <View className="flex-row items-center gap-[14px] mb-[14px]">
                  <Globe size={18} color="#64748B" />
                  <Text className="text-[16px] font-semibold text-on-surface">{t('language.sectionLabel')}</Text>
                </View>
                <View className="flex-row gap-[9px]">
                  {SUPPORTED_LANGUAGES.map((code) => {
                    const active = profile.language === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        onPress={() => {
                          updateProfile({ language: code });
                          // Local notifications are rendered at schedule time, not fire
                          // time — without this, already-queued notifications would keep
                          // showing the old language until the next unrelated reschedule.
                          refreshNotifications();
                        }}
                        className={`flex-1 items-center rounded-[14px] py-[9px] px-1 ${active ? 'bg-primary' : 'bg-surface-container'}`}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          className={`text-[14px] font-bold ${active ? 'text-primary-foreground' : 'text-on-surface-variant'}`}
                        >
                          {t(`language.${code}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </FadeInStagger>

          {/* Account */}
          <FadeInStagger index={3} delayStep={60}>
            <SectionLabel>{t('sections.account')}</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              <Row icon={<LogOut size={18} color="#64748B" />} label={t('logOut')} onPress={handleLogout} />
              <View className="h-px bg-outline/10" />
              <Row
                icon={<Trash2 size={18} color="#DC2626" />}
                label={t('deleteAccount')}
                destructive
                onPress={() => router.push('/delete-account')}
              />
            </View>
          </FadeInStagger>

          {/* Support & About */}
          <FadeInStagger index={4} delayStep={60}>
            <SectionLabel>{t('sections.supportAndAbout')}</SectionLabel>
            <View className="mb-7 rounded-2xl bg-surface-container-low px-6" style={CARD_SHADOW}>
              {PRIVACY_URL ? (
                <>
                  <Row
                    icon={<ShieldCheck size={18} color="#64748B" />}
                    label={t('support.privacyPolicy')}
                    onPress={() => safeOpenURL(PRIVACY_URL, t('support.privacyPolicyError'), t('common:notAvailable'))}
                  />
                  <View className="h-px bg-outline/10" />
                </>
              ) : null}
              {TERMS_URL ? (
                <>
                  <Row
                    icon={<FileText size={18} color="#64748B" />}
                    label={t('support.termsOfService')}
                    onPress={() => safeOpenURL(TERMS_URL, t('support.termsOfServiceError'), t('common:notAvailable'))}
                  />
                  <View className="h-px bg-outline/10" />
                </>
              ) : null}
              {SUPPORT_EMAIL ? (
                <Row
                  icon={<Mail size={18} color="#64748B" />}
                  label={t('support.contactSupport')}
                  onPress={() =>
                    safeOpenURL(
                      `mailto:${SUPPORT_EMAIL}`,
                      t('common:noEmailApp', { email: SUPPORT_EMAIL }),
                      t('common:notAvailable')
                    )
                  }
                />
              ) : null}
              {!PRIVACY_URL && !TERMS_URL && !SUPPORT_EMAIL ? (
                <View className="py-4">
                  <Text className="text-[14px] font-medium text-on-surface-variant/60">
                    {t('support.notConfigured')}
                  </Text>
                </View>
              ) : null}
            </View>
          </FadeInStagger>

          <FadeInStagger index={5} delayStep={60}>
            <View className="mb-[54px] items-center">
              <Text className="text-[11px] text-on-surface-variant/40 uppercase tracking-widest">
                {t('versionLabel', { version: Constants.expoConfig?.version || '1.0.0' })}
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
