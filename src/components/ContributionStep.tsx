import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { CalendarModal } from '@/components/ui/calendar-modal';
import { CURRENCIES } from '@/lib/store';
import { deriveGoalDate, requiredContribution, suggestedContribution } from '@/lib/goalMath';
import { PLACEHOLDER_COLOR } from '@/lib/utils';

export type PlanningMode = 'contribution' | 'deadline';

export interface ContributionResult {
  monthlyContribution: number;
  targetDate: string;
  planningMode: PlanningMode;
}

interface ContributionStepProps {
  currency: string;
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
}

const SUGGESTION_PCTS = [0.1, 0.15, 0.2];
const INCOME_WARNING_PCT = 35;

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

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
}: ContributionStepProps) {
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
          <Text className="mb-2 text-3xl font-black text-on-surface">
            How much can you{'\n'}set aside each month?
          </Text>
          <Text className="mb-6 text-sm font-medium text-on-surface-variant">
            We'll work out when you'll hit your goal.
          </Text>

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
                      {Math.round(pct * 100)}% · {currencySymbol}
                      {amount}
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
              placeholder="0.00"
              placeholderTextColor={PLACEHOLDER_COLOR}
            />
          </View>

          {derived && (
            <Text className="mt-3 text-sm font-medium text-on-surface-variant">
              At {currencySymbol}
              {contributionNumber}/month you'll reach your goal by{' '}
              <Text className="font-bold text-on-surface">{formatMonthYear(derived.date)}</Text>
            </Text>
          )}

          {hasIncome && pctOfIncome !== null && (
            <Text className="mt-2 text-xs text-on-surface-variant">
              That's {Math.round(pctOfIncome)}% of your monthly income.
            </Text>
          )}

          {derived?.capped && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">
                At this rate it'll take over 10 years. Try raising your monthly amount or lowering your goal.
              </Text>
            </View>
          )}

          {showIncomeWarning && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">
                That's a big chunk of your income. Make sure it's comfortable — you can always adjust later.
              </Text>
            </View>
          )}

          <TouchableOpacity onPress={() => onPlanningModeChange('deadline')} className="mt-4 items-center py-2">
            <Text className="text-sm font-medium text-primary underline">I have a fixed deadline instead</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text className="mb-2 text-3xl font-black text-on-surface">
            When do you want{'\n'}to achieve this?
          </Text>
          <Text className="mb-6 text-sm font-medium text-on-surface-variant">
            Pick the date — we'll work out your monthly contribution.
          </Text>

          <TouchableOpacity
            onPress={() => setIsCalendarVisible(true)}
            className="h-14 flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-4"
          >
            <Text className="text-base font-medium text-on-surface">
              {deadline
                ? new Date(deadline).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Select a date'}
            </Text>
          </TouchableOpacity>

          {deadline && requiredMonthly !== null && (
            <Text className="mt-3 text-sm font-medium text-on-surface-variant">
              You'll need to set aside{' '}
              <Text className="font-bold text-on-surface">
                {currencySymbol}
                {requiredMonthly.toFixed(2)}/month
              </Text>{' '}
              to hit this by {formatMonthYear(new Date(deadline).toISOString())}.
            </Text>
          )}

          {hasIncome && pctOfIncome !== null && (
            <Text className="mt-2 text-xs text-on-surface-variant">
              That's {Math.round(pctOfIncome)}% of your monthly income.
            </Text>
          )}

          {showIncomeWarning && (
            <View className="flex-row items-start gap-2 rounded-2xl bg-warning-container p-4 mt-3">
              <AlertTriangle size={16} color="#92400E" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-warning">
                This date requires setting aside a large share of your income. We can adjust this later!
              </Text>
            </View>
          )}

          <TouchableOpacity onPress={() => onPlanningModeChange('contribution')} className="mt-4 items-center py-2">
            <Text className="text-sm font-medium text-primary underline">Switch back to monthly set-aside</Text>
          </TouchableOpacity>
        </>
      )}

      <View className="mt-6 flex-row gap-3">
        <Button variant="outline" onPress={onBack} className="w-14 items-center justify-center">
          <ArrowLeft size={16} color="#1D4ED8" />
        </Button>
        <Button
          onPress={handleContinue}
          disabled={!canContinue}
          className="flex-1 items-center justify-center flex-row gap-2"
        >
          <Text className="text-sm font-bold text-primary-foreground">Continue</Text>
          <ArrowRight size={16} color="#ffffff" />
        </Button>
      </View>

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
