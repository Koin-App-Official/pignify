import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from 'i18next';
import type { SupportedLanguage } from './i18n/detect';

/**
 * Local-only notification engine (no push/remote infra exists yet — see
 * implementation plan). Every scheduled category has a stable identifier so
 * `Notifications.scheduleNotificationAsync` can be called repeatedly and stay
 * idempotent (cancel-then-reschedule) rather than piling up duplicates.
 *
 * Content is translated at schedule time (not fire time — local notifications
 * are pre-rendered strings, not re-evaluated by the OS), via `i18n.getFixedT`
 * against the given `language`. Deliberately imports the raw `i18next`
 * package rather than this app's `./i18n/index.ts` bootstrap — that wrapper
 * imports `useStore` from store.ts (to subscribe to language changes), and
 * store.ts imports this module, so importing the wrapper here would be
 * circular. The raw package export is the same singleton instance either
 * way, already initialized with every namespace by the time any of these
 * functions run (they're only ever called after the app has mounted).
 */

/** Time-sensitive nudges the user should act on today (daily check-in, trial ending). */
const CHANNEL_REMINDERS = 'piggy-reminders';
/** Recap/celebration notifications with no same-day deadline (weekly reflection, milestones). */
const CHANNEL_DIGEST = 'piggy-digest';

const IDS = {
  dailyCheckin: 'daily-checkin',
  weeklyReflection: 'weekly-reflection',
  trialEnding: 'trial-ending',
} as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_DIGEST, {
      name: 'Digests & celebrations',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Reads current OS permission state without prompting — used to detect revocation after the fact. */
export async function getNotificationPermissionStatus(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function cancel(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** How many days before the trial ends the reminder fires (day 12 of 14). */
const TRIAL_REMINDER_DAYS_BEFORE = 2;

/** 8:30pm — fallback evening slot used until we've learned when this user is actually active. */
export const DEFAULT_HOUR = 20;
const EVENING_MINUTE = 30;

/** Notifications never fire outside this window, even if a learned "preferred hour" falls outside it. */
const QUIET_HOURS_START = 8;
const QUIET_HOURS_END = 21;

function clampToQuietHours(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_HOUR;
  return Math.min(QUIET_HOURS_END, Math.max(QUIET_HOURS_START, Math.round(hour)));
}

function nextOccurrenceAt(hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

export interface DailyCheckinParams {
  enabled: boolean;
  /** False when there's no goal with a monthly contribution yet — nothing for a daily target to check against. */
  hasActiveTarget: boolean;
  targetMet: boolean;
  streak: number;
  /** Pre-formatted remaining amount, e.g. "$4" — computed by the caller, which owns currency formatting. */
  remainingLabel: string;
  /** True once the reminder's been ignored 3+ days running — thins the schedule to every other day. */
  decayed: boolean;
  /** Learned hour (0-23) this user is typically active; falls back to `DEFAULT_HOUR` until there's enough data. */
  preferredHour: number;
  language: SupportedLanguage;
}

export async function scheduleDailyCheckin(p: DailyCheckinParams) {
  await cancel(IDS.dailyCheckin);
  if (!p.enabled) return;

  const t = i18n.getFixedT(p.language, 'notifications');
  const hour = clampToQuietHours(p.preferredHour);

  if (!p.hasActiveTarget) {
    // Zero-state: no goal/contribution set yet, so there's no daily target to protect.
    // Nudge toward creating one instead of just going quiet — capped to every 3rd day
    // so it doesn't nag nightly with no way for the user to "complete" it.
    if (new Date().getDate() % 3 !== 0) return;
    await Notifications.scheduleNotificationAsync({
      identifier: IDS.dailyCheckin,
      content: {
        title: t('firstGoal.title'),
        body: t('firstGoal.body'),
        data: { type: 'daily-checkin' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextOccurrenceAt(hour, EVENING_MINUTE),
        channelId: CHANNEL_REMINDERS,
      },
    });
    return;
  }

  if (p.targetMet) return;

  // Decayed reminders skip every other day (even calendar dates) instead of nagging nightly.
  if (p.decayed && new Date().getDate() % 2 === 0) return;

  const title = p.streak > 0 ? t('checkin.titleStreak') : t('checkin.titlePlain');
  const body =
    p.streak > 0
      ? t('checkin.bodyStreak', { streak: p.streak, remaining: p.remainingLabel })
      : t('checkin.bodyPlain');

  await Notifications.scheduleNotificationAsync({
    identifier: IDS.dailyCheckin,
    content: { title, body, data: { type: 'daily-checkin' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextOccurrenceAt(hour, EVENING_MINUTE),
      channelId: CHANNEL_REMINDERS,
    },
  });
}

export async function scheduleWeeklyReflection(params: {
  enabled: boolean;
  /** False when nothing was saved or logged this week — nothing to reflect on. */
  hasActivity: boolean;
  savedLabel: string;
  expenseCount: number;
  /** Learned hour (0-23) this user is typically active; falls back to `DEFAULT_HOUR` until there's enough data. */
  preferredHour: number;
  language: SupportedLanguage;
}) {
  await cancel(IDS.weeklyReflection);
  if (!params.enabled || !params.hasActivity) return;

  const t = i18n.getFixedT(params.language, 'notifications');

  await Notifications.scheduleNotificationAsync({
    identifier: IDS.weeklyReflection,
    content: {
      title: t('weeklyReflection.title'),
      body: t('weeklyReflection.body', { count: params.expenseCount, saved: params.savedLabel }),
      data: { type: 'weekly-reflection' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      weekday: 1, // Sunday (iOS/expo convention: 1 = Sunday)
      hour: clampToQuietHours(params.preferredHour),
      minute: 0,
      repeats: true,
      channelId: CHANNEL_DIGEST,
    },
  });
}

export async function scheduleTrialEnding(params: {
  enabled: boolean;
  isTrialing: boolean;
  currentPeriodEnd: string | null;
  planDisplayName: string;
  language: SupportedLanguage;
}) {
  await cancel(IDS.trialEnding);
  if (!params.enabled || !params.isTrialing || !params.currentPeriodEnd) return;

  const periodEnd = new Date(params.currentPeriodEnd);
  if (Number.isNaN(periodEnd.getTime())) return;

  // Two days out (day 12 of 14), not one. There is no card on file, so nothing
  // converts on its own — this reminder is the only signal the user gets, and a
  // single day's notice to act on something is thin.
  const fireAt = new Date(periodEnd);
  fireAt.setDate(fireAt.getDate() - TRIAL_REMINDER_DAYS_BEFORE);
  fireAt.setHours(10, 0, 0, 0);
  if (fireAt.getTime() <= Date.now()) return; // already inside the window (or past) — nothing to schedule

  const t = i18n.getFixedT(params.language, 'notifications');

  await Notifications.scheduleNotificationAsync({
    identifier: IDS.trialEnding,
    content: {
      title: t('trialEnding.title'),
      // Deliberately no "payment method" language: this is a no-card trial, so
      // there is nothing on file and nothing to have already done.
      body: t('trialEnding.body', { plan: params.planDisplayName }),
      data: { type: 'trial-ending' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: CHANNEL_REMINDERS,
    },
  });
}

/** Immediate (unscheduled) local notification for milestone/achievement events. */
export async function fireMilestoneNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { type: 'milestone' } },
    trigger: { channelId: CHANNEL_DIGEST },
  });
}

export interface RefreshScheduleParams {
  streakProtectionEnabled: boolean;
  milestoneAlertsEnabled: boolean;
  weeklyReflectionEnabled: boolean;
  hasActiveTarget: boolean;
  targetMet: boolean;
  streak: number;
  remainingLabel: string;
  checkinIgnoredStreak: number;
  hasWeeklyActivity: boolean;
  savedThisWeekLabel: string;
  expenseCountThisWeek: number;
  /** Learned hour (0-23) this user is typically active; falls back to `DEFAULT_HOUR` until there's enough data. */
  preferredHour: number;
  planStatus: string;
  currentPeriodEnd: string | null;
  planDisplayName: string;
  language: SupportedLanguage;
}

/** Single entry point that (re)computes every scheduled (non-immediate) category from current app state. */
export async function refreshNotificationSchedule(p: RefreshScheduleParams) {
  await Promise.all([
    scheduleDailyCheckin({
      enabled: p.streakProtectionEnabled,
      hasActiveTarget: p.hasActiveTarget,
      targetMet: p.targetMet,
      streak: p.streak,
      remainingLabel: p.remainingLabel,
      decayed: p.checkinIgnoredStreak >= 3,
      preferredHour: p.preferredHour,
      language: p.language,
    }),
    scheduleWeeklyReflection({
      enabled: p.weeklyReflectionEnabled,
      hasActivity: p.hasWeeklyActivity,
      savedLabel: p.savedThisWeekLabel,
      expenseCount: p.expenseCountThisWeek,
      preferredHour: p.preferredHour,
      language: p.language,
    }),
    scheduleTrialEnding({
      enabled: true, // trial-ending is billing-critical — not gated behind a notificationPrefs toggle
      isTrialing: p.planStatus === 'trialing',
      currentPeriodEnd: p.currentPeriodEnd,
      planDisplayName: p.planDisplayName,
      language: p.language,
    }),
  ]);
}
