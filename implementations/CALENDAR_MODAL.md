# Implementation Plan: Calendar Modal for Onboarding

This document outlines the detailed steps to implement a premium calendar modal for goal date selection in the Piggnify onboarding flow.

## 📋 Progress Tracking

### Phase 1: Preparation & GitHub Setup
- [x] Analyze `app/onboarding.tsx` for integration points.
- [x] Create tracking issue [#13](https://github.com/Koin-App-Official/koin/issues/13).
- [x] Create feature branch `feat/issue-13-calendar-modal`.
- [x] Install `react-native-calendars` dependency.

### Phase 2: Core Component Development
- [x] Finalize `src/components/ui/calendar-modal.tsx`.
    - [x] Implement `Modal` wrapper with `AnimatePresence`.
    - [x] Add `moti` slide-up and fade-in animations.
    - [x] Configure `react-native-calendars` with premium theme colors.
    - [x] Implement "Confirm" and "Cancel" buttons using custom `Button` component.
    - [x] Add backdrop dismissal logic.

### Phase 3: Integration into Onboarding Flow
- [x] Update `app/onboarding.tsx` imports.
- [x] Add `isCalendarVisible` state to `Onboarding` component.
- [x] Replace text input with `TouchableOpacity` trigger button.
    - [x] Style trigger to match `Input` aesthetic but with interactive feel.
    - [x] Add `Calendar` icon to the trigger button.
- [x] Mount `CalendarModal` and link to state.

### Phase 4: Visual Polish & UX
- [x] Audit contrast ratios for the calendar UI.
- [x] Ensure smooth haptic-like feedback or transitions on date selection.
- [x] Verify responsiveness on small and large mobile screens.
- [x] Ensure the default date (template-based) is correctly pre-selected in the calendar.

### Phase 5: Verification & Completion
- [x] Verify date format consistency (YYYY-MM-DD).
- [x] Confirm "Continue" button validation still works as expected.
- [x] Close Issue #13.
- [x] Final summary comment on GitHub.

## 🛠 Technical Details

### Analysis of Current State
- **File**: `app/onboarding.tsx`
- **Current UI**: A standard text `Input` is used for the "Target date (YYYY-MM-DD)".
- **Default Behavior**: When a goal template is selected, a default date (+6 months) is set.
- **Validation**: The "Continue" button is enabled only if `deadline` is truthy.

### Proposed UI Trigger
```tsx
<TouchableOpacity 
  onPress={() => setIsCalendarVisible(true)}
  className="h-14 flex-row items-center justify-between rounded-2xl border border-outline bg-surface-container-low px-4"
>
  <Text className="text-base text-on-surface">{deadline || 'Select target date'}</Text>
  <CalendarIcon size={20} color="#64748b" />
</TouchableOpacity>
```
