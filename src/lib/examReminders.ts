import { ExamEvent } from '../types';

// ---------------------------------------------------------------------------
// Study Calendar: exam reminder scheduling
//
// This mirrors the shape of spacedRepetition.ts: pure functions that decide
// *when* something is due, with no side effects of their own. The actual
// firing of a notification (and marking `reminderSent`) happens in App.tsx,
// the same place that already polls recall cards for isDue() — see the
// `checkExamReminders` effect there.
//
// IMPORTANT — reliability while the app is closed: exactly like the review
// notifications in lib/notifications.ts, there is no push backend or
// service worker wired up here, so a reminder can only fire while the app
// is open (foreground or backgrounded-but-not-killed) to run this check.
// A student who never reopens the tab between now and the reminder time
// won't get a push. Closing that gap for real needs a server that can wake
// the device (Web Push + VAPID keys, or a native push service) — genuinely
// reliable "OS background delivery" isn't something a client-only PWA can
// promise on its own. Until that exists, the Calendar and Profile "upcoming
// exams" views are the reliable fallback: the reminder is a bonus nudge,
// not the only way the student finds out.
// ---------------------------------------------------------------------------

// How long before the exam's date the reminder becomes due. Fixed at one
// full day per spec, not "whenever the app next happens to poll" — see
// isReminderDue below for the actual instant that gets checked.
const REMINDER_DAYS_BEFORE = 1;

// Local hour the reminder fires on that day. Evening reads better than
// morning for a "study tonight, exam's tomorrow" nudge. Pulled out as a
// constant so it's one place to change if this ever becomes configurable.
const REMINDER_HOUR = 18; // 6:00 PM local time

// Exam dates are stored as plain "YYYY-MM-DD", so building a Date has to
// avoid `new Date("YYYY-MM-DD")` — that parses as UTC midnight, which
// silently rolls back to the *previous* local day in any timezone behind
// UTC (all of the US included). That would make an exam saved for the 5th
// show up on the calendar as the 4th, and fire its reminder a day early.
// Splitting the string and building the Date from local parts sidesteps it.
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getReminderTime(exam: ExamEvent): Date {
  const reminder = parseDateOnly(exam.date);
  reminder.setDate(reminder.getDate() - REMINDER_DAYS_BEFORE);
  reminder.setHours(REMINDER_HOUR, 0, 0, 0);
  return reminder;
}

// True once the reminder instant has passed and hasn't already been sent.
// This intentionally doesn't care whether the exam date itself has already
// passed too — an exam that's already over just never matches this again
// once `reminderSent` is set, same as any other one-shot reminder.
export function isReminderDue(exam: ExamEvent): boolean {
  if (exam.reminderSent) return false;
  return Date.now() >= getReminderTime(exam).getTime();
}

// Whole-day comparison (not `dueAt`-style instant comparison) so an exam
// stops counting as "upcoming" only once its actual day has fully passed,
// regardless of what time of day "now" is.
export function isPastExam(exam: ExamEvent): boolean {
  const end = parseDateOnly(exam.date);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

// Whole-day difference: 0 = today, 1 = tomorrow, negative = already past.
export function daysUntil(exam: ExamEvent): number {
  const examDay = parseDateOnly(exam.date);
  examDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((examDay.getTime() - today.getTime()) / 86_400_000);
}

export function makeExamEvent(params: {
  title: string;
  date: string; // YYYY-MM-DD
  subject?: string;
  color: string;
  notes?: string;
  linkedHistoryId?: string;
}): ExamEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: params.title,
    date: params.date,
    subject: params.subject?.trim() || undefined,
    color: params.color,
    notes: params.notes?.trim() || undefined,
    linkedHistoryId: params.linkedHistoryId,
    createdAt: new Date().toISOString(),
    reminderSent: false,
  };
}
