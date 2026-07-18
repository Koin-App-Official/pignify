# React Native Animation Guide — Canonical Patterns

> Read this before writing or fixing any animation code in a React Native (Expo) app on the New Architecture. Imitate the snippets in §5 — do not invent alternative approaches. When you find code that contradicts a rule here, treat it as a defect: fix it with the canonical pattern.

---

## 1. Motion personality (project-specific — adapt, don't assume)

Some apps define an explicit motion identity. A common example (from a Duolingo-like AI financing app):

- **Playful and springy** — physics-based motion everywhere; elements overshoot slightly and settle naturally.
- **Character-driven** — an animated mascot (Rive state machine) reacts to user actions.
- **Celebratory** — gamified moments (streaks, milestones, approvals) get reward animations: confetti, bursts, haptic hits.
- **Trustworthy on money surfaces** — balances/progress animate smoothly and precisely, never bouncy. Play lives around the data, not in it.
- **Instant and interruptible** — everything can be interrupted mid-flight and redirect from current value/velocity; gestures track the finger 1:1 with release momentum.

If the current project has its own personality doc, use that instead of this example. If none exists, the §3 hard rules below still apply — they're stack/performance rules, independent of any particular brand feel.

---

## 2. Approved stack — flag anything else

Requires **React Native (Expo) on the New Architecture** — Reanimated 4 and Skia require Fabric.

| Purpose | Library (the only approved option) |
|---|---|
| All animation logic | `react-native-reanimated` v4 (worklets + CSS-style API) |
| All gestures | `react-native-gesture-handler` (composed with Reanimated) |
| Custom drawing, shaders, blurs, confetti, charts | `@shopify/react-native-skia` |
| Interactive characters, stateful icons, mascot | `rive-react-native` (state machines) |
| Decorative/marketing animations only | `lottie-react-native` |
| Every long or dynamic list | `@shopify/flash-list` |
| Haptics | `expo-haptics` |
| Quick declarative enter/exit sugar (optional) | `moti` (built on Reanimated) |

**Flag these as defects:**
- The legacy `Animated` API from `react-native` (`Animated.timing`, `Animated.Value`, `useNativeDriver`) — migrate to Reanimated.
- `LayoutAnimation` — replace with Reanimated layout transitions.
- `FlatList` / `SectionList` / `ScrollView` used for long content — replace with `FlashList`.
- Reanimated 3-only patterns or any code assuming the old bridge/JS-driven animation.
- Lottie used for anything interactive or state-driven (buttons, toggles, character reactions) — must be Rive.
- Raw `PanResponder` — must be Gesture Handler.

---

## 3. Hard rules (the audit checklist)

Check every piece of animation code against all eight rules. Each includes the canonical fix.

1. **Animations run on the UI thread only.** All animation logic lives in worklets (`useAnimatedStyle`, `useDerivedValue`, gesture callbacks) driving shared values. *Red flag:* animation values in `useState`, `setState`/re-render inside an animation loop, `setInterval`-driven motion.

2. **Animate `transform` and `opacity` only.** Never animate `width`, `height`, `top`, `left`, margins, padding, or `backgroundColor` per-frame — these trigger layout and drop frames. Size changes go through `transform: scale` or Reanimated layout transitions. *Exception:* one-shot layout transitions via `LinearTransition`/entering/exiting are fine.

3. **Springs by default.** `withSpring` (or spring-configured layout transitions) for anything user-visible and interruptible. `withTiming` is only for non-interruptible, purely decorative state changes. Fixed-duration animation on a gesture-driven element is always a defect.

4. **Every gesture animation is velocity-aware and interruptible.** During the gesture, the shared value tracks the finger 1:1 (no animation function). On release, hand off to `withSpring`/`withDecay` **passing `event.velocityX/Y`**. A release that ignores velocity is a defect.

5. **Zero allocations per frame.** No object/array creation, no `JSON.parse`, no regex, no string building inside worklets that run every frame. Precompute outside; mutate shared values inside.

6. **One shared value drives many styles.** Derive multiple transforms/opacities from a single progress shared value (via `interpolate`) instead of running parallel independent animations that must stay in sync.

7. **`runOnJS` is a smell.** Calling back into JS from a worklet mid-gesture or mid-animation stalls motion. Allowed only at animation *completion* (e.g., trigger navigation, commit state, fire a haptic). Never per-frame.

8. **Lists are virtualized and animation-safe.** `FlashList` with a stable `estimatedItemSize`, memoized items, no anonymous inline item renderers. Scroll-linked effects use `useAnimatedScrollHandler`, never `onScroll` + state.

---

## 4. High refresh rate & platform setup

Verify these exist in the project; flag if missing:

- **iOS ProMotion:** `CADisableMinimumFrameDurationOnPhone: true` in `Info.plist` (via `app.json` → `ios.infoPlist`). Without it, third-party animations are capped at 60fps on iPhone even on 120Hz hardware. 120Hz is disabled by the OS in Low Power Mode — never assume a fixed frame rate.
- **Frame budget:** ~8 ms/frame at 120fps, ~16 ms at 60fps, for UI thread *and* GPU. Profile with the Reanimated/Perf monitor watching **UI-thread FPS and JS-thread FPS separately** — JS FPS may drop during data work, but UI FPS dropping is always a defect.
- **Degrade gracefully on weak devices:** particle counts, blur effects, and shader effects should scale down or turn off on low-end Android. Look for (or introduce) a single `devicePerformanceTier` utility consumed by effect components — not scattered `Platform.OS` checks.
- **After any RN/Reanimated upgrade, re-verify animations manually.** The New Architecture has historically introduced animation regressions. Treat "animations still smooth" as part of upgrade acceptance.

---

## 5. Canonical patterns

New code should look like this; existing code that deviates should be refactored toward this.

### 5.1 Base pattern — shared value + worklet style

```tsx
const pressed = useSharedValue(0);

const style = useAnimatedStyle(() => ({
  transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
  opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
}));

const tap = Gesture.Tap()
  .onBegin(() => { pressed.value = withSpring(1, { damping: 15, stiffness: 300 }); })
  .onFinalize(() => { pressed.value = withSpring(0, { damping: 15, stiffness: 300 }); });

return (
  <GestureDetector gesture={tap}>
    <Animated.View style={style}>{children}</Animated.View>
  </GestureDetector>
);
```

### 5.2 Gesture → spring handoff with velocity (sheets, cards, swipes)

```tsx
const translateY = useSharedValue(0);
const startY = useSharedValue(0);

const pan = Gesture.Pan()
  .onStart(() => { startY.value = translateY.value; })          // interruptible: resume from current value
  .onUpdate((e) => { translateY.value = startY.value + e.translationY; }) // 1:1 finger tracking
  .onEnd((e) => {
    const snapTo = e.velocityY > 500 || translateY.value > SHEET_HEIGHT / 2 ? SHEET_HEIGHT : 0;
    translateY.value = withSpring(snapTo, { velocity: e.velocityY, damping: 20, stiffness: 200 });
  });
```

Checklist when reviewing any gesture animation: 1:1 tracking during the gesture · `velocity` passed on release · `onStart` reads the *current* value so a new touch interrupts an in-flight spring.

### 5.3 Streaming text reveal (AI chat)

Streaming LLM tokens must not re-trigger entrance animations or thrash layout:

- Append tokens to text state normally (JS thread) — **do not** animate per-token.
- Animate the *container* once: message bubble enters with `entering={FadeInDown.springify()}`.
- A subtle cursor/typing indicator runs as an infinite UI-thread loop (`withRepeat(withTiming(...))`) — never `setInterval`.
- The scroll-to-bottom follow is driven by `useAnimatedScrollHandler` + `scrollTo` on the UI thread.
- Growing message height uses `layout={LinearTransition.springify()}` on the bubble, not animated `height`.

```tsx
<Animated.View entering={FadeInDown.springify().damping(18)} layout={LinearTransition.springify()}>
  <MessageBubble text={streamedText} />
</Animated.View>
```

### 5.4 Rive character / state machine (mascot, stateful icons)

All interactive character animation goes through Rive state machine **inputs** — never by swapping animation files or playing timelines manually.

```tsx
const riveRef = useRef<RiveRef>(null);

// Fire a trigger (one-shot reaction)
riveRef.current?.fireState('CharacterMachine', 'celebrate');

// Bind live app data (e.g., savings progress 0–100) to a number input
riveRef.current?.setInputState('CharacterMachine', 'progress', progressPct);

<Rive ref={riveRef} resourceName="mascot" stateMachineName="CharacterMachine" autoplay />
```

Review checks: `.riv` assets bundled locally (not fetched per render) · one state machine per component · app state changes map to inputs (`boolean` / `number` / `trigger`), with names matching the design file · Rive chosen over Lottie for anything the user can affect.

### 5.5 Celebration moment (streaks, milestones, approvals)

A celebration = **Rive trigger + Skia particles + haptic**, fired together, gated by device tier:

```tsx
function celebrate() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // haptic first — perceived latency
  riveRef.current?.fireState('CharacterMachine', 'celebrate');
  confettiProgress.value = 0;
  confettiProgress.value = withTiming(1, { duration: 2200 });          // one shared value drives all particles
}
```

Confetti/particles render in a single Skia `<Canvas>`: particle positions are derived in a worklet from the one `confettiProgress` value with per-particle constants precomputed **once** (no per-frame allocation). Particle count comes from the device tier (e.g., 150 high / 60 mid / 0 low, replaced by a simple Rive burst).

### 5.6 Animated numbers & progress (data-precision surfaces)

- Numbers/amounts count up via a shared value + `useDerivedValue` formatting into a text component (`ReText`/`AnimatedProps`) — never by re-rendering per frame.
- Progress rings/charts are Skia paths animated by `withTiming` + gentle easing (precise, no overshoot — this is the one place springs are *not* the default).
- Number formatting (currency, separators) is precomputed or done in the worklet without allocation-heavy libraries.

### 5.7 Screen & list transitions

- Screen elements enter with Reanimated `entering`/`exiting` presets (`FadeInDown.springify()`, staggered with `.delay(i * 40)`).
- Shared-element/hero moments use Reanimated shared element transitions.
- FlashList items must **not** run entering animations during scroll recycling — gate entrance animations to first mount of the screen, not of each recycled row.

---

## 6. Rive vs Lottie vs Skia — decision table

| Use case | Correct tool |
|---|---|
| Mascot, character reactions, stateful icons (toggle, like, streak flame) | **Rive** (state machine + data binding; GPU-rendered; files are KBs vs Lottie's MBs; benchmarks show Rive holding ~60fps where equivalent Lottie drops to ~17fps on low-end devices) |
| Decorative onboarding/marketing loops from an After Effects pipeline | **Lottie** (prefer `.lottie` compressed format; playback-only — play/pause/seek) |
| Confetti, particles, blurs, gradients, custom charts, shader effects, progress rings | **Skia** (worklet-driven, integrates with Reanimated shared values and gestures) |
| Standard UI motion (press, drag, transition, layout) | **Reanimated** directly |

If Lottie appears wired to app state or gestures, that's a defect — migrate to Rive.

---

## 7. Haptics pairing

Motion and haptics fire together; haptics without motion or motion without haptics on key moments is a review finding.

| Moment | Haptic |
|---|---|
| Button press / selection | `selectionAsync()` |
| Snap points during drag (sheet detents, slider ticks) | `impactAsync(Light)` — fired via `runOnJS` exactly at the snap, not per-frame |
| Success / milestone / approval | `notificationAsync(Success)` |
| Error / rejected action | `notificationAsync(Error)` |

---

## 8. Performance review procedure

When asked to audit animation performance, follow this order:

1. **Search for banned APIs** (§2 flags): legacy `Animated`, `LayoutAnimation`, `PanResponder`, `FlatList` on long lists, `setInterval` animation loops.
2. **Check the eight hard rules (§3)** on every file containing `useAnimatedStyle`, `Gesture.`, `withSpring/withTiming`, Skia canvases, or Rive components.
3. **Check per-frame allocations** inside worklets and Skia draw code.
4. **Check `runOnJS` usage** — only at completion boundaries.
5. **Check the platform setup (§4)** — ProMotion plist key, device-tier gating.
6. **Recommend profiling** on a real low-end Android device and an iPhone with ProMotion (simulators hide throttling and refresh-rate behavior). UI-thread FPS must hold 60/120 even when the JS thread is deliberately saturated.

Escalation rule: if a hero surface still drops frames after all of the above, the fix is to move that one surface deeper into Skia (or, as a last resort, a native component) — never to abandon the stack.

---

## 9. Version caveats

- Reanimated 4 requires the New Architecture; anything targeting the old architecture must stay on Reanimated 3.
- RN ≥ 0.82: New Architecture cannot be disabled; legacy bridge removal lands ~0.85. Don't accept dependencies that require the legacy architecture (fork-or-replace decision).
- iOS 120Hz behavior shifts between OS releases; re-verify the ProMotion plist approach after major iOS updates. Budget ~10–15% extra battery if forcing sustained 120Hz — prefer adaptive rates.
- Reanimated 4, Skia, and Rive runtimes move fast; before large refactors, check current release notes rather than assuming the API surface described here is unchanged.
