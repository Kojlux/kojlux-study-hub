import type { NotificationTargetTab } from '../types';

const NOTIFICATION_TABS: NotificationTargetTab[] = ['home', 'quiz', 'community', 'review', 'profile'];

export interface NotificationLink {
  tab: NotificationTargetTab;
  examId?: string;
}

export function buildNotificationUrl(tab: NotificationTargetTab, examId?: string): string {
  const url = new URL('.', window.location.href);
  url.searchParams.set('notification', '1');
  url.searchParams.set('tab', tab);
  if (examId) url.searchParams.set('examId', examId);
  return url.href;
}

export function parseNotificationLink(): NotificationLink | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('notification') !== '1') return null;

  const tab = NOTIFICATION_TABS.find((candidate) => candidate === params.get('tab'));
  if (!tab) return null;
  const examId = params.get('examId') || undefined;
  return { tab, examId };
}

export function clearNotificationLink(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('notification');
  url.searchParams.delete('tab');
  url.searchParams.delete('examId');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
