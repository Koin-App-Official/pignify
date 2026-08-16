import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PLACEHOLDER_COLOR = '#94a3b8';

/**
 * Pass as the `style` prop on every `<TextInput>` so its text renders
 * vertically centered instead of sitting slightly below center. Must be a
 * `style` value, not a bare component prop: RN's `TextInput.js` only
 * converts `verticalAlign` to the native `textAlignVertical` behavior when
 * it finds it inside `flattenedStyle` (see `verticalAlignToTextAlignVerticalMap`
 * in that file) — that conversion is what reaches iOS's native view.
 * `textAlignVertical` passed as a bare prop is Android-only.
 */
export const TEXT_INPUT_CENTERING = {
  verticalAlign: 'middle' as const,
};
