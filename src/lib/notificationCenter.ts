// In-app Notification Center storage. Every notification the app would
// otherwise only fire as a fleeting browser Notification (see
// lib/notifications.ts) is also recorded here, scoped per account/guest the
// same way history and recall cards are (see lib/storage.ts) — so it's
// visible any time the student opens the app, not just in the instant the
// OS notification popped up (and still visible at all if the student never
// granted browser notification permission in the first place).
//
// Deliberately plain localStorage, not Firestore — this is meant to be
// lightweight, device-local "what did I miss" state, not a synced record.
import { NotificationItem, NotificationType, NotificationTargetTab } from '../types';
import { loadLocal, saveLocal, scopedKey } from './storage';

const STORAGE_KEY = 'kojlux_notifications';
// Notifications are useful as a short activity history, not a permanent
// archive. Loading them is also the cleanup point for notifications created
// before this retention rule existed.
const NOTIFICATION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 50;

function key(scopeId: string): string {
  return scopedKey(STORAGE_KEY, scopeId);
}

export function loadNotifications(scopeId: string): NotificationItem[] {
  const stored = loadLocal<NotificationItem[]>(key(scopeId), []);
  const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
  const newestByTag = new Map<string, NotificationItem>();
  const cleaned: NotificationItem[] = [];

  for (const notification of stored) {
    const createdAt = Date.parse(notification.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < cutoff) continue;

    if (notification.dedupeTag) {
      const existing = newestByTag.get(notification.dedupeTag);
      if (existing) continue;
      newestByTag.set(notification.dedupeTag, notification);
    }
    cleaned.push(notification);
  }

  const next = cleaned.slice(0, MAX_NOTIFICATIONS);
  if (JSON.stringify(next) !== JSON.stringify(stored)) saveLocal(key(scopeId), next);
  return next;
}

function saveNotifications(scopeId: string, items: NotificationItem[]): NotificationItem[] {
  saveLocal(key(scopeId), items);
  return items;
}

export interface AddNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  targetTab?: NotificationTargetTab;
  dedupeTag?: string;
}

// Adds a notification and returns the updated list. If `dedupeTag` is set
// and an unread notification with that same tag already exists, this is a
// no-op (returns the list unchanged) — mirrors the browser Notification
// `tag` behavior so re-checking the same due card/exam/draft on every poll
// doesn't spam the center with repeats of something the student hasn't
// even seen yet.
export function addNotification(scopeId: string, input: AddNotificationInput): NotificationItem[] {
  const existing = loadNotifications(scopeId);
  if (input.dedupeTag && existing.some((n) => n.dedupeTag === input.dedupeTag && !n.read)) {
    return existing;
  }
  const item: NotificationItem = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  return saveNotifications(scopeId, [item, ...existing].slice(0, MAX_NOTIFICATIONS));
}

export function markNotificationRead(scopeId: string, id: string): NotificationItem[] {
  const next = loadNotifications(scopeId).map((n) => (n.id === id ? { ...n, read: true } : n));
  return saveNotifications(scopeId, next);
}

// Marks every *unread* notification carrying a given dedupeTag as read,
// without deleting it — used when the underlying condition resolves itself
// (e.g. the student finishes their due reviews) so a stale "27 reviews are
// ready" entry doesn't sit there looking urgent after it no longer is, but
// still remains in the list as a record of what happened.
export function markNotificationsByTagRead(scopeId: string, dedupeTag: string): NotificationItem[] {
  const next = loadNotifications(scopeId).map((n) =>
    n.dedupeTag === dedupeTag && !n.read ? { ...n, read: true } : n
  );
  return saveNotifications(scopeId, next);
}

// Like addNotification, but for state that changes over time under the same
// tag (e.g. "how many reviews are due right now") rather than a one-off
// event. If an *unread* notification with this tag already exists, its
// title/body/target are refreshed in place instead of stacking a new entry
// — the bell always shows the current true state, never a stale count next
// to a newer one. Once the student reads it, the next update starts a fresh
// (again singular) unread entry.
export function upsertNotification(
  scopeId: string,
  dedupeTag: string,
  input: Omit<AddNotificationInput, 'dedupeTag'>
): NotificationItem[] {
  const existing = loadNotifications(scopeId);
  const idx = existing.findIndex((n) => n.dedupeTag === dedupeTag && !n.read);
  if (idx === -1) {
    return addNotification(scopeId, { ...input, dedupeTag });
  }
  const next = [...existing];
  next[idx] = {
    ...next[idx],
    title: input.title,
    body: input.body,
    targetTab: input.targetTab,
    type: input.type,
    createdAt: new Date().toISOString(),
  };
  return saveNotifications(scopeId, next);
}

export function markAllNotificationsRead(scopeId: string): NotificationItem[] {
  const next = loadNotifications(scopeId).map((n) => (n.read ? n : { ...n, read: true }));
  return saveNotifications(scopeId, next);
}

export function clearNotification(scopeId: string, id: string): NotificationItem[] {
  return saveNotifications(scopeId, loadNotifications(scopeId).filter((n) => n.id !== id));
}