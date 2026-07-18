import { useEffect } from 'react';
import { TextInput } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedCurrencyProps {
  value: number;
  /** Defaults to a comma-grouped `$` formatter; pass one to match another currency/symbol. Must be a worklet. */
  formatter?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}

/** Comma-grouped whole-dollar formatter; no Intl/regex allocation per frame. */
function defaultFormatter(n: number): string {
  'worklet';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  let withCommas = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) withCommas += ',';
    withCommas += digits[i];
  }
  return `${sign}$${withCommas}`;
}

/**
 * Count-up currency display (guide §5.6) — a shared value drives the text via
 * useAnimatedProps so the number animates on the UI thread without re-rendering.
 */
export function AnimatedCurrency({ value, formatter = defaultFormatter, style, duration = 500 }: AnimatedCurrencyProps) {
  const animated = useSharedValue(value);

  useEffect(() => {
    animated.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    text: formatter(animated.value),
  })) as any;

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      pointerEvents="none"
      caretHidden
      defaultValue={formatter(value)}
      style={style}
      animatedProps={animatedProps}
    />
  );
}
