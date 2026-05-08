# Implementation Plan: Rename Application to Piggify

This document outlines the step-by-step process for renaming the **Koin** application to **Piggify**.

## Phase 1: Core Configuration Updates
These changes affect the identity of the application at the project and native levels.

- [x] **Update `app.json`**
  - Change `"name": "Koin"` to `"name": "Piggify"`
  - Change `"slug": "koin-mobile"` to `"slug": "piggify-mobile"`
  - Change `"scheme": "koin"` to `"scheme": "piggify"`
  - Change `"ios.bundleIdentifier": "com.koin.app"` to `"com.piggify.app"`
  - Change `"android.package": "com.koin.app"` to `"com.piggify.app"`
  - Change `"plugins[0].organization": "koin-gz"` to `"piggify-gz"` (if applicable)
  - Change `"plugins[0].project": "koin"` to `"piggify"`

- [x] **Update `package.json`**
  - Change `"name": "koin"` to `"name": "piggify"`

- [x] **Update `package-lock.json`**
  - Run `npm install` to synchronize the name change in the lock file.

## Phase 2: Code & UI Refactoring
Updating internal references and user-facing text.

- [x] **Update `src/lib/store.ts`**
  - Rename `KoinState` interface to `PiggifyState`.
  - Update `name: 'koin-storage'` to `name: 'piggify-storage'`.
  - *Note: Changing storage name will reset local state for existing users.*

- [x] **Update User Interface (Text)**
  - `app/(tabs)/coach.tsx`: Update "Koin coach" to "Piggify coach".
  - `app/onboarding.tsx`: Update "Welcome to Koin" to "Welcome to Piggify".
  - `app/(tabs)/profile.tsx`: Update "Koin v..." to "Piggify v...".
  - `app/(tabs)/index.tsx`: Update header text "Koin" to "Piggify".

## Phase 3: Documentation & Guides
Ensuring consistency across project documentation.

- [ ] **Update `GITHUB_ISSUES_GUIDE.md`**
  - Replace "Koin project" with "Piggify project".

- [ ] **Update `README.md`**
  - Update any project titles or descriptions.

- [ ] **Update Implementation Files**
  - `implementations/REACT_EXPO.md`
  - `implementations/FULL_MOBILE.md`

## Phase 4: Verification & Cleanup
- [ ] **Verify Network/Deep Linking**
  - Ensure the new scheme `piggify://` works as expected.
- [ ] **Native Prebuild (if applicable)**
  - Run `npx expo prebuild --clean` to regenerate `android/` and `ios/` folders with the new bundle identifiers and app names.
- [ ] **Final Verification**
  - Run the app in Expo Go or a development client to confirm the name is updated in the UI and settings.
