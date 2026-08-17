import { View, Text, TextInput } from 'react-native';
import { getCurrency } from '@/lib/store';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';

interface CurrencyAmountInputProps {
  currencyCode: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * The raw-amount text input row shared by onboarding's target-amount/income
 * screens, the goals tab's create-goal flow, and ContributionStep — one
 * component instead of four copies (Phase 5, implementations/I18N_SCALE.md).
 * Consolidating them is what surfaced the actual bug: all four hardcoded the
 * currency symbol *before* the input regardless of the currency's own
 * `symbolAfter` flag, so PLN (`symbolAfter: true`) showed "zł" on the wrong
 * side of every amount a user typed. This renders the symbol on whichever
 * side `getCurrency` says it belongs.
 */
export function CurrencyAmountInput({
  currencyCode,
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: CurrencyAmountInputProps) {
  const { symbol, symbolAfter } = getCurrency(currencyCode);
  const affix = (
    <Text className={`text-xl font-bold text-on-surface-variant ${symbolAfter ? 'ml-2' : 'mr-2'}`}>{symbol}</Text>
  );

  return (
    <View className="flex-row items-center rounded-2xl bg-surface-container-low border border-outline-variant px-4 h-14">
      {!symbolAfter && affix}
      <TextInput
        className="flex-1 text-xl font-bold text-on-surface"
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9.]/g, ''))}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        style={TEXT_INPUT_CENTERING}
        autoFocus={autoFocus}
      />
      {symbolAfter && affix}
    </View>
  );
}
