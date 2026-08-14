/**
 * Crash/kill-resistant draft of the onboarding answers.
 *
 * Onboarding is ~9 screens of typed input before an account exists, so losing
 * it to a backgrounded-and-killed app means the user starts over from "what
 * should we call you?". This module persists the answers as they're entered and
 * restores them on next launch.
 *
 * SECURITY: only the user's own answers are stored. The OTP code, the Appwrite
 * OTP user id, and the session secret are deliberately NOT part of `OnboardingDraft`
 * — the session secret has exactly one legitimate home on disk (the PIN-encrypted
 * keychain blob written by `pin.ts`), and a half-finished onboarding must never
 * create a second one. A resumed user always re-enters the email/OTP step.
 *
 * The draft is cleared once onboarding completes; it is NOT the store, and
 * nothing outside `app/onboarding.tsx` should read it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';

const log = createLogger('onboardingDraft');

const STORAGE_KEY = 'piggy-onboarding-draft';

/**
 * Bumped whenever the shape changes incompatibly. A mismatched draft is
 * discarded rather than migrated — it's at most a few minutes of re-typing,
 * which is a far better failure mode than restoring a half-understood draft
 * into a differently-numbered step machine.
 */
const DRAFT_VERSION = 2;

/** Writes are debounced so mid-step typing doesn't hit AsyncStorage per keystroke. */
const SAVE_DEBOUNCE_MS = 500;

export interface OnboardingDraft {
  /** `OnboardingStep` the user had reached. Clamped by the caller on restore. */
  step: number;
  firstName: string;
  country: string;
  currency: string;
  goalName: string;
  targetAmount: string;
  planningMode: 'contribution' | 'deadline';
  contributionInput: string;
  targetDate: string;
  monthlyContribution: number;
  monthlyIncome: string;
  incomeSkipped: boolean;
  dateOfBirth: string;
  /**
   * Persisted so the age gate survives a relaunch: re-opening the app must not
   * hand an under-18 user a fresh, unanswered gate. (Successful confirmation
   * needs no flag — the restored `step` being past AgeGate is the proof.)
   */
  ageBlocked: boolean;
  email: string;
}

interface StoredDraft extends OnboardingDraft {
  v: number;
}

let pendingWrite: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue a debounced write. Fire-and-forget: a failed draft save must never
 * interrupt onboarding, since the draft is a convenience, not the source of truth.
 */
export function saveDraft(draft: OnboardingDraft): void {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    const payload: StoredDraft = { ...draft, v: DRAFT_VERSION };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch((err) => {
      log.warn('saveDraft failed', err);
    });
  }, SAVE_DEBOUNCE_MS);
}

/** Returns the stored draft, or null when absent, unreadable, or from an older version. */
export async function loadDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (parsed?.v !== DRAFT_VERSION) {
      log.info('discarding draft from version', parsed?.v);
      return null;
    }
    const { v: _v, ...draft } = parsed;
    return draft;
  } catch (err) {
    log.warn('loadDraft failed', err);
    return null;
  }
}

/**
 * Drop the draft. Cancels any debounced write first — otherwise a write queued
 * moments before completion would land *after* the delete and resurrect the draft
 * for the next launch.
 */
export async function clearDraft(): Promise<void> {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    log.warn('clearDraft failed', err);
  }
}
