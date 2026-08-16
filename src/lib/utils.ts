import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PLACEHOLDER_COLOR = '#94a3b8';

/**
 * Spread onto every `<TextInput>`. Neither prop is expressible via a
 * className/Tailwind utility (both are RN-only style props, not CSS), so
 * without this every text field's characters render slightly below vertical
 * center: `textAlignVertical` defaults away from 'center', and Android's
 * `includeFontPadding` (true by default) reserves extra space below the
 * glyph baseline for accents that isn't there for most fonts, pushing the
 * visible text down within its line box. `includeFontPadding` is Android-only
 * and a no-op on iOS.
 */
export const TEXT_INPUT_CENTERING = {
  textAlignVertical: 'center' as const,
  includeFontPadding: false,
};
