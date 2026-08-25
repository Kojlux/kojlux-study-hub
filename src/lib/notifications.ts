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
