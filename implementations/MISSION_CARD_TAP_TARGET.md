# Missions: cards not reliably tappable on Android

> Tracking issue: [#195](https://github.com/Koin-App-Official/pignify/issues/195)
> Branch: `fix/issue-195-mission-card-tap-target`

## Context

Feedback from Android users: on the Missions screen, "not all missions are clickable". Tapping a
mission card frequently does nothing, with no visual feedback that anything was registered. iOS
feels fine. The symptom reads as if specific missions are broken, but it is actually per-tap
chance — the same card works on one attempt and not the next.

## Root cause (confirmed by reading RNGH source, not inferred)

**The core defect is a platform asymmetry inside `react-native-gesture-handler` 2.28 itself.**

`PressableScale` ([src/components/animation/PressableScale.tsx](src/components/animation/PressableScale.tsx))
builds its tap with `Gesture.Tap()`. In RNGH:

- **Android** — `TapGestureHandler.kt:33-35`

  ```kotlin
  init {
    shouldCancelWhenOutside = true
  }
  ```

- **iOS** — `RNGestureHandler.mm:109` sets `_shouldCancelWhenOutside = NO`, and `RNTapHandler`
  never overrides it.

So on **Android only**, the tap is silently cancelled the instant the finger drifts outside the
handler's view bounds. On iOS the identical drift is forgiven and the tap fires.

That asymmetry would be harmless on a large button. Here the handler wraps **only the 40x40 dp
status circle** ([app/(tabs)/missions.tsx:346-357](app/(tabs)/missions.tsx:346)) — not the card:

```tsx
const circle = (
  <PressableScale onPress={onComplete} disabled={...}>
    <View className={`h-10 w-10 items-center justify-center rounded-full border-2 ...`}>
```

40 dp is below Android's 48 dp minimum touch target. A normal thumb press that rolls 2-3 px off
that circle before lifting does nothing at all. **Small target + cancel-on-exit = per-tap
coin-flip**, which is exactly the reported symptom.

### Compounding factors (all confirmed in source)

1. **`maxDurationMs = 500`** — `TapGestureHandler.kt:188`, and iOS `defaultMaxDuration = 0.5`. A
   press held longer than half a second fails on both platforms. When a user believes a tap did not
   register, they press *longer and harder*, which guarantees the retry fails too.
2. **No `hitSlop` on `PressableScale`** — while every RN `Pressable` in this app sets one (values
   4-14 across `profile.tsx`, `settings.tsx`, `plans.tsx`, the modals, etc.). The team already
   applies this practice; the RNGH primitive simply cannot accept it today.
3. **No RNGH/scroll coordination anywhere in the codebase** — `simultaneousWithExternalGesture`,
   `blocksExternalGesture` and `Gesture.Native()` return zero matches across `app/` and `src/`. The
   list sits in a plain React Native `ScrollView`, which can also claim the touch.

### Why the Missions screen specifically

`missions.tsx` is the only tab screen whose interactions are **100% `PressableScale`** — it
contains no RN `Pressable` at all. Dashboard (`app/(tabs)/index.tsx`) and Profile use RN
`Pressable`, whose responder system is far more forgiving on Android. The other `PressableScale`
consumers (`goals`, `coach`, `onboarding`, `AddExpenseModal`, `AddSavingsModal`,
`LessonQuizModal`) carry the same latent defect but wrap larger targets, so it shows up less.

### Accessibility gap

A `GestureDetector`-wrapped `Animated.View` exposes **no accessibility affordance**. TalkBack users
on Android cannot activate mission cards at all.

### Ruled out

- `GestureHandlerRootView` is correctly mounted at the app root
  ([app/_layout.tsx:71](app/_layout.tsx:71)) — so this is not the `#164` bottom-sheet class of bug.
- `SkiaConfetti` has `pointerEvents="none"` and is only mounted while `confettiActive` is true, so
  it is not swallowing touches.

---

## Phase 1 — Fix the tap primitive (root cause)

Normalize Android to iOS behaviour in the shared primitive, so every consumer benefits.

- [x] Add `.shouldCancelWhenOutside(false)` — stops Android cancelling on minor finger drift
- [x] Add `.maxDistance(16)` — required alongside the above, so a real scroll drag still *correctly*
      fails the tap instead of firing on lift
- [x] Add `.maxDuration(10000)` — a slow, deliberate press now registers, matching RN `Pressable`
      semantics
- [x] Add an optional `hitSlop` prop (default `8`) forwarded to the gesture
- [x] Add `accessibilityRole="button"`, `accessible`, `accessibilityState={{ disabled }}` and an
      optional `accessibilityLabel` to the inner `Animated.View`
- [x] Run `npm run typecheck`

**Files modified:** `src/components/animation/PressableScale.tsx`

**Phase complete when:** typecheck passes, and all seven existing consumers (`missions`, `goals`,
`coach`, `onboarding`, `AddExpenseModal`, `AddSavingsModal`, `LessonQuizModal`) compile unchanged
against the new prop signature — the new props are additive and optional.

---

## Phase 2 — Enlarge the missions tap target

The primitive fix alone may be sufficient, but a 40 dp target is still below spec.

- [x] Move the tap gesture from the status circle to the whole card row in `MissionCard`
- [x] Keep `PulsingRing` wrapping the circle visual only, so the breathing animation is unchanged
- [x] Keep the existing disabled matrix exactly as-is (`claimed` -> off, `locked` non-quiz -> off,
      `ready` / `manual` / `locked`-quiz -> on)
- [x] Verify no nested `GestureDetector` remains inside the card
- [x] Run `npm run typecheck`

**Files modified:** `app/(tabs)/missions.tsx`

**Phase complete when:** typecheck passes, exactly one `PressableScale` wraps each card, and the
four card states render with identical styling to before — this is a touch-target change only, not
a visual one.

---

## Phase 3 — Lock the behaviour down with tests

The project's suite is vitest, pure-logic only — there are no RN render tests and no
`@testing-library` dependency, so the testable surface is the state machine.

- [x] Move `getCardState` out of `missions.tsx` into `src/lib/missions.ts` and export it
- [x] Add an exported `isMissionActionable(state, def)` encoding the disabled matrix, and use it in
      `MissionCard` in place of the inline boolean
- [x] Add tests covering all four states plus the locked-money-quiz exception
- [x] Run `npm test`

**Files modified:** `src/lib/missions.ts`, `src/lib/missions.test.ts`, `app/(tabs)/missions.tsx`

**Phase complete when:** `npm test` passes with the new cases, and `missions.tsx` no longer defines
tap-eligibility logic inline.

---

## Phase 4 — Close the loop on the source of the pattern

`PressableScale` was written from the animation guide, and the guide's snippet still teaches the
defect — §5.1's example has neither `shouldCancelWhenOutside` nor `hitSlop`.

- [ ] Update `guides/ANIMATION_GUIDE.md` §5.1 with the Android `shouldCancelWhenOutside` caveat and
      the corrected snippet
- [ ] **Manual verification on a physical Android device:** ready, manual and locked-quiz cards all
      respond when tapped anywhere on the card; scrolling the list does *not* accidentally claim a
      mission; claimed and locked cards stay inert
- [ ] Verify no iOS regression
- [ ] Open PR closing #195

**Files modified:** `guides/ANIMATION_GUIDE.md`

**Phase complete when:** taps land reliably on Android, scrolling does not misfire, and iOS
behaviour is unchanged.

---

## Open decision

Phase 1 touches a primitive shared by 7 files. The recommendation is to fix it centrally, since the
same latent bug exists in coach, goals, onboarding and three modals. The alternative — scoping
Phase 1 to missions only and filing a follow-up issue for the rest — contains the blast radius at
the cost of leaving the other six consumers broken on Android.
