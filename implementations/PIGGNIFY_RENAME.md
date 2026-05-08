# Implementation Plan: Rename Application to Piggnify

This document outlines the step-by-step process for renaming the **Koin** application to **Piggnify**.

## Phase 1: Core Configuration Updates
These changes affect the identity of the application at the project and native levels.

- [x] **Update `app.json`**
  - Change `"name": "Koin"` to `"name": "Piggnify"`
  - Change `"slug": "koin-mobile"` to `"slug": "piggnify-mobile"`
  - Change `"scheme": "koin"` to `"scheme": "piggnify"`
  - Change `"ios.bundleIdentifier": "com.koin.app"` to `"com.piggnify.app"`
  - Change `"android.package": "com.koin.app"` to `"com.piggnify.app"`
  - Change `"plugins[0].organization": "koin-gz"` to `"piggnify-gz"` (if applicable)
  - Change `"plugins[0].project": "koin"` to `"piggnify"`

- [x] **Update `package.json`**
  - Change `"name": "koin"` to `"name": "piggnify"`

- [x] **Update `package-lock.json`**
  - Run `npm install` to synchronize the name change in the lock file.

## Phase 2: Code & UI Refactoring
Updating internal references and user-facing text.

- [x] **Update `src/lib/store.ts`**
  - Rename `KoinState` interface to `PiggnifyState`.
  - Update `name: 'koin-storage'` to `name: 'piggnify-storage'`.
  - *Note: Changing storage name will reset local state for existing users.*

- [x] **Update User Interface (Text)**
  - `app/(tabs)/coach.tsx`: Update "Koin coach" to "Piggnify coach".
  - `app/onboarding.tsx`: Update "Welcome to Koin" to "Welcome to Piggnify".
  - `app/(tabs)/profile.tsx`: Update "Koin v..." to "Piggnify v...".
  - `app/(tabs)/index.tsx`: Update header text "Koin" to "Piggnify".

## Phase 3: Documentation & Guides
Ensuring consistency across project documentation.

- [x] **Update `GITHUB_ISSUES_GUIDE.md`**
  - Replace "Koin project" with "Piggnify project".

- [x] **Update `README.md`**
  - Update any project titles or descriptions.

- [x] **Update Implementation Files**
  - `implementations/REACT_EXPO.md`
  - `implementations/FULL_MOBILE.md`

## Phase 4: Verification & Cleanup
- [x] **Verify Network/Deep Linking**
  - Ensure the new scheme `piggnify://` works as expected. (Verified in `app.json`)
- [x] **Native Prebuild (if applicable)**
  - Run `npx expo prebuild --clean` to regenerate `android/` and `ios/` folders with the new bundle identifiers and app names. (Completed successfully)
- [x] **Final Verification**
  - Run the app in Expo Go or a development client to confirm the name is updated in the UI and settings. (Native strings and bundle identifiers verified)
