# Piggy — Theme Reference

Source of truth for the app's visual language, derived from the current codebase (`global.css`, `tailwind.config.js`, `src/components/ui/*`, and screen-level usage in `app/`). This is a **NativeWind (Tailwind for React Native)** app — no web DOM, so `dark:` classes and browser-only utilities don't apply.

There is **no dark mode**. `global.css` defines a single `:root` palette only; no `.dark` class, no `useColorScheme` branching anywhere in the app. Treat any dark-mode work as new, not a toggle on existing tokens.

---

## Color tokens

Material Design 3–style HSL CSS variables in [global.css](global.css), consumed via Tailwind color utilities defined in [tailwind.config.js](tailwind.config.js) as `hsl(var(--token))`. Always reach for the Tailwind class (`bg-primary`, `text-on-surface`, etc.) — never hardcode hex in new code (icons are the one place this convention is currently broken, see below).

### Primary / Secondary / Tertiary (M3 triad)
| Token | Hex | Tailwind class | Usage |
| :--- | :--- | :--- | :--- |
| `--primary` | `#1D4ED8` | `bg-primary` / `text-primary` | Brand, primary actions, active states |
| `--primary-container` | `#DBEAFE`-ish | `bg-primary-container` | Chips, tonal button fill, badge backgrounds |
| `--on-primary-container` | | `text-on-primary-container` | Text/icons on primary-container |
| `--secondary` | `#3B82F6` | `bg-secondary` | Secondary actions, highlights |
| `--secondary-container` | | `bg-secondary-container` | Secondary tonal surfaces |
| `--tertiary` | green (`142 71% 45%`) | `bg-tertiary` | Accent / progress green (same hue as `--success`/`--progress`) |
| `--tertiary-container` | | `bg-tertiary-container` | Tertiary tonal surfaces |

### Surfaces
| Token | Tailwind class | Usage |
| :--- | :--- | :--- |
| `--background` | `bg-background` | App/screen background |
| `--surface` | `bg-surface` | Base elevated surface (pure white) |
| `--surface-container-lowest` … `--surface-container-highest` | `bg-surface-container-low`, `-container`, `-container-high`, `-container-highest` | Layered card/sheet backgrounds, low → highest as elevation increases. `surface-container-low` is the default card fill. |
| `--on-surface` / `--on-surface-variant` | `text-on-surface`, `text-on-surface-variant` | Primary text / secondary (muted) text on surfaces |
| `--outline` / `--outline-variant` | `border-outline`, `border-outline-variant` | Dividers, input borders (variant = lighter) |

### Status & feedback
| Token | Hex | Tailwind class | Usage |
| :--- | :--- | :--- | :--- |
| `--destructive` | `#B91C1C` | `bg-destructive` / `text-destructive` | Errors, destructive actions |
| `--warning` | `#F59E0B`-ish (`38 92% 50%`) | `bg-warning` | Cautions, pending states |
| `--success` | `#10B981`-ish (`142 71% 45%`) | `bg-success` | Positive feedback |
| `--progress` / `--progress-light` / `--progress-subtle` | same green family | `bg-progress*` | Goal/chart progress bars — base, lighter accent, subtle background track |
| `--muted` / `--muted-foreground` | | `bg-muted`, `text-muted-foreground` | Kept for compatibility; prefer `surface-container-*` / `on-surface-variant` in new code |

**Icons bypass the token system**: `lucide-react-native` icons are passed raw hex (`color="#64748B"`, `#1D4ED8`, `#94A3B8`) at each call site rather than resolving a token. Match nearby hex values to the closest token above when documenting or refactoring, don't invent new ones.

---

## Typography

Font family aliases exist (`sans`, `sans-semibold`, `sans-bold`, `heading` → Nunito static weights) but are **rarely used in practice** — `font-heading` appears once in the whole app. Real usage leans on plain Tailwind weight utilities and relies on RN's default font-weight → Nunito mapping:

| Class | Frequency | Typical role |
| :--- | :--- | :--- |
| `font-black` | headings | Page/section/hero titles — pair with `text-2xl`/`text-3xl` (section) or `text-4xl` (onboarding/hero) |
| `font-bold` | very common | Buttons, emphasized labels, card titles |
| `font-semibold` | common | Sub-headings, list item titles |
| `font-medium` | common | Body text, input text (`text-base font-medium`) |
| `font-sans-semibold` / `font-sans-bold` / `font-heading` | rare (coach screen only) | Present in tailwind.config but not the dominant pattern — don't require them for new screens |

Common size/weight pairings:
- Hero/onboarding title: `text-4xl font-black`
- Page/section title: `text-2xl font-black` or `text-3xl font-black`
- Body: `text-base font-medium`
- Secondary/meta text: `text-sm font-semibold` or `text-xs`

---

## Shape (border radius)

`--radius: 20px` exists as a variable but nothing consumes it via an arbitrary value class — the app relies on Tailwind's default radius scale instead. Real convention by role:

| Element | Class |
| :--- | :--- |
| Cards, sections, inputs | `rounded-2xl` |
| Hero / emphasis cards (avatar card, selected plan, onboarding highlight) | `rounded-3xl` |
| Buttons, pills, chips, avatars, icon buttons | `rounded-full` |
| Bottom sheet top corners | hardcoded `32` (StyleSheet, not a Tailwind class) |
| Occasional one-offs (segmented control, calendar cells) | `rounded-lg` / `rounded-xl` |

---

## Elevation (shadows)

No `shadow-*` Tailwind utilities are used anywhere — shadows are always inline style objects with matching iOS shadow props + Android `elevation`. Two canonical weights are in practice, plus buttons using a different technique entirely:

**Card shadow** (most common, often a local `CARD_SHADOW` const):
```js
{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 }
```
A slightly lighter variant (`opacity: 0.06, radius: 6, elevation: 3`) appears on the home tab; a lighter-still variant (`opacity: 0.05, radius: 4, elevation: 2`) for inactive/secondary elements.

**Sheet/modal shadow** (bottom sheets, large surfaces):
```js
{ shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 25 }
```

**Buttons never use shadows.** Depth comes from a flat "3D" bottom border (`VARIANT_BOTTOM_BORDERS` in `src/components/ui/button.tsx`) — a 3–4px solid darker-shade border on the bottom edge, combined with a press-driven `translateY` animation to simulate a pressed button sinking in.

The tab bar explicitly zeroes `elevation`.

---

## Spacing

No formal scale doc — most-used values by frequency, ranked:

`gap-2`, `gap-3` (row/list item gaps) · `p-4`, `p-5` (card body padding) · `px-4`, `px-5`, `px-6` (screen/card horizontal padding, `px-5` most common for screen edges) · `py-2`, `py-3` (vertical rhythm) · `gap-1`, `gap-4`.

Buttons default to `px-6 py-3`.

---

## Components

Only one real primitive library exists — most "components" are ad hoc patterns repeated with the same classes, not shared components.

### `Button` — `src/components/ui/button.tsx`
`cva`-based, the only variant-driven primitive in the codebase.
- **Variants**: `default` (bg-primary), `secondary` (bg-secondary), `tonal` (bg-primary-container), `outline` (border-outline, transparent), `ghost` (transparent), `destructive` (bg-destructive), `link` (underline, transparent), `chip` (border-2 border-primary, bg-primary-container).
- **Sizes**: `default` (h-12 px-6 py-3), `sm` (h-10 px-4), `lg` (h-14 px-8), `icon` (h-12 w-12), `chip` (px-5 py-3).
- Built on Reanimated + Gesture Detector: press-scale + translateY animation, per-variant bottom-border for depth (see Elevation above), `selectionAsync` haptic on release.

### `Input` — `src/components/ui/input.tsx`
Single primitive, no variants: `h-14 rounded-2xl border-outline-variant bg-surface-container-low px-4 py-3 text-base font-medium`.

### Cards, badges/pills — no shared component
Ad hoc, but consistent:
- Card: `<View className="rounded-2xl bg-surface-container-low p-4" style={CARD_SHADOW}>`
- Badge/pill: `<View className="rounded-full bg-primary-container px-3 py-1">`

Other bespoke UI (`calendar-modal.tsx`, `dob-picker.tsx`, `picker-modal.tsx`, etc.) follows the same token + `rounded-2xl`/`rounded-full` conventions without a shared variant system.

---

## Icons

`lucide-react-native`, imported directly per-file — no wrapper component. No `strokeWidth` overrides (always default). Sizing by role, not a formal scale:
- Inline row icons: `size={18}`
- Small badge/chip icons: `size={14–16}`
- Header/nav icons: `size={20–25}`

Colors are raw hex, not theme tokens (see Colors section above).

---

## Motion

`react-native-reanimated` + `react-native-gesture-handler` only (no Moti). Centralized presets in `src/lib/springPresets.ts`:

| Preset | Config | Used for |
| :--- | :--- | :--- |
| `springPresets.press` | `damping: 15, stiffness: 300` | Tap/press feedback |
| `springPresets.sheet` | `damping: 30, stiffness: 200, overshootClamping: true` | Drag-to-dismiss snap |
| `springPresets.entrance` | `damping: 16, stiffness: 160`, `delayStep: 40ms` | Staggered list/card entrance |
| `timingPresets.sheet` | `duration: 280, Easing.inOut(Easing.cubic)` | Programmatic (non-gesture) modal open/close |

Convention: **springs for anything interactive/gesture-driven, `withTiming` only for non-interruptible programmatic transitions.**

`expo-haptics` pairs with nearly every gesture animation — `selectionAsync` on tap, `impactAsync(Light)` on sheet snap. Screen transitions use a focus-triggered spring fade + scale (`opacity` + `scale 0.97→1`) via `ScreenTransition.tsx`.

---

## Known gaps / inconsistencies to be aware of

- `fontFamily` aliases (`sans-bold`, `heading`, etc.) are defined but barely used — most text relies on Tailwind weight utilities instead. Don't assume `font-heading` is the convention.
- Icons hardcode hex colors instead of resolving theme tokens.
- No dark mode support anywhere.
- No shared `Card` or `Badge` component — only `Button` and `Input` are real primitives; everything else is copy-pasted className/style patterns.
- Shadow values are duplicated as local `CARD_SHADOW` consts per-screen rather than a shared constant.
