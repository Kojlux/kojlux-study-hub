// Thin wrapper around the browser Notification API.
//
// Reviews are scheduled by data (each RecallCard's `dueAt`, see
// spacedRepetition.ts). App.tsx polls while open and fires local
// notifications through here; signed-in users can also receive background
// FCM pushes through lib/push.ts and the deployed Cloud Function.
// Permission is only ever requested from a real click (see the banner in
// App.tsx), never automatically, since browsers ignore or block silent/auto
// requests.

import type { NotificationItem, NotificationTargetTab } from '../types';
import { buildNotificationUrl } from './notificationLinks';

export type NotificationSupportState = NotificationPermission | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationSupportState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationSupportState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('Notification permission request failed', err);
    return Notification.permission;
  }
}

async function showNotification(
  title: string,
  tag: string,
  url: string,
  body: string,
  renotify = true
): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const base = import.meta.env.BASE_URL;
    const options: NotificationOptions & { renotify?: boolean; badge?: string } = {
      body,
      tag,
      renotify,
      data: { url },
      icon: `${base}icon.png`,
      badge: `${base}notification-badge.svg`,
    };
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }

    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      window.location.assign(url);
    };
  } catch (err) {
    console.error('Failed to show notification', err);
  }
}

export async function dismissBrowserNotification(item: NotificationItem): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const tag = item.type === 'review_ready'
    ? 'kojlux-reviews-ready'
    : item.type === 'exam_reminder' && item.targetId
      ? `kojlux-exam-reminder-${item.targetId}`
      : null;
  if (!tag) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = await registration?.getNotifications({ tag });
    notifications?.forEach((notification) => notification.close());
  } catch (err) {
    console.error('Failed to dismiss browser notification', err);
  }
}

// Fires a single local notification letting the student know reviews are
// ready. `tag` collapses repeats instead of stacking notifications.
export function notifyReviewsReady(count: number): void {
  const title = count === 1 ? 'A review is ready' : `${count} reviews are ready`;
  void showNotification(
    title,
    'kojlux-reviews-ready',
    buildNotificationUrl('review'),
    'Head back to Kojlux Study Hub to keep your streak going.'
  );
}

// The Study Calendar's 1-day-before exam reminder. `examId` is folded into
// the tag (not just a fixed string like the one above) so two different
// exams due on the same check never collapse into a single notification —
// each exam gets its own, but re-checking the same exam again can't stack
// duplicates of it. See lib/examReminders.ts for the "why 1 day" context.
//
// This tag is intentionally IDENTICAL to the one functions/index.ts sends
// for the same exam via server push (see checkDueReminders there). Two
// separate systems can produce this same reminder — this in-app check
// (only runs while the tab is open) and the server-side Cloud Function
// (runs even with the browser closed, see lib/push.ts + sw.js). Sharing
// the exact tag string means if both ever fire for the same exam, the OS
// treats them as "the same notification" and shows one, not two. If you
// ever change this tag, change the matching one in functions/index.ts too
// (they're separate deployable projects, so nothing enforces this
// automatically — it's a manual "keep these two in sync" spot).
export function notifyExamReminder(examTitle: string, examId: string): void {
  void showNotification(
    "Don't forget to study!",
    `kojlux-exam-reminder-${examId}`,
    buildNotificationUrl('profile', examId),
    `Your exam "${examTitle}" is tomorrow. Tap here to review your materials.`,
    false
  );
}