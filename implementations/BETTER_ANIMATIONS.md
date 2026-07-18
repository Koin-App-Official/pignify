# Better Animations Checklist

Tracks progress against [BETTER_ANIMATIONS_PLAN.md](BETTER_ANIMATIONS_PLAN.md) and [guides/ANIMATION_GUIDE.md](../guides/ANIMATION_GUIDE.md).

> **Note (2026-07-17):** the plan file's `todos` frontmatter claimed Phase 0 and Phase 1 were `completed` and Phase 2 `in_progress`. On inspection, none of Phase 0/1's deliverables existed in the repo (no gesture-handler/Skia/Rive/FlashList deps, no `src/components/animation/`, no ProMotion plist key, no `guides/ANIMATION_GUIDE.md`). This checklist starts from the real state: Phase 0 and 1 not started.

---

## Phase 0 — Platform & Dependencies

- [x] Add `react-native-gesture-handler`; `GestureHandlerRootView` wraps app in `app/_layout.tsx`
- [x] Install `@shopify/react-native-skia`, `rive-react-native`, `@shopify/flash-list`
- [x] iOS ProMotion key in `app.json`
- [x] `src/lib/devicePerformanceTier.ts`
- [x] `src/lib/springPresets.ts`
- [ ] Remove `react-native-confetti-cannon` (after Phase 4 Skia confetti ships — confirm with user first)

## Phase 1 — Shared Animation Primitives

- [x] `src/components/animation/BottomSheet.tsx`
- [x] `src/components/animation/FadeInStagger.tsx`
- [x] `src/components/animation/AnimatedCurrency.tsx`
- [x] `src/components/animation/AnimatedProgressBar.tsx`
- [x] `src/components/animation/SkiaConfetti.tsx`
- [x] `src/components/animation/useCelebrate.ts`
- [x] `src/components/animation/PressableScale.tsx`
- [x] Refactor `src/components/ScreenTransition.tsx` — timing → spring, single progress value
- [x] Refactor `src/components/ui/button.tsx` — Gesture.Tap(), haptic, single pressed value

## Phase 2 — Modal & Sheet Migration

- [x] `src/components/ui/picker-modal.tsx` → BottomSheet + FlashList (v2 — `estimatedItemSize` no longer exists in the installed FlashList version, so it's omitted)
- [x] `src/components/ui/calendar-modal.tsx` → BottomSheet
- [x] `src/components/AddExpenseModal.tsx` → BottomSheet + PressableScale category chips + haptic

## Phase 3 — Screen-by-Screen Upgrades

### Onboarding (`app/onboarding.tsx`)
- [x] Step entrances → Reanimated `FadeInDown.springify()` (all 9 conditionally-rendered step blocks)
- [x] Progress bar segments animated (per-segment scaleX spring fill, not instant class toggle)
- [x] Chip selectors → PressableScale + haptic (GOAL_CHIPS; TIMELINE_CHIPS no longer exists in the codebase post contribution-first flip)
- [x] Success screen → `useCelebrate()` + `SkiaConfetti` (replaces `react-native-confetti-cannon` in this file only — package still used by goals.tsx/missions.tsx until their Phase 3 items land)
- [ ] Rive mascot placeholder — left as emoji; no RiveMascot component exists yet (Phase 4, blocked on asset)

### Dashboard (`app/(tabs)/index.tsx`)
- [x] Stagger blocks → FadeInStagger (delays 0,0,60,120,180,240,300,360,420,480+i*60 preserved exactly)
- [x] AnimatedCurrency on stat cards (Today's Spending, Saved Today, Saved This Month) — extended AnimatedCurrency with an optional `formatter` prop since the default hardcodes `$`, which would've silently broken non-USD currencies
- [x] Goal carousel dots animated (scaleX spring instead of animated `width`)
- [x] Goal list progress bars → AnimatedProgressBar
- [x] XP bar → AnimatedProgressBar
- [x] Streak dots spring scale-in
- [x] ProgressRing kept as timing, untouched (verified: no layout props animated)

### Goals (`app/(tabs)/goals.tsx`)
- [x] Entrance migration (goals list → FadeInStagger index*100; create-flow steps → FadeInDown.springify(), matching onboarding)
- [x] Deposit success → `useCelebrate()` + SkiaConfetti (goal-creation success also converted for consistency, per user confirmation — `react-native-confetti-cannon` no longer imported in this file)
- [x] Create-goal step transitions (also: progress segments animated, GOAL_CHIPS → PressableScale + haptic, goal list + goal card progress bars → AnimatedProgressBar — matching the same fixes already applied on Dashboard/Onboarding)

### Missions (`app/(tabs)/missions.tsx`)
- [x] Mission complete → `useCelebrate()` + haptic (replaces ConfettiCannon; package no longer imported in this file)
- [x] Segmented tab switch spring indicator (onLayout-measured translateX shared value, not instant bg swap)
- [x] Mission card check spring (`ZoomIn.springify()` pop on complete; also: level bar → AnimatedProgressBar, achievement badges Moti → Reanimated ZoomIn, mission card entrance → FadeInStagger)

### Coach (`app/(tabs)/coach.tsx`)
- [x] Message bubbles enter (`FadeInDown.springify()`) + `layout={LinearTransition.springify()}`
- [x] Typing indicator UI-thread loop (3 dots, `withRepeat(withSequence(withTiming...))`, staggered via `withDelay`; replaces the previously-invisible 600ms wait)
- [x] Scroll-to-bottom via Reanimated `scrollTo` on the UI thread (`useAnimatedRef` + `runOnUI`); trigger stays `onContentSizeChange` since there's no purely UI-thread signal for "content grew" — only the actual scroll execution moved off the JS thread
- [x] Starter chips → PressableScale + haptic

### Profile (`app/(tabs)/profile.tsx`)
- [x] ScreenTransition wrapper — already present, checklist item was stale (nothing to do)
- [x] Staggered section entrances (8 sections → FadeInStagger, delayStep 60)
- [ ] Achievement unlock spring pop — no per-badge UI exists on this screen (only an aggregate "Badges: N" count in the stat row); the actual badge pop already lives on Missions (Phase 3 Missions, `ZoomIn.springify()`). Nothing to build here without inventing new UI, which is out of scope — flagging instead of guessing.

### Tab bar (`app/(tabs)/_layout.tsx`)
- [x] Focused tab spring scale + pill (animated icon wrapper: pill fades/scales in via spring, icon scales up 1→1.1, driven by a single `progress` shared value per tab)

## Phase 4 — Character & Celebrations (Rive)

Moved to [MASKOT.md](MASKOT.md) — mascot isn't fully designed yet. `useCelebrate()` is already wired everywhere with the emoji fallback; only the asset-dependent items (`.riv` file, `RiveMascot.tsx`, integration) remain, tracked there.

## Phase 5 — ProgressRing & Money Surfaces

- [x] ProgressRing verified — `withTiming` + `Easing.out(Easing.ease)`, one shared value drives `strokeDashoffset` via `useAnimatedProps` (SVG stroke prop, not a layout prop); already compliant, no changes needed
- [ ] Optional Skia ring migration — skipped; no profiling evidence of a need, and the plan says not to do this speculatively
- [x] Dashboard goal slider AnimatedCurrency — applied to the "saved amount" text in the goal carousel (`app/(tabs)/index.tsx`)

## Phase 6 — Cleanup & Deprecation

- [x] Remove MotiView/AnimatePresence imports — migrated the last 4 holdouts (`app/change-pin.tsx`, `src/components/auth/LockGate.tsx`, `src/components/auth/LoginGate.tsx`, `src/components/auth/PinCreationFlow.tsx`) to Reanimated `FadeInDown.springify()`; zero `moti` imports remain; `moti` uninstalled
- [x] `useFocusKey.ts` kept — still actively used (Dashboard/Goals/Missions) and works correctly with Reanimated `entering` props; only its stale "MotiView children" docstring was updated
- [x] Grep audit: zero hits for `Animated.` (legacy), `LayoutAnimation`, `PanResponder`, `animationType="slide"`, `confetti-cannon`
- [x] Uninstalled `react-native-confetti-cannon` (confirmed with user; zero code references existed)

## Phase 7 — Verification

- [x] Banned-API search — clean (no legacy Animated/LayoutAnimation/PanResponder/animationType=slide/confetti-cannon in Phases 0-5 scope)
- [x] Manual pass: all 8 hard rules on every animation file — see findings list below
- [ ] Profile UI-thread FPS (ProMotion iPhone + low-end Android) — not possible in this environment (no native device/simulator access); must be done on real hardware per guide §4/§8
- [x] Haptic pairing table verified — found 1 gap (wrong-PIN shake has no Error haptic in change-pin.tsx/LockGate.tsx/PinCreationFlow.tsx)
- [ ] Re-test after any RN/Reanimated upgrade — n/a, no upgrade performed this session

### Findings (unfiltered, severity + confidence noted)

1. **FIXED** — `src/components/UpgradeModal.tsx` migrated from `Modal animationType="none"` + Moti to `BottomSheet`.
2. **FIXED** — added `Haptics.notificationAsync(Error)` alongside the shake trigger in `app/change-pin.tsx`, `src/components/auth/LockGate.tsx`, `src/components/auth/PinCreationFlow.tsx`.
3. **FIXED** — `src/components/ui/picker-modal.tsx` FlashList `renderItem` extracted to a memoized `PickerListItem` component + `useCallback`-stabilized `renderItem`/`handleSelect`.
4. **Low** — 5 files still import `moti` (`change-pin.tsx`, `UpgradeModal.tsx`, `LockGate.tsx`, `LoginGate.tsx`, `PinCreationFlow.tsx`) — not a hard-rule violation, but blocks Phase 6 cleanup; none were in the plan's named Phase 3 screen list.
5. **Low/medium-confidence** — Dashboard goal carousel (`app/(tabs)/index.tsx:134`) still uses `FlatList`, not FlashList; borderline since it's a small quota-limited horizontal pager, not really a "long list."
6. **Low/informational** — `src/components/ContributionStep.tsx` has zero animation (no Moti, no Reanimated); not a violation, just inconsistent with the PressableScale pattern established elsewhere.
7. **Informational, non-issue** — `AnimatedCurrency`'s formatter allocates a string per animated frame during its ~500ms count-up; guide's §5.6 explicitly accepts this as long as it avoids Intl/regex, which it does.
8. **Not a defect** — `setInterval` in `change-pin.tsx:40` and `LockGate.tsx:65` are lockout-countdown data timers, not animation loops; doesn't match the rule's actual target.
9. **Low/informational** — `src/components/auth/PinPad.tsx` numeric keys use plain `Pressable` with no `PressableScale`; predates this plan, still has haptics, just inconsistent with the tap primitive.
