// Thin wrapper around the browser Notification API.
//
// Reviews are scheduled by data (each RecallCard's `dueAt`, see
// spacedRepetition.ts) but nothing pushes a notification while the tab is
// closed — there's no service worker or push backend in this app. Instead,
// while the app is open, App.tsx polls for cards that just became due and
// fires a local notification through here. Permission is only ever
// requested from a real click (see the banner in App.tsx), never
// automatically, since browsers ignore or block silent/auto requests.

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

// Fires a single local notification letting the student know reviews are
// ready. `tag` collapses repeats into one notification instead of stacking
// a new one every time the poll in App.tsx runs.
export function notifyReviewsReady(count: number) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(count === 1 ? 'A review is ready' : `${count} reviews are ready`, {
      body: 'Head back to Kojlux Study Hub to keep your streak going.',
      tag: 'kojlux-reviews-ready',
    });
  } catch (err) {
    console.error('Failed to show notification', err);
  }
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
export function notifyExamReminder(examTitle: string, examId: string) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification("Don't forget to study!", {
      body: `Your exam "${examTitle}" is tomorrow. Tap here to review your materials.`,
      tag: `kojlux-exam-reminder-${examId}`,
    });
  } catch (err) {
    console.error('Failed to show exam reminder notification', err);
  }
}