import { ExamEvent } from '../types';

// ---------------------------------------------------------------------------
// Study Calendar: exam reminder scheduling
//
// This mirrors the shape of spacedRepetition.ts: pure functions that decide
// *when* something is due, with no side effects of their own. The in-app
// notification and `reminderSent` update happen in App.tsx alongside the
// recall-card poll; background delivery is handled by functions/src/index.ts.
//
// IMPORTANT — reliability while the app is closed: this client-side check
// only runs while the app is open. Signed-in users can also receive
// background FCM reminders through the deployed Cloud Function and service
// worker; that path depends on browser support, notification permission,
// successful push registration, and the Firebase function being deployed.
// Guests and users without a working push setup rely on the client-side
// check, so Calendar and Profile's upcoming-exams views remain the fallback.
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
