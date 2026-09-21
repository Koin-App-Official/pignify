import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Switch } from 'react-native';
import { ScreenTransition } from '@/components/ScreenTransition';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, RotateCcw, Pencil, Check, Plus, Trash2, Settings as SettingsIcon } from 'lucide-react-native';

import { useStore, EXPENSE_CATEGORIES, formatCurrency, type UserPlan, type IncomeSource } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { useEntitlements } from '@/hooks/useEntitlements';
import { gateInfo, type GateInfo } from '@/lib/entitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import { CapacityApplyModal, type CapacityApplyRow } from '@/components/CapacityApplyModal';
import { Button } from '@/components/ui/button';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { FadeInStagger } from '@/components/animation/FadeInStagger';
import { requestNotificationPermission, getNotificationPermissionStatus } from '@/lib/notifications';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';
import { Mascot } from '@/components/Mascot';
import { Icon } from '@/components/icons/Icon';
import { makeIncome, activeIncomes, totalIncome, totalSaveAside } from '@/lib/income';
import { pushIncome, deleteIncome } from '@/lib/incomeSync';
import { capacityApplyCandidates, type CapacityApplyCandidate } from '@/lib/goalMath';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 4,
};

export default function Profile() {
  const { t } = useTranslation('profile');
  const { t: tContent } = useTranslation('content');
  const router = useRouter();
  const { editIncome } = useLocalSearchParams<{ editIncome?: string }>();
  const profile = useStore((state) => state.profile);
  const goals = useStore((state) => state.goals);
  const achievements = useStore((state) => state.achievements);
  const updateProfile = useStore((state) => state.updateProfile);
  const updateGoal = useStore((state) => state.updateGoal);
  const capacityApplyPending = useStore((state) => state.capacityApplyPending);
  const clearCapacityApplyPending = useStore((state) => state.clearCapacityApplyPending);
  const refreshNotifications = useStore((state) => state.refreshNotifications);
  const resetForDemo = useStore((state) => state.resetForDemo);
  const resetLock = useAuthLock((state) => state.resetToLogin);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);

  // Multi-income list (#191 Phase 6). `editingIncomeId` is either the id of
  // the row currently being edited, `'new'` for the add-form, or `null` when
  // the list is in its plain display state — mirrors the single-inline-edit-
  // at-a-time pattern the name field already established, extended to "one
  // row or the add-form at a time".
  const [editingIncomeId, setEditingIncomeId] = useState<string | 'new' | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [saveAsideInput, setSaveAsideInput] = useState('');
  const [gate, setGate] = useState<GateInfo | null>(null);
  const { t: tPlans } = useTranslation('plans');
  const { incomes: incomeQuota, plan } = useEntitlements();

  // Goals offered a capacity-based date update (#191 D2/Phase 8). Empty =
  // sheet closed. Recomputed fresh after every capacity-affecting edit below
  // — there's no persisted "already asked" flag, so dismissing and then
  // making another such edit naturally re-offers rather than going silent.
  const [applyCandidates, setApplyCandidates] = useState<CapacityApplyCandidate[]>([]);
  const applyRows: CapacityApplyRow[] = applyCandidates.map((c) => ({
    goalId: c.goalId,
    goalName: goals.find((g) => g.id === c.goalId)?.name ?? '',
    oldDate: c.oldDate,
    newDate: c.newDate,
  }));

  const activeIncomeList = activeIncomes(profile.incomes);
  const totalIncomeAmount = totalIncome(profile.incomes);
  const totalSaveAsideAmount = totalSaveAside(profile.incomes);

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const unlockedBadges = achievements.filter((a) => a.unlocked).length;

  const toggleNotif = async (key: keyof typeof profile.notificationPrefs) => {
    const turningOn = !profile.notificationPrefs[key];
    if (turningOn) {
      const alreadyGranted = await getNotificationPermissionStatus();
      if (!alreadyGranted) {
        // Soft-ask before the hard OS prompt — explain the value first, since a bare
        // system dialog with no context converts worse and can't be re-shown if denied.
        const wantsToEnable = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t('notifications.softAskTitle'),
            t('notifications.softAskBody'),
            [
              { text: t('notifications.notNow'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('notifications.enable'), onPress: () => resolve(true) },
            ]
          );
        });
        if (!wantsToEnable) return;

        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(t('notifications.disabledTitle'), t('notifications.disabledBody'));
          return;
        }
      }
    }
    updateProfile({
      notificationPrefs: {
        ...profile.notificationPrefs,
        [key]: turningOn,
      },
    });
    refreshNotifications();
  };

  const handleReset = () => {
    Alert.alert(
      t('reset.title'),
      t('reset.body'),
      [
        { text: t('reset.cancel'), style: 'cancel' },
        {
          text: t('reset.confirm'),
          style: 'destructive',
          onPress: async () => {
            resetForDemo();
            // Keychain-backed PIN/session data lives outside the zustand/AsyncStorage
            // profile and outlives both resetForDemo() and even a full app delete on
            // iOS — must be wiped explicitly or the next launch re-locks to a dead PIN.
            await resetLock();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const expensesByCategory = profile.expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const saveName = () => {
    updateProfile({ name: nameInput.trim() });
    setEditingName(false);
  };

  const openEditIncome = (income: IncomeSource) => {
    setLabelInput(income.label);
    setAmountInput(String(income.amount));
    setSaveAsideInput(income.saveAmount != null ? String(income.saveAmount) : '');
    setEditingIncomeId(income.id);
  };

  const openAddIncome = () => {
    // Family gate (C6/C13): the limit stays visible and tappable, opening the
    // upgrade popup instead of the form, same pattern as goals.tsx's goal quota.
    if (!incomeQuota.allowed) {
      setGate(gateInfo('incomes', plan, tPlans));
      return;
    }
    setLabelInput('');
    setAmountInput('');
    setSaveAsideInput('');
    setEditingIncomeId('new');
  };

  // After any capacity-affecting edit (income amount/set-aside changed,
  // added, or removed — Phase 9 will also call this after an archive),
  // recompute which contribution-mode goals would now reach their target on
  // a different date and, if any, open the offer sheet. Read-only until the
  // user actually taps "Update goals" (applyCapacityToGoals below).
  const checkCapacityApply = (nextIncomes: IncomeSource[]) => {
    const capacity = totalSaveAside(nextIncomes);
    setApplyCandidates(capacityApplyCandidates(goals, capacity));
  };

  // Downgrade retention (#191 Phase 9) can archive incomes from a different
  // screen (downgrade-selection.tsx), which sets this flag rather than
  // checking directly — keeping that screen from ever rendering this sheet
  // itself is what guarantees it can never stack with the retention sheet.
  // Runs once per true transition (including "already true on mount" after a
  // restart) and immediately clears the flag either way, so it can't re-fire
  // on unrelated re-renders — unlike a raw `[profile.incomes]` dependency,
  // which would also fire from ordinary time passing (a goal's projected
  // date can drift from its stored one just by the calendar advancing, with
  // no capacity change at all).
  useEffect(() => {
    if (!capacityApplyPending) return;
    checkCapacityApply(profile.incomes);
    clearCapacityApplyPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacityApplyPending]);

  const applyCapacityToGoals = () => {
    for (const c of applyCandidates) {
      updateGoal(c.goalId, { monthlyContribution: c.newContribution, deadline: c.newDate });
    }
    setApplyCandidates([]);
  };

  const saveIncomeEdit = () => {
    const parsedAmount = Number(amountInput);
    if (!(parsedAmount > 0)) return;
    const trimmedSaveAside = saveAsideInput.trim();
    const parsedSaveAside = trimmedSaveAside === '' ? null : Number(trimmedSaveAside);
    const saveAmount =
      parsedSaveAside != null && !Number.isNaN(parsedSaveAside) && parsedSaveAside >= 0
        ? parsedSaveAside
        : null;
    const label = labelInput.trim() || t('income.defaultLabel');

    let updated: IncomeSource;
    let nextIncomes: IncomeSource[];
    if (editingIncomeId === 'new') {
      updated = makeIncome({ label, amount: parsedAmount, saveAmount });
      nextIncomes = [...profile.incomes, updated];
    } else {
      const existing = profile.incomes.find((i) => i.id === editingIncomeId);
      if (!existing) return;
      updated = { ...existing, label, amount: parsedAmount, saveAmount };
      nextIncomes = profile.incomes.map((i) => (i.id === editingIncomeId ? updated : i));
    }
    updateProfile({ incomes: nextIncomes, incomeSkipped: false });
    if (profile.userID) pushIncome(profile.userID, updated);
    setEditingIncomeId(null);
    checkCapacityApply(nextIncomes);
  };

  const removeIncome = (income: IncomeSource) => {
    Alert.alert(
      t('income.removeConfirmTitle'),
      t('income.removeConfirmBody'),
      [
        { text: t('income.removeConfirmCancel'), style: 'cancel' },
        {
          text: t('income.removeConfirmConfirm'),
          style: 'destructive',
          onPress: () => {
            const nextIncomes = profile.incomes.filter((i) => i.id !== income.id);
            updateProfile({ incomes: nextIncomes });
            deleteIncome(income.id);
            checkCapacityApply(nextIncomes);
          },
        },
      ]
    );
  };

  // Deep-linked from the dashboard's income-skipped nudge (?editIncome=1) —
  // open the first income for editing, or the add-form when the list is
  // empty, instead of leaving the user to find it themselves.
  useEffect(() => {
    if (editIncome !== '1') return;
    if (profile.incomes.length > 0) openEditIncome(profile.incomes[0]);
    else openAddIncome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIncome]);

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 96 }}>
        {/* User card */}
        <FadeInStagger index={0} delayStep={60}>
        <View className="mb-6 rounded-3xl bg-primary-container p-6 items-center" style={CARD_SHADOW}>
          <View className="mb-4 h-18 w-18 items-center justify-center rounded-full bg-primary/20" style={{ width: 72, height: 72 }}>
            <Mascot size={44} />
          </View>

          {editingName ? (
            <View className="flex-row items-center justify-center gap-2 mb-2">
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                className="w-36 h-10 text-center bg-primary/10 rounded-xl text-on-primary-container font-bold"
                style={TEXT_INPUT_CENTERING}
                autoFocus
                onSubmitEditing={saveName}
              />
              <TouchableOpacity
                onPress={saveName}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-primary/20"
                accessibilityRole="button"
                accessibilityLabel={t('common:a11y.save')}
              >
                <Check size={16} color="#1D4ED8" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)} className="flex-row items-center justify-center gap-2 mb-1">
              <Text className="text-2xl font-black text-on-primary-container">
                {profile.name || t('defaultName')}
              </Text>
              <Pencil size={14} color="#1D4ED8" />
            </TouchableOpacity>
          )}

          <View className="flex-row items-center gap-2 mb-2">
            <View className="bg-primary/20 rounded-full px-3 py-0.5">
              <Text className="text-sm font-bold text-on-primary-container">{t('levelLabel', { level: profile.level })}</Text>
            </View>
          </View>

          <Text className="text-sm font-medium text-on-primary-container/70 mb-5">
            {profile.personalityType
              ? t('personalitySuffix', { type: profile.personalityType.charAt(0).toUpperCase() + profile.personalityType.slice(1) })
              : t('financialExplorer')}
          </Text>

          <View className="w-full flex-row justify-between px-2">
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{formatCurrency(totalSaved, profile.currency)}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('totalSaved')}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{goals.length}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('goals')}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-black text-on-primary-container">{unlockedBadges}</Text>
              <Text className="text-xs font-medium text-on-primary-container/60 mt-1">{t('badges')}</Text>
            </View>
          </View>
        </View>
        </FadeInStagger>

        {/* Income */}
        <FadeInStagger index={1} delayStep={60}>
        <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
          <View className="flex-row items-center gap-2 mb-3">
            <CreditCard size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">{t('monthlyIncome')}</Text>
          </View>

          {profile.incomes.length === 0 && editingIncomeId !== 'new' && (
            <Text className="mb-3 text-sm font-medium text-on-surface-variant">{t('income.emptyState')}</Text>
          )}

          <View className="gap-4">
            {/* All incomes render here, active or archived (C7 — archived
                stays visible, never deleted; only excluded from totals,
                capacity and quota via activeIncomes()). Mirrors how goals.tsx
                already lists archived goals unfiltered. */}
            {profile.incomes.map((income) =>
              editingIncomeId === income.id ? (
                <IncomeEditForm
                  key={income.id}
                  currency={profile.currency}
                  labelInput={labelInput}
                  onLabelChange={setLabelInput}
                  amountInput={amountInput}
                  onAmountChange={setAmountInput}
                  saveAsideInput={saveAsideInput}
                  onSaveAsideChange={setSaveAsideInput}
                  onSave={saveIncomeEdit}
                  labelPlaceholder={t('income.labelPlaceholder')}
                  amountPlaceholder={t('onboarding:contribution.amountPlaceholder')}
                  setAsideCaption={`${t('income.setAsideLabel')} · ${t('income.setAsideHint')}`}
                  saveA11y={t('common:a11y.save')}
                />
              ) : (
                <View
                  key={income.id}
                  className={`flex-row items-center gap-2 ${income.archived ? 'opacity-50' : ''}`}
                >
                  <TouchableOpacity
                    onPress={() => openEditIncome(income)}
                    className="flex-1 flex-row items-center justify-between"
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-sm font-semibold text-on-surface" numberOfLines={1}>
                          {income.label}
                        </Text>
                        {income.archived && (
                          <View className="rounded-full bg-surface-container px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase text-on-surface-variant">
                              {t('income.archivedBadge')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-lg font-black text-on-surface">
                          {formatCurrency(income.amount, profile.currency)}
                        </Text>
                        <Pencil size={12} color="#1D4ED8" />
                      </View>
                      {income.saveAmount != null && income.saveAmount > 0 && (
                        <Text className="text-xs text-on-surface-variant">
                          {t('income.setAsideLabel')}: {formatCurrency(income.saveAmount, profile.currency)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeIncome(income)}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full"
                    accessibilityRole="button"
                    accessibilityLabel={t('income.removeA11y')}
                  >
                    <Trash2 size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              )
            )}

            {editingIncomeId === 'new' && (
              <IncomeEditForm
                currency={profile.currency}
                labelInput={labelInput}
                onLabelChange={setLabelInput}
                amountInput={amountInput}
                onAmountChange={setAmountInput}
                saveAsideInput={saveAsideInput}
                onSaveAsideChange={setSaveAsideInput}
                onSave={saveIncomeEdit}
                labelPlaceholder={t('income.labelPlaceholder')}
                amountPlaceholder={t('onboarding:contribution.amountPlaceholder')}
                setAsideCaption={`${t('income.setAsideLabel')} · ${t('income.setAsideHint')}`}
                saveA11y={t('common:a11y.save')}
                autoFocus
              />
            )}
          </View>

          {editingIncomeId === null && (
            <TouchableOpacity onPress={openAddIncome} className="mt-4 flex-row items-center gap-2 py-1">
              <Plus size={16} color="#1D4ED8" />
              <Text className="text-sm font-bold text-primary">{t('income.addButton')}</Text>
            </TouchableOpacity>
          )}

          {activeIncomeList.length > 0 && (
            <View className="mt-4 pt-4 gap-1" style={{ borderTopWidth: 1, borderTopColor: 'rgba(100,116,139,0.15)' }}>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-on-surface-variant">{t('income.totalIncomeLabel')}</Text>
                <Text className="text-sm font-bold text-on-surface">
                  {formatCurrency(totalIncomeAmount, profile.currency)}
                </Text>
              </View>
              {totalSaveAsideAmount > 0 && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-medium text-on-surface-variant">{t('income.totalSetAsideLabel')}</Text>
                  <Text className="text-sm font-bold text-on-surface">
                    {formatCurrency(totalSaveAsideAmount, profile.currency)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        </FadeInStagger>

        {/* Expense breakdown */}
        {Object.keys(expensesByCategory).length > 0 && (
          <FadeInStagger index={2} delayStep={60}>
          <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
            <Text className="mb-4 text-base font-bold text-on-surface">{t('expenseBreakdown')}</Text>
            <View className="gap-3">
              {Object.entries(expensesByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const c = EXPENSE_CATEGORIES.find((x) => x.id === cat);
                  return (
                    <View key={cat} className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        {c?.icon ? (
                          <Icon name={c.icon} size={22} />
                        ) : (
                          <Text className="text-xl">{c?.emoji || '📌'}</Text>
                        )}
                        <Text className="text-sm font-semibold text-on-surface">{c ? tContent(`expenseCategories.${c.id}`) : cat}</Text>
                      </View>
                      <Text className="text-sm font-bold text-on-surface">{formatCurrency(amount, profile.currency)}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
          </FadeInStagger>
        )}

        {/* Notifications */}
        <FadeInStagger index={3} delayStep={60}>
        <View className="mb-6 rounded-2xl bg-surface-container-low p-5" style={CARD_SHADOW}>
          <View className="flex-row items-center gap-2 mb-4">
            <Bell size={16} color="#64748B" />
            <Text className="text-sm font-bold text-on-surface">{t('notifications.title')}</Text>
          </View>
          <View className="gap-4">
            {(
              [
                ['paydayReminder', 'notifications.paydayReminder'],
                ['streakProtection', 'notifications.streakProtection'],
                ['milestoneAlerts', 'notifications.milestoneAlerts'],
                ['weeklyReflection', 'notifications.weeklyReflection'],
              ] as const
            ).map(([key, labelKey]) => (
              <View key={key} className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-on-surface">{t(labelKey)}</Text>
                <Switch
                  value={profile.notificationPrefs[key]}
                  onValueChange={() => toggleNotif(key)}
                  trackColor={{ false: '#CBD5E1', true: '#1D4ED8' }}
                  thumbColor={'#ffffff'}
                />
              </View>
            ))}
          </View>
        </View>
        </FadeInStagger>

        {/* Reset */}
        <FadeInStagger index={4} delayStep={60}>
        <Button
          variant="outline"
          onPress={handleReset}
          className="mb-12 w-full flex-row items-center justify-center gap-2 border-outline/50"
        >
          <RotateCcw size={14} color="#64748B" />
          <Text className="text-sm font-bold text-on-surface-variant">{t('reset.button')}</Text>
        </Button>
        </FadeInStagger>
      </ScrollView>

      {/* Settings FAB — fixed bottom-right, reachable one-handed regardless of scroll */}
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        className="absolute bottom-6 right-5 z-40 h-14 w-14 items-center justify-center rounded-2xl bg-primary"
        style={{ ...CARD_SHADOW, shadowOpacity: 0.2 }}
        accessibilityRole="button"
        accessibilityLabel={t('common:a11y.openSettings')}
      >
        <SettingsIcon size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <UpgradeModal
        isVisible={gate !== null}
        gate={gate}
        onClose={() => setGate(null)}
        onViewPlans={(target: UserPlan) => {
          setGate(null);
          router.push(`/plans?highlight=${target}`);
        }}
      />

      <CapacityApplyModal
        isVisible={applyRows.length > 0}
        rows={applyRows}
        language={profile.language}
        onApply={applyCapacityToGoals}
        onDismiss={() => setApplyCandidates([])}
      />
    </SafeAreaView>
    </ScreenTransition>
  );
}

interface IncomeEditFormProps {
  currency: string;
  labelInput: string;
  onLabelChange: (v: string) => void;
  amountInput: string;
  onAmountChange: (v: string) => void;
  saveAsideInput: string;
  onSaveAsideChange: (v: string) => void;
  onSave: () => void;
  labelPlaceholder: string;
  amountPlaceholder: string;
  setAsideCaption: string;
  saveA11y: string;
  autoFocus?: boolean;
}

/**
 * The three-field inline edit form shared by "edit an existing income" and
 * "add a new income" (#191 Phase 6) — a top-level sibling, not nested inside
 * Profile(), so its identity is stable across Profile's re-renders and the
 * TextInputs don't lose focus/remount on every keystroke.
 */
function IncomeEditForm({
  currency,
  labelInput,
  onLabelChange,
  amountInput,
  onAmountChange,
  saveAsideInput,
  onSaveAsideChange,
  onSave,
  labelPlaceholder,
  amountPlaceholder,
  setAsideCaption,
  saveA11y,
  autoFocus,
}: IncomeEditFormProps) {
  return (
    <View className="gap-2 rounded-xl bg-surface-container p-3">
      <TextInput
        value={labelInput}
        onChangeText={onLabelChange}
        placeholder={labelPlaceholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoFocus={autoFocus}
        className="h-11 rounded-xl bg-surface-container-low border border-outline-variant px-3 text-sm font-semibold text-on-surface"
      />
      <CurrencyAmountInput
        currencyCode={currency}
        value={amountInput}
        onChangeText={onAmountChange}
        placeholder={amountPlaceholder}
      />
      <View>
        <Text className="mb-1 text-xs font-medium text-on-surface-variant">{setAsideCaption}</Text>
        <CurrencyAmountInput
          currencyCode={currency}
          value={saveAsideInput}
          onChangeText={onSaveAsideChange}
          placeholder={amountPlaceholder}
        />
      </View>
      <TouchableOpacity
        onPress={onSave}
        hitSlop={8}
        className="self-end h-10 w-10 items-center justify-center rounded-full bg-primary/20"
        accessibilityRole="button"
        accessibilityLabel={saveA11y}
      >
        <Check size={18} color="#1D4ED8" />
      </TouchableOpacity>
    </View>
  );
}
