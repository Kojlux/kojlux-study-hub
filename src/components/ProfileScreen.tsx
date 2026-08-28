import React from 'react';
import { Sun, Moon, LogOut, LogIn, User as UserIcon, Flame, Layers, ChevronRight, Trash2, CalendarDays } from 'lucide-react';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { ExamEvent } from '../types';
import { daysUntil, isPastExam } from '../lib/examReminders';
import { examColor } from './CalendarScreen';

interface Props {
  email: string;
  username: string;
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  streak: number;
  totalReviews: number;
  // Guests (the "Skip" path at launch) don't have an account to sign out
  // of — showing "Sign Out" to them was leaving a button on screen that
  // didn't correspond to any real signed-in session. Signed-in users get
  // Sign Out; guests get Sign In instead, routed back to the auth gateway.
  isGuest: boolean;
  onSignOut: () => void;
  onSignIn: () => void;
  // Upcoming-exams preview. Tapping an entry (or "Calendar") jumps to the
  // Calendar tab; passing a date opens it pre-selected on that day.
  exams: ExamEvent[];
  onOpenCalendar: (date?: string) => void;
  onDeleteExam: (id: string) => void;
}

function formatDaysUntil(n: number): string {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

export default function ProfileScreen({
  email, username, gradeLevel, onGradeLevelChange, darkMode, onToggleDarkMode, streak, totalReviews,
  isGuest, onSignOut, onSignIn, exams, onOpenCalendar, onDeleteExam,
}: Props) {
  const upcomingExams = exams
    .filter((e) => !isPastExam(e))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-2xl bg-focus-primary flex items-center justify-center shrink-0">
          <UserIcon className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-base font-black text-slate-900 dark:text-white">{username}</h1>
          <p className="text-xs text-slate-400">{email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
          <Flame className="w-4.5 h-4.5 text-focus-primary" />
          <p className="text-xl font-black mt-1.5 text-slate-900 dark:text-white">{streak}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Day streak</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
          <Layers className="w-4.5 h-4.5 text-focus-primary" />
          <p className="text-xl font-black mt-1.5 text-slate-900 dark:text-white">{totalReviews}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cards reviewed</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Upcoming exams</p>
          <button onClick={() => onOpenCalendar()} className="flex items-center gap-0.5 text-[11px] font-bold text-focus-primary">
            Calendar <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {upcomingExams.length === 0 ? (
          <button
            onClick={() => onOpenCalendar()}
            className="w-full bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center"
          >
            <CalendarDays className="w-4.5 h-4.5 text-slate-300 dark:text-slate-700 mx-auto mb-1" />
            <p className="text-[11px] text-slate-400">No exams on the calendar yet — tap to add one.</p>
          </button>
        ) : (
          upcomingExams.map((exam) => (
            <div
              key={exam.id}
              className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3"
            >
              <button onClick={() => onOpenCalendar(exam.date)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${examColor(exam.color).dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{exam.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(exam.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' · '}
                    {formatDaysUntil(daysUntil(exam))}
                  </p>
                </div>
              </button>
              <button
                onClick={() => onDeleteExam(exam.id)}
                aria-label={`Delete ${exam.title}`}
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Grade level</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_LEVEL_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => onGradeLevelChange(g)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                gradeLevel === g ? 'bg-focus-primary text-white border-focus-primary' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onToggleDarkMode}
        className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4"
      >
        <span className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          {darkMode ? <Moon className="w-4.5 h-4.5 text-focus-primary" /> : <Sun className="w-4.5 h-4.5 text-focus-primary" />}
          {darkMode ? 'Dark mode' : 'Light mode'}
        </span>
        <span className={`w-10 h-5.5 rounded-full p-0.5 transition ${darkMode ? 'bg-focus-primary' : 'bg-slate-200'}`}>
          <span className={`block w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-4.5' : ''}`} />
        </span>
      </button>

      {isGuest ? (
        <button
          onClick={onSignIn}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-focus-primary/30 text-focus-primary text-sm font-bold"
        >
          <LogIn className="w-4 h-4" /> Sign In
        </button>
      ) : (
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-sm font-bold"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      )}
    </div>
  );
}