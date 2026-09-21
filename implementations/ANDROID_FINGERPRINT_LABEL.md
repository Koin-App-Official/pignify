# Android biometric unlock: "Fingerprint" label + icon instead of "Face ID"

> Tracking issue: [#193](https://github.com/Koin-App-Official/pignify/issues/193)
> Branch: `fix/issue-193-android-fingerprint-label`

## Context

On Android the biometric-unlock UI can currently render the **"Face ID"** label together with the
`ScanFace` icon. That is wrong twice over: "Face ID" is Apple's trademarked product name and has no
meaning on Android, and the affordance users actually reach for on these devices is the fingerprint
sensor. The goal is: **on Android the user never sees "Face ID" or a face icon — they see the
fingerprint label and the fingerprint glyph.** iOS behaviour must not change.

## Current architecture (confirmed by reading the code)

There is exactly **one producer** of the biometric label/icon decision and **three consumers**.

**Producer** — [src/lib/biometrics.ts:33-39](src/lib/biometrics.ts:33):

```ts
export async function getBiometricKind(): Promise<BiometricKind> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'none';
}
```

This is the whole bug. There is **no `Platform.OS` branch anywhere in the biometric path** (verified
by grep — the only `Platform.OS` hit in `src/components/auth/` is
[LoginGate.tsx:174](src/components/auth/LoginGate.tsx:174) for `KeyboardAvoidingView`). `FACIAL_RECOGNITION`
is checked **first**, and a great many Android devices advertise `FACIAL_RECOGNITION` support for
their manufacturer face-unlock convenience feature — even when the fingerprint sensor is the real,
enrolled, secure-grade biometric. Those devices fall into the `'face'` branch and get iOS copy.

**Consumers** (all three are display-only):

| # | Site | Uses the kind for |
|---|---|---|
| 1 | [app/settings.tsx:184-185](app/settings.tsx:184) | `bioLabel` (`biometric.faceId` / `irisUnlock` / `fingerprintUnlock`) + `BioIcon` (`ScanFace` vs `Fingerprint`) |
| 2 | [src/components/auth/PinPad.tsx:91-95](src/components/auth/PinPad.tsx:91) | `BiometricIcon` + a11y label (`a11y.unlockWithFaceId` / `a11y.unlockWithFingerprint`) |
| 3 | [src/components/auth/PinCreationFlow.tsx:158,166,173](src/components/auth/PinCreationFlow.tsx:158) | `isFace` → enrolment screen title + button copy |

The **only** non-display use of the value anywhere is `biometricKind !== 'none'` at
[PinPad.tsx:116](src/components/auth/PinPad.tsx:116), which gates whether the biometric key is shown at
all. Remapping `'face' → 'fingerprint'` cannot affect that check, because neither value is `'none'`.
[LockGate.tsx:60](src/components/auth/LockGate.tsx:60) merely fetches the kind and forwards it to
`PinPad` as a prop; it makes no decision of its own.

**This means the fix can live entirely inside `getBiometricKind()` and all three call sites keep
working untouched.** That is the approach this plan takes — see Decision 1.

**i18n state.** Keys already exist in all four locales (`en`, `pl`, `de`, `hu`) and key-parity is
enforced by [src/lib/i18n/locales.test.ts](src/lib/i18n/locales.test.ts), so any *new* key must be added
to all four or the suite fails:

- `settings:biometric.faceId` / `.irisUnlock` / `.fingerprintUnlock`
- `common:a11y.unlockWithFaceId` / `.unlockWithFingerprint`
- `auth:pinCreation.unlockFasterWithFaceId` / `.unlockFasterWithBiometrics`
- `auth:pinCreation.enableFaceId` / `.enableBiometrics`

Consumers 1 and 2 already have exact fingerprint strings to fall into, so they need **zero i18n
work**. Consumer 3 does not — its non-face branch says the generic *"Unlock faster with biometrics?"*
/ *"Enable biometrics"*. See Decision 3.

**Out of scope.** `app.json:62` `faceIDPermission` is the `expo-local-authentication` plugin's
**iOS-only** `NSFaceIDUsageDescription`; it is never surfaced on Android and must not be touched.
The native OS prompt text itself (`auth:biometricPrompt.*`) is already platform-neutral
("Confirm to enable biometric unlock") and needs no change.

## Decisions to confirm before implementing

**Decision 1 — where the override lives.** Recommended: **inside `getBiometricKind()`**. One guard,
three call sites untouched, impossible to forget a fourth consumer later. The cost is semantic drift —
the function stops reporting true hardware and starts reporting "what to show the user." Its docblock
already says *"Best-effort label for UI copy"*, so this is consistent with its stated contract; the
plan tightens that comment to make it explicit. The alternative — branching at each of the three call
sites — keeps the function honest but triples the code and leaves the trap open.

**Decision 2 — what happens to `'iris'` on Android.** Recommended: **leave it alone.** Samsung devices
report `IRIS`, and "Iris unlock" is an accurate, non-trademarked, Android-appropriate label that
already exists in all four locales. Only `'face'` is the reported bug. (If you would rather collapse
*everything* on Android to fingerprint, say so — it is a one-word change to the same guard.)

**Decision 3 — Consumer 3's copy.** With the guard alone, the PIN-creation enrolment screen on Android
reads *"Unlock faster with biometrics?"* / *"Enable biometrics"* — correct and non-trademarked, but
generic rather than the literal "Fingerprint" you asked for. Phase 3 adds dedicated
`unlockFasterWithFingerprint` / `enableFingerprint` keys across all four locales so this screen says
"Fingerprint" too. **Phase 3 is optional** — skip it if the generic wording is fine, and Phases 1/2/4
still fully close the issue.

---

## Phase 1 — Platform guard in the biometrics library

The whole behavioural fix.

- [x] Import `Platform` from `react-native` in `src/lib/biometrics.ts`.
- [x] In `getBiometricKind()`, after resolving the kind from `supportedAuthenticationTypesAsync()`,
      return `'fingerprint'` instead of `'face'` when `Platform.OS === 'android'`.
- [x] Keep the `'iris'` and `'none'` results untouched on both platforms (Decision 2).
- [x] Update the function's docblock to state the contract explicitly: this returns the **kind to
      display**, not the raw hardware capability, and Android never yields `'face'` because "Face ID"
      is an Apple term.
- [x] Update the file-header comment at `biometrics.ts:1-9`, which currently says "Face/Touch ID" as
      if iOS were the only platform.

**Files modified:** `src/lib/biometrics.ts`

**Phase complete when:** `getBiometricKind()` provably cannot return `'face'` on Android, iOS
resolution is byte-for-byte unchanged, and `npm run typecheck` passes. ✅ Done — `npm run typecheck`
passed clean.

---

## Phase 2 — Verify the three consumers inherit the fix

No code changes expected here — this phase exists to *prove* the single-point fix actually reaches
every surface, and to catch any consumer that reads the hardware type by another route.

- [x] Re-grep for `=== 'face'`, `ScanFace`, `faceId`, `FACIAL_RECOGNITION` across `src/` and `app/` to
      confirm no fourth consumer appeared and nothing else calls
      `supportedAuthenticationTypesAsync()` directly. Confirmed: only the three known consumers
      reference `'face'`, and `getBiometricKind()` is the sole caller of
      `supportedAuthenticationTypesAsync()`.
- [x] Trace Consumer 1 ([app/settings.tsx:184-185](app/settings.tsx:184)): Android now hits
      `t('biometric.fingerprintUnlock')` → "Fingerprint unlock", icon `Fingerprint`. Confirmed.
- [x] Trace Consumer 2 ([PinPad.tsx:91-95](src/components/auth/PinPad.tsx:91)): Android now hits
      `t('a11y.unlockWithFingerprint')` → "Unlock with fingerprint", icon `Fingerprint`. Confirmed.
- [x] Trace Consumer 3 ([PinCreationFlow.tsx:158](src/components/auth/PinCreationFlow.tsx:158)): Android
      now hits the `unlockFasterWithBiometrics` / `enableBiometrics` branch (upgraded in Phase 3).
      Confirmed.
- [x] Confirm the `biometricKind !== 'none'` gate at [PinPad.tsx:116](src/components/auth/PinPad.tsx:116)
      is unaffected — the biometric key must still appear on Android. Confirmed: neither `'face'` nor
      `'fingerprint'` is `'none'`, so the remap cannot change this branch's outcome.
- [x] Only if the grep surfaces something unexpected: patch that site and note it here. Nothing
      unexpected surfaced — no patch needed.

**Files modified:** none — verification phase, no surprises found.

**Phase complete when:** every surface that can render a biometric label/icon is accounted for, and
each is confirmed to land on fingerprint copy on Android. ✅ Done.

---

## Phase 3 — Dedicated "Fingerprint" copy for the PIN-creation screen *(optional — Decision 3)*

Skip this phase if generic "biometrics" wording on the enrolment screen is acceptable.

- [x] Add `pinCreation.unlockFasterWithFingerprint` and `pinCreation.enableFingerprint` to
      `src/lib/i18n/locales/en/auth.json`.
- [x] Add the same two keys, properly translated, to the `pl`, `de`, and `hu` `auth.json` files —
      key-parity is enforced by `locales.test.ts` and a missing key fails the suite.
- [x] Keep the existing `unlockFasterWithBiometrics` / `enableBiometrics` keys as the fallback for
      `'iris'` and any future kind; do **not** delete them (the parity test would also flag them as
      dead if they become unused — confirm they still have a live call site). Confirmed: still used
      as the `'iris'`/`'none'` fallback branch in `PinCreationFlow.tsx`.
- [x] In `PinCreationFlow.tsx`, replace the binary `isFace` ternary with a three-way selection over
      `bioKind` (`'face'` → Face ID copy, `'fingerprint'` → new fingerprint copy, else → generic
      biometrics copy).

**Files modified:** `src/lib/i18n/locales/{en,pl,de,hu}/auth.json`,
`src/components/auth/PinCreationFlow.tsx`

**Phase complete when:** the enrolment screen says "Fingerprint" on Android in all four languages,
iOS still says "Face ID", and `npm test` passes including the i18n parity suites. ✅ Done —
`npm run typecheck` and both i18n parity suites (84 tests) pass.

---

## Phase 4 — Tests, verification, and close-out

- [x] Add `src/lib/biometrics.test.ts` with `vi.mock` for `expo-local-authentication` and
      `react-native`'s `Platform` (the `vi.mock`-the-native-module pattern is already established in
      [src/lib/onboardingDraft.test.ts:9](src/lib/onboardingDraft.test.ts:9)). Cases:
      - [x] Android + device reports `FACIAL_RECOGNITION` → `'fingerprint'` **(the regression guard)**
      - [x] Android + `FINGERPRINT` → `'fingerprint'`
      - [x] Android + `IRIS` → `'iris'` (pins Decision 2)
      - [x] iOS + `FACIAL_RECOGNITION` → `'face'` (pins the no-iOS-regression promise)
      - [x] Either platform + no types → `'none'`
- [x] `npm test` — full suite green, i18n parity included. 20 files / 395 tests passed.
- [x] `npm run typecheck` — clean.
- [ ] Manual check on an Android device/emulator that reports face-unlock hardware: Settings row,
      PIN-pad key, and PIN-creation enrolment screen all show fingerprint label + glyph. **Left for
      user (self-verifies UI changes).**
- [ ] Manual check on iOS: still "Face ID" + `ScanFace` — no regression. **Left for user.**
- [ ] Commit as `[#193] <description>`, tick the checklist on issue #193, post the completion
      comment, and open the PR with `Closes #193`.

**Files modified:** `src/lib/biometrics.test.ts` (new)

**Phase complete when:** the regression test fails against the old code and passes against the new,
the full suite and typecheck are green, both platforms are manually verified, and the PR is open and
linked to #193. Automated portion done — regression test confirmed failing against pre-fix code
(`git stash` check) and passing against the fix; full suite (395 tests) and typecheck are green.
Manual device checks and PR are next.

---

## Risk notes

- **Blast radius is one function.** All three consumers are display-only and the single semantic check
  (`!== 'none'`) is provably unaffected, so there is no path by which this change can disable biometric
  unlock or alter the crypto in `enableBiometric` / `unlockWithBiometric`.
- **No stored data changes.** `BiometricKind` is derived fresh on every mount and never persisted, so
  there is no migration and no stale-value concern for existing installs.
- **The i18n parity suite is the tripwire for Phase 3** — adding a key to `en` alone will fail loudly
  rather than silently shipping an untranslated string.
