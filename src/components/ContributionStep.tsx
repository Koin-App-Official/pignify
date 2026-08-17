import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { CalendarModal } from '@/components/ui/calendar-modal';
import { CURRENCIES } from '@/lib/store';
import { deriveGoalDate, requiredContribution, suggestedContribution } from '@/lib/goalMath';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';
import { formatDate, formatMonthYear } from '@/lib/i18n/format';
import type { SupportedLanguage } from '@/lib/i18n/detect';

export type PlanningMode = 'contribution' | 'deadline';

export interface ContributionResult {
  monthlyContribution: number;
  targetDate: string;
  planningMode: PlanningMode;
}

interface ContributionStepProps {
  currency: string;
  language: SupportedLanguage;
  targetAmount: number;
  monthlyIncome: number | null;
  incomeSkipped: boolean;
  planningMode: PlanningMode;
  onPlanningModeChange: (mode: PlanningMode) => void;
  /** Raw text of the monthly-contribution input (contribution mode). */
  contribution: string;
  onContributionChange: (v: string) => void;
  /** ISO date picked in the fixed-deadline mode. */
  deadline: string;
  onDeadlineChange: (iso: string) => void;
  onBack: () => void;
  onContinue: (result: ContributionResult) => void;
  /**
   * When true, the Back/Continue row isn't rendered inline — the caller
   * renders its own footer instead (e.g. pinned above the keyboard, outside
   * the scrolling content). The caller is then responsible for computing its
   * own canContinue/onContinue from the same props it already passes down
   * (contribution/deadline/planningMode/targetAmount) rather than having this
   * component report them back up.
   */
  hideFooter?: boolean;
}

const SUGGESTION_PCTS = [0.1, 0.15, 0.2];
const INCOME_WARNING_PCT = 35;

function getCurrencySymbol(currencyCode: string): string {
  return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? currencyCode;
}

/**
 * Shared "how much can you set aside" step used by onboarding and the goals
 * tab. Defaults to contribution-first (derives the date); offers a fixed-
 * deadline escape hatch for genuinely date-bound goals, which derives the
 * required contribution instead. Owns its own guard rails (empty input,
 * horizon cap, soft income warning) so both call sites can't drift.
 */
export function ContributionStep({
  currency,
  language,
  targetAmount,
  monthlyIncome,
  incomeSkipped,
  planningMode,
  onPlanningModeChange,
  contribution,
  onContributionChange,
  deadline,
  onDeadlineChange,
  onBack,
  onContinue,
  hideFooter,
}: ContributionStepProps) {
  const { t } = useTranslation('onboarding');
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const currencySymbol = getCurrencySymbol(currency);
  const hasIncome = !incomeSkipped && !!monthlyIncome && monthlyIncome > 0;

  const contributionNumber = Number(contribution);
  const derived =
    planningMode === 'contribution' && contributionNumber > 0
      ? deriveGoalDate(targetAmount, contributionNumber)
      : null;
  const requiredMonthly =
    planningMode === 'deadline' && deadline
      ? requiredContribution(targetAmount, new Date(deadline))
      : null;

  const effectiveMonthly = planningMode === 'contribution' ? contributionNumber : requiredMonthly ?? 0;
  const pctOfIncome = hasIncome && effectiveMonthly > 0 ? (effectiveMonthly / monthlyIncome!) * 100 : null;
  const showIncomeWarning = pctOfIncome !== null && pctOfIncome > INCOME_WARNING_PCT;

  const canContinue = planningMode === 'contribution' ? contributionNumber > 0 : !!deadline;

  const handleContinue = () => {
    if (!canContinue) return;
    if (planningMode === 'contribution') {
      const result = deriveGoalDate(targetAmount, contributionNumber);
      onContinue({
        monthlyContribution: Math.round(contributionNumber * 100) / 100,
        targetDate: result.date,
        planningMode: 'contribution',
      });
    } else {
      const monthly = requiredContribution(targetAmount, new Date(deadline));
      onContinue({
        monthlyContribution: Math.round(monthly * 100) / 100,
        targetDate: new Date(deadline).toISOString(),
        planningMode: 'deadline',
      });
    }
  };

  return (
    <View>
      {planningMode === 'contribution' ? (
        <>
          <Text className="mb-2 text-3xl font-black text-on-surface">{t('contribution.monthlyHeadline')}</Text>
          <Text className="mb-6 text-sm font-medium text-on-surface-variant">{t('contribution.monthlySub')}</Text>

          {hasIncome && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {SUGGESTION_PCTS.map((pct) => {
                const amount = suggestedContribution(monthlyIncome!, pct);
                const selected = contributionNumber === amount;
                return (
                  <TouchableOpacity
                    key={pct}
                    onPress={() => onContributionChange(String(amount))}
                    className={`rounded-full px-4 py-2.5 border ${
                      selected
                        ? 'bg-primary-container border-2 border-primary'
                        : 'bg-surface-container-low border-outline'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        selected ? 'text-on-primary-container' : 'text-on-surface'
                      }`}
                    >
                      {t('contribution.suggestionChip', { pct: Math.round(pct * 100), symbol: currencySymbol, amount })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View className="flex-row items-center rounded-2xl bg-surface-container-low border border-outline-variant px-4 h-14">
            <Text className="text-xl font-bold text-on-surface-variant mr-2">{currencySymbol}</Text>
            <TextInput
              className="flex-1 text-xl font-bold text-on-surface"
              value={contribution}
              onChangeText={(v) => onContributionChange(v.replace(/[^0-9.]/g, ''))}
              keyboardType="numeric"
              placeholder={t('contribution.amountPlaceholder')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={TEXT_INPUT_CENTERING}
              autoFocus
            />
          </View>

          {derived && (
            <Text className="mt-3 text-sm font-medium text-on-surface-variant">
              {t('contribution.reachGoalBy', { symbol: currencySymbol, amount: contributionNumber })}{' '}
              <Text className="font-bold text-on-surface">{formatMonthYear(derived.date, language)}</Text>
            </Text>
          )}

          {hasIncome && pctOfIncome !== null && (
            <Text className="mt-2 text-xs text-on-surface-variant">
              {t('contribution.pctOfIncome', { pct: Math.round(pctOfIncome) })}
            </Text>
          )}

          {derived?.capped && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">{t('contribution.cappedWarning')}</Text>
            </View>
          )}

          {showIncomeWarning && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">{t('contribution.incomeWarning')}</Text>
            </View>
          )}

          {!hideFooter && (
            <TouchableOpacity onPress={() => onPlanningModeChange('deadline')} className="mt-4 items-center py-2">
              <Text className="text-sm font-medium text-primary underline">{t('contribution.switchToDeadline')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <Text className="mb-2 text-3xl font-black text-on-surface">{t('contribution.deadlineHeadline')}</Text>
          <Text className="mb-6 text-sm font-medium text-on-surface-variant">{t('contribution.deadlineSub')}</Text>

          <TouchableOpacity
            onPress={() => setIsCalendarVisible(true)}
            className="h-14 flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-4"
          >
            <Text className="text-base font-medium text-on-surface">
              {deadline
                ? formatDate(deadline, language, { year: 'numeric', month: 'long', day: 'numeric' })
                : t('contribution.selectDate')}
            </Text>
          </TouchableOpacity>

          {deadline && requiredMonthly !== null && (
            <Text className="mt-3 text-sm font-medium text-on-surface-variant">
              {t('contribution.needToSetAside')}{' '}
              <Text className="font-bold text-on-surface">
                {t('contribution.amountPerMonth', { symbol: currencySymbol, amount: requiredMonthly.toFixed(2) })}
              </Text>{' '}
              {t('contribution.hitDeadlineBy', { date: formatMonthYear(new Date(deadline).toISOString(), language) })}
            </Text>
          )}

          {hasIncome && pctOfIncome !== null && (
            <Text className="mt-2 text-xs text-on-surface-variant">
              {t('contribution.pctOfIncome', { pct: Math.round(pctOfIncome) })}
            </Text>
          )}

          {showIncomeWarning && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">{t('contribution.deadlineIncomeWarning')}</Text>
            </View>
          )}

          {!hideFooter && (
            <TouchableOpacity onPress={() => onPlanningModeChange('contribution')} className="mt-4 items-center py-2">
              <Text className="text-sm font-medium text-primary underline">{t('contribution.switchToMonthly')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {!hideFooter && (
        <View className="mt-6 flex-row gap-3">
          <Button variant="outline" onPress={onBack} className="w-14 items-center justify-center">
            <ArrowLeft size={16} color="#1D4ED8" />
          </Button>
          <Button
            onPress={handleContinue}
            disabled={!canContinue}
            className="flex-1 items-center justify-center flex-row gap-2"
          >
            <Text className="text-sm font-bold text-primary-foreground">{t('contribution.continue')}</Text>
            <ArrowRight size={16} color="#ffffff" />
          </Button>
        </View>
      )}

      <CalendarModal
        isVisible={isCalendarVisible}
        onClose={() => setIsCalendarVisible(false)}
        onConfirm={(date) => {
          onDeadlineChange(date);
          setIsCalendarVisible(false);
        }}
        initialDate={deadline}
      />
    </View>
  );
}
