# Implementation Plan: New Color Palette

This document outlines the step-by-step process for updating the **Piggnify** color palette to match the definitions in [THEME.md](../THEME.md). The priority is maintaining visual consistency and replacing all hardcoded values with theme tokens.

## Phase 1: Core Style Definitions
Update the global design system to incorporate the new HSL values.

- [x] **Update `global.css`**: Replace existing CSS variables in `:root` with the new theme values.
    - [x] Primary: `224 76% 48%`
    - [x] Secondary: `217 91% 60%`
    - [x] Success/Progress/Tertiary: `160 84% 39%`
    - [x] Neutral/Foreground: `222 47% 11%`
    - [x] Muted: `215 16% 47%`
    - [x] Border/Outline: `214 32% 84%`
    - [x] Background: `210 40% 98%`
    - [x] Surface: `0 0% 100%`
    - [x] Warning: `32 95% 44%`
    - [x] Error/Destructive: `0 74% 42%`
- [x] **Extend `tailwind.config.js`**: Ensure all semantic names used in the app are correctly mapped to these variables.
    - [x] Check mapping for `surface-container-low`, `warning-container`, etc.
    - [x] Add `chart-lighter` and `chart-subtle` tokens if necessary.

## Phase 2: Component Audit & Refactoring
Systematically replace hardcoded hex colors with Tailwind theme classes or `hsl(var(...))` calls.

### 1. Navigation & Layout
- [ ] **`app/(tabs)/_layout.tsx`**:
    - [ ] Replace `backgroundColor: '#1f1f22'` with a theme variable.
    - [ ] Replace `tabBarActiveTintColor: '#ffffff'` and `tabBarInactiveTintColor: '#a1a1aa'`.
    - [ ] Replace icon background `bg-[#064e3b]` and active color `#34d399`.

### 2. UI Components (`src/components/ui`)
- [ ] **`button.tsx`**: Verify variant styles use the new variables.
- [ ] **`input.tsx`**: Ensure border and focus ring colors are dynamic.
- [ ] **`switch.tsx`**: Update track and thumb colors.

### 3. Feature Components
- [x] **`ProgressRing.tsx`**: Replace `#27272a` and `#10b981` with variables.
- [x] **`AddExpenseModal.tsx`**: Audit for hardcoded background or text colors.

### 4. Screen-Level Audit
- [x] **`app/(tabs)/index.tsx` (Dashboard)**:
    - [x] Replace flame icon color `#fbbf24`.
    - [x] Replace trending up icon color `#10b981`.
    - [x] Replace chevron right color `#10b981`.
- [x] **`app/(tabs)/goals.tsx`**: Search for hardcoded goal/chart colors.
- [x] **`app/(tabs)/missions.tsx`**: Search for hardcoded reward/status colors.
- [x] **`app/(tabs)/coach.tsx`**: Search for chat bubble/avatar colors.
- [x] **`app/(tabs)/profile.tsx`**: Search for setting/logout colors.
- [x] **`app/onboarding.tsx`**: Search for step indicator and background colors.

## Phase 3: Validation & Polish
- [x] **Visual Review**: Walk through all screens to ensure the new palette feels premium and balanced.
- [x] **Accessibility Check**: Verify text contrast against new background/surface colors.
- [x] **Clean Up**: Remove any unused CSS variables or legacy color definitions.

---

## 🚀 Execution Strategy
1.  Apply `global.css` changes first to see the immediate impact.
2.  Refactor components one by one, starting with the navigation layout.
3.  Commit changes frequently following the `[#7]` issue convention.
