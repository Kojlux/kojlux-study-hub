import React, { useEffect, useRef, useState } from 'react';
import { LogOut, LogIn, User as UserIcon, Flame, Layers, Menu, ChevronLeft, ChevronDown, Check, Bell, BellOff, BellRing, Shield, ExternalLink, Trash2 } from 'lucide-react';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { AgeBand, ExamEvent, HistoryItem } from '../types';
import { NotificationSupportState } from '../lib/notifications';
import CalendarScreen from './CalendarScreen';
import ThemeSwitcher from './ThemeSwitcher';
import StreakPill from './study-home/StreakPill';
import { BadgePackReveal, BadgeProgressModal } from './study-home/BadgeSystem';

interface Props {
  email: string;
  username: string;
  ageBand: AgeBand | null;
  onDisplayNameChange: (name: string) => Promise<void> | void;
  onAgeBandChange: (ageBand: AgeBand) => void;
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
  // Superseded by the in-screen theme picker (see ThemeSwitcher), which now
  // owns light/dark plus 5 additional palettes and persists the choice
  // itself. Left optional here only so a parent still passing these props
  // doesn't need to change; ProfileScreen no longer reads them.
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  streak: number;
  activityDays: string[];
  totalReviews: number;
  // Guests (the "Skip" path at launch) don't have an account to sign out
  // of — showing "Sign Out" to them was leaving a button on screen that
  // didn't correspond to any real signed-in session. Signed-in users get
  // Sign Out; guests get Sign In instead, routed back to the auth gateway.
  isGuest: boolean;
  onSignOut: () => void;
  onSignIn: () => void;
  onDeleteAccount: () => Promise<void> | void;
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

const AGE_BAND_OPTIONS = [
  ['under13', 'Under 13', 'Extra protection: materials and external links stay disabled.'],
  ['13to17', '13–17', 'Teen account settings.'],
  ['18plus', '18 or older', 'Adult account settings.'],
] as const;

export default function ProfileScreen({
  email, username, gradeLevel, onGradeLevelChange, streak, activityDays, totalReviews,
  ageBand, onDisplayNameChange, onAgeBandChange,
  isGuest, onSignOut, onSignIn, exams, history, onAddExam, onUpdateExam, onDeleteExam,
  onDeleteAccount,
  notifPermission, onEnableNotifications,
}: Props) {
  // Grade level, appearance, account email, and sign out/in used to live
  // inline on this screen. They're account/settings-flavored rather than
  // things a student checks every visit, so they've moved into a full-page
  // settings sheet opened from the header — freeing up the space right
  // under the stats row for the Study Calendar to live inline instead of
  // just a short "upcoming exams" preview that linked out to it.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [celebration, setCelebration] = useState<number | null>(null);
  const [editedName, setEditedName] = useState(username);
  const [editedAgeBand, setEditedAgeBand] = useState<AgeBand | null>(ageBand);

  useEffect(() => setEditedName(username), [username]);
  useEffect(() => setEditedAgeBand(ageBand), [ageBand]);

  const selectedAgeBandCopy = AGE_BAND_OPTIONS.find(([value]) => value === editedAgeBand)?.[2];
  const replayBadge = (day: number): void => {
    setShowProgress(false);
    setCelebration(day);
  };

  return (
    <div>
      {/* Masthead: identity plus its two stats read as one line now —
          name up top, "streak · reviews" as a subtitle underneath it —
          instead of a separate stats block competing for its own row. */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full border-2 border-focus-primary flex items-center justify-center shrink-0">
            <UserIcon className="w-5 h-5 text-focus-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-xl text-slate-900 dark:text-white truncate leading-tight">{username}</h1>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-focus-primary" /> {streak} day streak
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-focus-primary" /> {totalReviews} reviewed
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open settings menu"
          className="shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 active:scale-95 transition"
        >
          <Menu className="w-4 h-4" /> Settings
        </button>
      </div>

      {/* The calendar gets a proper home of its own — a single framed
          panel that holds the section's heading, its explainer, and the
          calendar together as one piece, rather than a bare label sitting
          loose above the widget. */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="mb-4">
          <h2 className="font-serif text-base text-slate-900 dark:text-white">Exam reminders</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Mark exam days your teacher gave you — we'll remind you to study.</p>
        </div>
        <CalendarScreen
          exams={exams}
          history={history}
          onAddExam={onAddExam}
          onUpdateExam={onUpdateExam}
          onDeleteExam={onDeleteExam}
        />
      </section>

      {/* Settings — a full-page sheet rather than a side drawer, laid out
          as a plain list of rows under section headings (no repeated
          boxed cards anywhere in here). Kept mounted so the slide-up
          transition has something to animate between; pointer-events-none
          plus opacity-0 takes it fully out of the way when closed. */}
      <div
        className={`fixed inset-0 z-[250] transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-focus-bg dark:bg-slate-950 flex flex-col transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex items-center gap-3 px-4 pt-5 pb-3 shrink-0">
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close settings menu"
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="font-serif text-xl leading-tight text-slate-900 dark:text-white">Settings</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{email || 'Signed in as guest'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-12">
            <SettingsSection label="Profile">
              <GradeLevelRow gradeLevel={gradeLevel} onGradeLevelChange={onGradeLevelChange} />

              <SettingsRow label="Display name" stacked>
                <div className="flex gap-2 mt-2.5">
                  <input
                    id="profile-display-name"
                    aria-label="Display name"
                    value={editedName}
                    maxLength={40}
                    onChange={(event) => setEditedName(event.target.value)}
                    className="min-w-0 flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 text-[15px] text-slate-900 dark:text-white outline-none focus:border-focus-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void onDisplayNameChange(editedName)}
                    disabled={!editedName.trim() || editedName.trim() === username}
                    className="h-11 px-5 rounded-xl bg-focus-primary text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition"
                  >
                    Save
                  </button>
                </div>
              </SettingsRow>

              <SettingsRow label="Age group" stacked>
                <div className="grid grid-cols-3 gap-1 mt-2.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70">
                  {AGE_BAND_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditedAgeBand(value)}
                      className={`py-2 rounded-lg text-xs font-semibold transition ${
                        editedAgeBand === value
                          ? 'bg-focus-primary text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {selectedAgeBandCopy && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">{selectedAgeBandCopy}</p>
                )}
                {editedAgeBand && editedAgeBand !== ageBand && (
                  <button
                    type="button"
                    onClick={() => onAgeBandChange(editedAgeBand)}
                    className="mt-3 w-full h-11 rounded-xl bg-focus-primary text-white text-sm font-semibold active:scale-[0.98] transition"
                  >
                    Save age group
                  </button>
                )}
              </SettingsRow>
            </SettingsSection>

            <SettingsSection label="Study streak">
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Flame className="w-5 h-5 text-focus-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-slate-900 dark:text-white">Creator streak</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">View milestones and badges</p>
                  </div>
                </div>
                <StreakPill streak={streak} daysActive={activityDays.length} onOpen={() => setShowProgress(true)} />
              </div>
            </SettingsSection>

            <SettingsSection label="Preferences">
              <NotificationRow permission={notifPermission} onEnable={onEnableNotifications} />
              <SettingsRow label="Appearance" stacked>
                <div className="mt-2.5">
                  <ThemeSwitcher />
                </div>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection label="Legal">
              <a
                href={`${import.meta.env.BASE_URL}privacy.html`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 px-4 min-h-[56px] text-[15px] font-medium text-slate-900 dark:text-white"
              >
                <span className="flex items-center gap-3"><Shield className="w-5 h-5 text-slate-500" /> Privacy Policy</span>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </a>
            </SettingsSection>

            <SettingsSection label="Account">
              {isGuest ? (
                <button
                  onClick={onSignIn}
                  className="w-full flex items-center gap-3 px-4 min-h-[56px] text-[15px] font-semibold text-focus-primary"
                >
                  <LogIn className="w-5 h-5" /> Sign in
                </button>
              ) : (
                <button
                  onClick={onSignOut}
                  className="w-full flex items-center gap-3 px-4 min-h-[56px] text-[15px] font-medium text-slate-900 dark:text-white"
                >
                  <LogOut className="w-5 h-5 text-slate-500" /> Sign out
                </button>
              )}

              {!isGuest && (
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  className="w-full flex items-center gap-3 px-4 min-h-[56px] text-[15px] font-medium text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="w-5 h-5" /> Delete account
                </button>
              )}
            </SettingsSection>
          </div>
        </div>
      </div>
      {showProgress && (
        <BadgeProgressModal
          activityDays={activityDays}
          onClose={() => setShowProgress(false)}
          onReplay={replayBadge}
        />
      )}
      {celebration !== null && <BadgePackReveal milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}

// Shared shell for a group of settings rows: a small heading above one
// rounded panel, with a hairline between rows.
function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-6">
      <h3 className="px-1 mb-2 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">{label}</h3>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
        {children}
      </div>
    </section>
  );
}

// A single labelled row. `stacked` puts the control on its own line below
// the label (for things with more than a short value); otherwise the
// control sits inline to the right of the label.
function SettingsRow({
  label,
  stacked,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <div className="px-4 py-4">
        <span className="text-[15px] font-medium text-slate-900 dark:text-white">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 min-h-[56px]">
      <span className="text-[15px] font-medium text-slate-900 dark:text-white">{label}</span>
      {children}
    </div>
  );
}

// Always visible in Settings — not just the dismissible "enable
// notifications?" banner on Home. Read-only status plus, only when it is
// actionable, an Enable button: 'granted'/'denied' can only be changed from
// the browser's own site settings (the Notification API can't re-prompt once
// denied), so only the 'default' state gets an in-app button.
function NotificationRow({
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
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-5 h-5 text-slate-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-slate-900 dark:text-white">Notifications</p>
          <p className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[permission]}`} />
            {statusText[permission]}
          </p>
        </div>
      </div>
      {permission === 'default' && (
        <button
          onClick={onEnable}
          className="shrink-0 h-9 px-4 rounded-full bg-focus-primary text-white text-xs font-semibold active:scale-95 transition"
        >
          Enable
        </button>
      )}
    </div>
  );
}

// Grade level is a dropdown: only the current pick stays on screen and the
// rest is revealed on demand — same open/close/outside-click behavior as
// ThemeSwitcher, for consistency.
function GradeLevelRow({
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
    <div className="relative px-4" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose grade level"
        aria-expanded={open}
        title="Choose grade level"
        className="w-full min-h-[56px] flex items-center justify-between gap-3"
      >
        <span className="text-[15px] font-medium text-slate-900 dark:text-white">Grade level</span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="text-[15px]">{gradeLevel}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute z-20 left-3 right-3 top-full -mt-1 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-xl"
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
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
            >
              <span className="text-sm text-slate-700 dark:text-slate-200">{g}</span>
              {gradeLevel === g && <Check className="w-4 h-4 text-focus-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}