import React, { useEffect, useRef, useState } from 'react';
import { LogOut, LogIn, User as UserIcon, Flame, Layers, Menu, X, Mail, ChevronDown, Check, Bell, BellOff, BellRing } from 'lucide-react';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { ExamEvent, HistoryItem } from '../types';
import { NotificationSupportState } from '../lib/notifications';
import CalendarScreen from './CalendarScreen';
import ThemeSwitcher from './ThemeSwitcher';

interface Props {
  email: string;
  username: string;
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
  // Superseded by the in-screen theme picker (see ThemeSwitcher), which now
  // owns light/dark plus 5 additional palettes and persists the choice
  // itself. Left optional here only so a parent still passing these props
  // doesn't need to change; ProfileScreen no longer reads them.
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  streak: number;
  totalReviews: number;
  // Guests (the "Skip" path at launch) don't have an account to sign out
  // of — showing "Sign Out" to them was leaving a button on screen that
  // didn't correspond to any real signed-in session. Signed-in users get
  // Sign Out; guests get Sign In instead, routed back to the auth gateway.
  isGuest: boolean;
  onSignOut: () => void;
  onSignIn: () => void;
  // Full exam CRUD + history, so the Study Calendar can be embedded
  // directly on this screen instead of only linking out to it.
  exams: ExamEvent[];
  history: HistoryItem[];
  onAddExam: (exam: ExamEvent) => void;
  onUpdateExam: (exam: ExamEvent) => void;
  onDeleteExam: (id: string) => void;
  // Always shown in Settings (not just in the dismissible Home banner) so a
  // student can check whether notifications are actually on without having
  // to remember whether they dismissed that banner earlier. Owned by App.tsx
  // (see enableNotifications there) so this screen and the Home banner never
  // drift out of sync with each other.
  notifPermission: NotificationSupportState;
  onEnableNotifications: () => void;
}

export default function ProfileScreen({
  email, username, gradeLevel, onGradeLevelChange, streak, totalReviews,
  isGuest, onSignOut, onSignIn, exams, history, onAddExam, onUpdateExam, onDeleteExam,
  notifPermission, onEnableNotifications,
}: Props) {
  // Grade level, appearance, account email, and sign out/in used to live
  // inline on this screen. They're account/settings-flavored rather than
  // things a student checks every visit, so they've moved into a slide-out
  // menu opened from the icon in the header — freeing up the space right
  // under the stats row for the Study Calendar to live inline instead of
  // just a short "upcoming exams" preview that linked out to it.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-focus-primary flex items-center justify-center shrink-0">
            <UserIcon className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black text-slate-900 dark:text-white truncate">{username}</h1>
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open settings menu"
          className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
        >
          <Menu className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <div className="px-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Exam Reminders</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Mark exam days your teacher gave you — we'll remind you to study.</p>
        </div>
        <CalendarScreen
          exams={exams}
          history={history}
          onAddExam={onAddExam}
          onUpdateExam={onUpdateExam}
          onDeleteExam={onDeleteExam}
        />
      </div>

      {/* Settings drawer — kept mounted (rather than only rendered while
          open) so the slide/backdrop-fade transition below actually has
          something to animate between; pointer-events-none plus opacity-0
          takes it fully out of the way when closed. */}
      <div
        className={`fixed inset-0 z-[250] transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!menuOpen}
      >
        <div
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute top-0 right-0 h-full w-[82%] max-w-xs sm:max-w-sm bg-focus-bg dark:bg-slate-950 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-6 pb-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Settings</p>
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close settings menu"
              className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{email || 'Signed in as guest'}</span>
            </div>

            <GradeLevelSelect gradeLevel={gradeLevel} onGradeLevelChange={onGradeLevelChange} />

            <NotificationStatusRow permission={notifPermission} onEnable={onEnableNotifications} />

            <ThemeSwitcher />

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
        </div>
      </div>
    </div>
  );
}

// Always visible in Settings — not just the dismissible "enable
// notifications?" banner on Home, which the student may have already
// dismissed (or never seen, e.g. on desktop with no due cards yet). This is
// read-only status plus, when it's actually actionable, a way to act on it:
// 'granted'/'denied' can only be changed from the browser's own site
// settings (the Notification API can't re-prompt once denied), so only the
// 'default' state gets an in-app "Enable" button.
function NotificationStatusRow({
  permission,
  onEnable,
}: {
  permission: NotificationSupportState;
  onEnable: () => void;
}) {
  const statusText: Record<NotificationSupportState, string> = {
    granted: 'Allowed',
    denied: 'Blocked — allow in site settings',
    default: 'Not enabled yet',
    unsupported: 'Not supported on this device',
  };
  const dotClasses: Record<NotificationSupportState, string> = {
    granted: 'bg-emerald-500',
    denied: 'bg-rose-500',
    default: 'bg-amber-400',
    unsupported: 'bg-slate-300 dark:bg-slate-600',
  };
  const Icon = permission === 'granted' ? BellRing : permission === 'denied' || permission === 'unsupported' ? BellOff : Bell;

  return (
    <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-focus-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Notifications</p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[permission]}`} />
            {statusText[permission]}
          </p>
        </div>
      </div>
      {permission === 'default' && (
        <button onClick={onEnable} className="shrink-0 text-[11px] font-bold text-focus-primary">
          Enable
        </button>
      )}
    </div>
  );
}

// Grade level used to be a row of buttons, all visible at once, competing
// for attention with everything else in the settings drawer. A dropdown
// keeps only the current pick on screen and reveals the rest on demand —
// same open/close/outside-click behavior as ThemeSwitcher, for consistency.
function GradeLevelSelect({
  gradeLevel,
  onGradeLevelChange,
}: {
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Grade level</p>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Choose grade level"
          aria-expanded={open}
          title="Choose grade level"
          className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4"
        >
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{gradeLevel}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute z-20 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl"
          >
            {GRADE_LEVEL_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                role="menuitemradio"
                aria-checked={gradeLevel === g}
                onClick={() => {
                  onGradeLevelChange(g);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
              >
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{g}</span>
                {gradeLevel === g && <Check className="w-3.5 h-3.5 text-focus-primary shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}