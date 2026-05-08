# Piggnify - Migration Plan to React Native + Expo

This document outlines a detailed, step-by-step technical plan to rewrite the Piggnify web application into a cross-platform mobile application using React Native and Expo.

## Phase 1: Project Initialization & Infrastructure

1.  **Initialize Expo Project**
    - [x] Create a new Expo project using the Expo Router template: `npx create-expo-app piggnify-mobile -t expo-template-blank-typescript`
    - [x] Set up Expo Router for file-based routing.

2.  **Configure Styling (NativeWind)**
    - [x] Install NativeWind (v4 is recommended for better performance and Expo Router compatibility).
    - [x] Port the existing `tailwind.config.ts` colors (e.g., `primary`, `surface-container`, `warning`, `tertiary`) to the mobile tailwind configuration.
    - [x] Set up `global.css` for any necessary base styles.

3.  **Install Core Dependencies**
    - [x] **Icons**: Replace `lucide-react` with `lucide-react-native`.
    - [x] **Storage**: Install `@react-native-async-storage/async-storage` or `expo-secure-store` for state persistence.
    - [x] **Animations**: Install `react-native-reanimated` and `moti` (to replace `framer-motion`).
    - [x] **SVG Support**: Install `react-native-svg` (essential for porting `ProgressRing.tsx`).
    - [x] **Safe Areas**: Install `react-native-safe-area-context`.
    - [x] **Keyboard Handling**: Install `react-native-keyboard-aware-scroll-view`.

4.  **Path Aliasing**
    - [x] Configure `tsconfig.json` and `babel.config.js` / `metro.config.js` to support `@/*` aliases, mirroring the web setup.

## Phase 2: State Management & Business Logic

The core logic currently resides in `src/lib/store.ts`. This needs to be adapted for mobile.

1.  **Data Models & Constants**
    - [x] Copy over all interfaces (`Goal`, `Expense`, `Mission`, `Achievement`, `UserProfile`).
    - [x] Copy over all constants (`GOAL_TEMPLATES`, `COUNTRIES`, `CURRENCIES`, `EXPENSE_CATEGORIES`). These require zero changes.

2.  **Refactor Storage Engine**
    - [x] **Challenge**: `localStorage` is synchronous. Mobile storage (`AsyncStorage`) is asynchronous.
    - [x] **Solution**: Option A: Use `zustand` with `persist` middleware configured for `AsyncStorage`. Option B: Refactor the custom store to be asynchronous (`async/await` on `get` and `set`), requiring components to handle loading states while the store hydrates.
    - [x] Implement store methods: `getProfile`, `setProfile`, `addGoal`, `completeMission`, `addExpense`, `addXP`, etc.

## Phase 3: UI Foundation & Components

React Native uses native primitives (`View`, `Text`, `TouchableOpacity`) instead of HTML elements (`div`, `span`, `button`).

1.  **Base Components**
    - [x] **Button**: Create a `Button` component using `TouchableOpacity` or `Pressable`, styled with NativeWind to match the existing variants (default, outline, tonal, ghost).
    - [x] **Input**: Create an `Input` component using `TextInput`, ensuring proper styling and placeholder colors.
    - [x] **Switch**: Use the native `Switch` component from `react-native`.
    - [x] **Modal/Dialog**: Replace `AddExpenseModal` with React Native's `Modal` component or use a library like `@gorhom/bottom-sheet` for a premium native feel.

2.  **Progress Ring**
    - [x] Port `src/components/ProgressRing.tsx`.
    - [x] Use `react-native-svg` (`Svg`, `Circle`) to draw the ring.
    - [x] Use `react-native-reanimated` to animate the `strokeDashoffset` when progress changes.

3.  **Layout Shell**
    - [x] Replace `AppShell.tsx` and `BottomNav.tsx` with Expo Router's `<Tabs>` layout.
    - [x] Configure the Tab Bar to match the existing bottom navigation styling, using `lucide-react-native` icons for the tabs.

## Phase 4: Screen Migration (Pages)

Map the existing web pages to Expo Router file paths (`app/(tabs)/*` and `app/*`).

1.  **Dashboard (`app/(tabs)/index.tsx`)**
    - [x] Translate the grid layout (`grid-cols-2`) using Flexbox (`flex-row`, `flex-wrap` or fixed widths).
    - [x] Implement the `AddExpenseModal` logic.
    - [x] Ensure the screen is wrapped in a `ScrollView` and respects `SafeAreaView` so content doesn't overlap with the notch.

2.  **Goals (`app/(tabs)/goals.tsx`)**
    - [x] Port the goals list and the "Create Goal" flow.
    - [x] Replace `framer-motion` layout animations with `moti` or standard `react-native-reanimated` layout transitions.

3.  **Missions (`app/(tabs)/missions.tsx`)**
    - [x] Implement the daily and weekly mission cards.
    - [x] Replace `canvas-confetti` with `react-native-confetti-cannon` for celebration effects when a mission is completed.

4.  **Profile (`app/(tabs)/profile.tsx`)**
    - [x] Implement the profile card, editing logic, and notification toggles.
    - [x] The settings grid can be built using standard `View` and `Text` components.

5.  **AI Coach (`app/(tabs)/coach.tsx`)**
    - [x] Port the chat interface (`AICoach.tsx`).
    - [x] The `fetch` logic for the n8n webhook can be ported exactly as is.
    - [x] Use a library like `react-native-markdown-display` to render the coach's markdown responses natively.
    - [x] Ensure `KeyboardAvoidingView` is correctly configured so the input field isn't hidden by the virtual keyboard.

6.  **Onboarding (`app/onboarding.tsx`)**
    - [x] Port the multi-step onboarding wizard.
    - [x] Use `react-native-pager-view` or a horizontal `ScrollView` with paging enabled for smooth step transitions.
    - [x] Route to the main `(tabs)` layout upon completion.

## Phase 5: Animations & Polish

1.  **Micro-interactions**
    - [x] Add scale animations on button presses using `react-native-reanimated`.
    - [x] Animate list items entering the screen using `moti`.

## Phase 6: Build & Deployment

1.  **App Configuration (`app.json`)**
    - [x] Set the app name to "Piggnify".
    - [x] Configure the `bundleIdentifier` (iOS) and `package` (Android).
    - [x] Set up the app icon and splash screen assets.

2.  **Expo Application Services (EAS)**
    - [x] Initialize EAS: `eas build:configure`.
    - [x] Create development builds to test on physical devices.
    - [x] Prepare for production builds (`eas build --platform ios`, `eas build --platform android`).
