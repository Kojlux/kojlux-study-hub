import React from 'react';
import { ArrowLeft, Bell, BellOff, CheckCheck, Brain, CalendarClock, FileText } from 'lucide-react';
import { NotificationItem } from '../types';

interface Props {
  notifications: NotificationItem[];
  onSelect: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

// Full-screen overlay, same pattern as the old Study Calendar overlay it
// replaces in the Home header (see App.tsx) — a header with a Back button,
// scrollable content below.
export default function NotificationCenter({ notifications, onSelect, onMarkAllRead, onClose }: Props) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-[150] bg-focus-bg dark:bg-slate-950 overflow-y-auto md:pl-20 lg:pl-56">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3 flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Back"
            className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
          <h1 className="flex-1 text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-focus-primary"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
        </header>

        <main className="flex-1 px-5 pb-10 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2.5 py-20">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center">
                <BellOff className="w-5 h-5 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-xs font-semibold text-slate-400 max-w-[220px]">
                You're all caught up — nothing here yet.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className={`w-full flex items-start gap-3 text-left rounded-2xl p-3.5 border transition ${
                  item.read
                    ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                    : 'bg-focus-primary/10 dark:bg-focus-primary/15 border-focus-primary/25'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <NotificationIcon type={item.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{item.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                {!item.read && <span className="w-2 h-2 rounded-full bg-focus-primary shrink-0 mt-1.5" />}
              </button>
            ))
          )}
        </main>
      </div>
    </div>
  );
}

function NotificationIcon({ type }: { type: NotificationItem['type'] }) {
  if (type === 'review_ready') return <Brain className="w-4 h-4 text-focus-primary" />;
  if (type === 'exam_reminder') return <CalendarClock className="w-4 h-4 text-focus-primary" />;
  if (type === 'quiz_resume') return <FileText className="w-4 h-4 text-focus-primary" />;
  return <Bell className="w-4 h-4 text-focus-primary" />;
}