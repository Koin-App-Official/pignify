---
name: Segmented Control Bounce Fix
overview: Fix the overshoot/wobble on the Missions↔Badges segmented-control pill (issue #131) by replacing its `withSpring(springPresets.press)` slide with a `withTiming` ease, per ANIMATION_GUIDE.md §3 rule 3 (fixed-duration timing is correct for non-interruptible, programmatic, decorative state changes — this tab switch is button-triggered, not gesture-driven).
todos:
  - "[completed] Phase 1: Add a dedicated timing preset for segmented-control slides in src/lib/springPresets.ts"
  - "[completed] Phase 2: Swap withSpring(springPresets.press) for withTiming(newPreset) in the SegmentedControl's indicator effect in app/(tabs)/missions.tsx"
  - "[completed] Phase 3: Manually verify the pill slide on Missions <-> Badges taps, both directions, rapid re-taps"
isProject: false
---

# Segmented Control Bounce Fix — Implementation Plan

Tracks [issue #131](https://github.com/Koin-App-Official/pignify/issues/131) on branch `fix/issue-131-missions-badges-bounce-animation`.

## Root cause recap

[app/(tabs)/missions.tsx:218-220](app/(tabs)/missions.tsx#L218-L220) drives the sliding pill's `indicator` shared value with:

```js
indicator.value = withSpring(tab === 'missions' ? 0 : 1, springPresets.press);
```

`springPresets.press` ([src/lib/springPresets.ts:10](src/lib/springPresets.ts#L10)) is `{ damping: 15, stiffness: 300 }` — the app's canonical *tap/press feedback* spring, designed for a quick press-down/release pulse, not a `translateX` handoff. Reused here it visibly overshoots the target and settles back, i.e. the bounce.

Per [guides/ANIMATION_GUIDE.md:54](guides/ANIMATION_GUIDE.md#L54) (§3 rule 3): *"`withTiming` is only for non-interruptible, purely decorative state changes."* The segmented-control slide is triggered by a discrete tap (`onChange('missions' | 'achievements')`), not a live gesture the finger is tracking — so it qualifies for `withTiming`, and switching to it isn't just a workaround but the guide-correct tool for this specific element.

---

## Phase 1 — Add a timing preset

**File:** [src/lib/springPresets.ts](src/lib/springPresets.ts)

- [x] Add a new entry to the existing `timingPresets` object (alongside `timingPresets.sheet`) for the segmented-control slide: `segment: { duration: 200, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig`.
- [x] Add a one-line doc comment matching the style of the existing presets (see `press`, `sheet`, `entrance` comments).

## Phase 2 — Swap the animation call

**File:** [app/(tabs)/missions.tsx](app/(tabs)/missions.tsx)

- [x] In `SegmentedControl` ([missions.tsx:218-220](app/(tabs)/missions.tsx#L218-L220)), replace `withSpring(tab === 'missions' ? 0 : 1, springPresets.press)` with `withTiming(tab === 'missions' ? 0 : 1, timingPresets.segment)`.
- [x] `withTiming` was already imported; `withSpring` and `springPresets` had no other usages in this file, so both were removed rather than left dangling.
- [x] Import `timingPresets` in place of the `springPresets` import.

## Phase 3 — Manual verification

No automated test currently covers this pill's motion (visual/animation behavior), so verification is manual per [feedback: user self-verifies UI changes] — no simulator/browser check needed from this side unless requested.

- [x] Confirm pill slides Missions → Badges with no overshoot/wobble. (user-verified)
- [x] Confirm pill slides Badges → Missions with no overshoot/wobble. (user-verified)
- [x] Confirm rapid re-tapping (interrupting mid-animation) doesn't produce a visual glitch. (user-verified)
- [x] Confirm no regression to the `PressableScale` tap-feedback bounce on the labels themselves. (user-verified)

---

## Out of scope

- No change to `PressableScale`'s own press-feedback spring (that's a different, correctly-used instance of `springPresets.press`).
- No change to `springPresets.press` itself — it stays as-is for actual tap/press feedback elsewhere in the app.
- No refactor of `segmentWidth`/layout measurement logic — only the animation driver changes.
