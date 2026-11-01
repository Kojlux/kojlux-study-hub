import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, LogIn, Flame, CheckSquare, CalendarDays, Settings, Plus, ChevronLeft, ChevronRight, ChevronDown, Check, Bell, BellOff, BellRing, Shield, ExternalLink, Trash2 } from 'lucide-react';
import { GRADE_LEVEL_OPTIONS } from '../constants';
import { AgeBand, ExamEvent, HistoryItem } from '../types';
import { NotificationSupportState } from '../lib/notifications';
import { parseDateOnly, formatDateOnly } from '../lib/examReminders';
import { ExamSheet, examColor } from './CalendarScreen';
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

  // Dashboard calendar state. Dates are "YYYY-MM-DD" keys (formatDateOnly).
  const todayKey = useMemo(() => formatDateOnly(new Date()), []);
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  // The original add/edit sheet from CalendarScreen: 'new' to add, an exam to edit.
  const [sheetExam, setSheetExam] = useState<ExamEvent | 'new' | null>(null);

  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamEvent[]>();
    for (const exam of exams) {
      const list = map.get(exam.date) ?? [];
      list.push(exam);
      map.set(exam.date, list);
    }
    return map;
  }, [exams]);

  const calendarDays = useMemo(
    () => buildMonthGrid(view.year, view.month, selectedKey, todayKey, examsByDate),
    [view, selectedKey, todayKey, examsByDate],
  );
  const monthLabel = useMemo(
    () => new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [view],
  );

  const openSettings = useCallback<OpenSettingsHandler>(() => setMenuOpen(true), []);
  const handleShiftMonth = useCallback<ShiftMonthHandler>((delta) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);
  const handleSelectDate = useCallback<SelectDateHandler>((key) => {
    setSelectedKey(key);
    const d = parseDateOnly(key);
    setView((v) => (v.month === d.getMonth() && v.year === d.getFullYear() ? v : { year: d.getFullYear(), month: d.getMonth() }));
  }, []);
  const handleAddExam = useCallback<AddExamHandler>(() => setSheetExam('new'), []);
  const handleEditExam = useCallback<EditExamHandler>((exam) => setSheetExam(exam), []);
  const selectedExams = examsByDate.get(selectedKey) ?? [];

  const [savingName, setSavingName] = useState(false);
  const displayNameForm = useMemo<DisplayNameFormState>(() => {
    const trimmed = editedName.trim();
    return { value: editedName, isDirty: trimmed !== username, isValid: trimmed.length > 0, isSaving: savingName };
  }, [editedName, username, savingName]);
  const handleSaveName = useCallback(async (): Promise<void> => {
    setSavingName(true);
    try {
      await onDisplayNameChange(editedName);
    } finally {
      setSavingName(false);
    }
  }, [onDisplayNameChange, editedName]);
  const closeSettings = useCallback(() => setMenuOpen(false), []);
  const openProgress = useCallback(() => setShowProgress(true), []);
  const saveAgeBand = useCallback(() => {
    if (editedAgeBand) onAgeBandChange(editedAgeBand);
  }, [editedAgeBand, onAgeBandChange]);
  const replayBadge = (day: number): void => {
    setShowProgress(false);
    setCelebration(day);
  };

  return (
    <div className="-mx-5 sm:mx-auto sm:w-full sm:max-w-2xl pb-6 antialiased">
      <style>{`
        @keyframes dash-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-dash-pop { animation: dash-pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) { .animate-dash-pop { animation: none; } }
      `}</style>

      <DashboardHeader
        username={username}
        streak={streak}
        totalReviews={totalReviews}
        onOpenSettings={openSettings}
      />

      <div className="mt-8">
        <CalendarWidget
          monthLabel={monthLabel}
          days={calendarDays}
          onShiftMonth={handleShiftMonth}
          onSelectDate={handleSelectDate}
        />
      </div>

      <DailyAgenda
        selectedKey={selectedKey}
        exams={selectedExams}
        history={history}
        onAddExam={handleAddExam}
        onEditExam={handleEditExam}
      />

      {sheetExam && (
        <ExamSheet
          exam={sheetExam === 'new' ? null : sheetExam}
          defaultDate={selectedKey}
          history={history}
          onClose={() => setSheetExam(null)}
          onSave={(exam) => {
            if (sheetExam === 'new') onAddExam(exam);
            else onUpdateExam(exam);
            setSheetExam(null);
          }}
          onDelete={
            sheetExam !== 'new'
              ? () => {
                  onDeleteExam(sheetExam.id);
                  setSheetExam(null);
                }
              : undefined
          }
        />
      )}

      {/* Settings — a full-page sheet rather than a side drawer. Kept mounted
          so the slide-up transition has something to animate between;
          pointer-events-none plus opacity-0 takes it fully out of the way
          when closed. */}
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
          <SettingsHeader email={email} onClose={closeSettings} />

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-12">
            <div className="mx-auto w-full max-w-2xl space-y-7 pt-2">
              <ProfileSection
                gradeLevel={gradeLevel}
                onGradeLevelChange={onGradeLevelChange}
                nameForm={displayNameForm}
                onNameChange={setEditedName}
                onNameSave={handleSaveName}
                savedAgeBand={ageBand}
                selectedAgeBand={editedAgeBand}
                onAgeBandSelect={setEditedAgeBand}
                onAgeBandSave={saveAgeBand}
              />
              <StreakMilestoneCard streak={streak} daysActive={activityDays.length} onOpen={openProgress} />
              <PreferencesPanel permission={notifPermission} onEnable={onEnableNotifications} />
              <LegalSection />
              <DestructiveAccountActions
                isGuest={isGuest}
                onSignIn={onSignIn}
                onSignOut={onSignOut}
                onDeleteAccount={onDeleteAccount}
              />
            </div>
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

/* ========================================================================== */
/*  Settings: types and components                                            */
/* ========================================================================== */

// Form state for the display-name field. `isValid` is the native-style check
// (non-empty after trim); `isDirty` is whether it differs from the saved name.
export interface DisplayNameFormState {
  value: string;
  isDirty: boolean;
  isValid: boolean;
  isSaving: boolean;
}

interface SettingsHeaderProps {
  email: string;
  onClose: () => void;
}
interface ProfileSectionProps {
  gradeLevel: string;
  onGradeLevelChange: (g: string) => void;
  nameForm: DisplayNameFormState;
  onNameChange: (name: string) => void;
  onNameSave: () => Promise<void>;
  savedAgeBand: AgeBand | null;
  selectedAgeBand: AgeBand | null;
  onAgeBandSelect: (ageBand: AgeBand) => void;
  onAgeBandSave: () => void;
}
interface StreakMilestoneCardProps {
  streak: number;
  daysActive: number;
  onOpen: () => void;
}
interface PreferencesPanelProps {
  permission: NotificationSupportState;
  onEnable: () => void;
}
interface DestructiveAccountActionsProps {
  isGuest: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void> | void;
}

const CARD_CLASS =
  'rounded-[20px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_-5px_rgba(0,0,0,0.04)] dark:shadow-none';
const ROW_LABEL_CLASS = 'text-[15px] font-medium text-slate-900 dark:text-white';

// Eyebrow label above a group's card.
function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold tracking-[0.12em] text-slate-400 uppercase mb-2.5 ml-1">{label}</h3>
      {children}
    </section>
  );
}

const SettingsHeader = memo(function SettingsHeader({ email, onClose }: SettingsHeaderProps) {
  return (
    <header className="shrink-0 px-4 sm:px-6 pt-5 pb-3">
      <div className="mx-auto w-full max-w-2xl flex items-center gap-3.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings menu"
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-white/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-300 shadow-sm transition hover:bg-white dark:hover:bg-slate-800 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-primary/15"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight leading-tight text-slate-900 dark:text-white">Settings</h2>
          <p className="text-sm font-normal text-slate-500 dark:text-slate-400 truncate">{email || 'Signed in as guest'}</p>
        </div>
      </div>
    </header>
  );
});

const AgeGroupControl = memo(function AgeGroupControl({
  savedAgeBand,
  selectedAgeBand,
  onSelect,
  onSave,
}: {
  savedAgeBand: AgeBand | null;
  selectedAgeBand: AgeBand | null;
  onSelect: (ageBand: AgeBand) => void;
  onSave: () => void;
}) {
  const activeIndex = AGE_BAND_OPTIONS.findIndex(([value]) => value === selectedAgeBand);
  const copy = activeIndex >= 0 ? AGE_BAND_OPTIONS[activeIndex][2] : undefined;

  return (
    <div className="px-4 py-4">
      <span className={ROW_LABEL_CLASS}>Age group</span>
      <div
        role="radiogroup"
        aria-label="Age group"
        className="relative grid grid-cols-3 mt-2.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70"
      >
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 rounded-lg bg-focus-primary shadow-sm transition-transform duration-300 ease-out"
            style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${activeIndex * 100}%)` }}
          />
        )}
        {AGE_BAND_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selectedAgeBand === value}
            onClick={() => onSelect(value)}
            className={`relative z-10 py-2 rounded-lg text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-primary/15 ${
              selectedAgeBand === value ? 'text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {copy && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">{copy}</p>}
      {selectedAgeBand && selectedAgeBand !== savedAgeBand && (
        <button
          type="button"
          onClick={onSave}
          className="mt-3 w-full h-11 rounded-xl bg-focus-primary text-white text-sm font-semibold active:scale-[0.98] transition"
        >
          Save age group
        </button>
      )}
    </div>
  );
});

const ProfileSection = memo(function ProfileSection({
  gradeLevel,
  onGradeLevelChange,
  nameForm,
  onNameChange,
  onNameSave,
  savedAgeBand,
  selectedAgeBand,
  onAgeBandSelect,
  onAgeBandSave,
}: ProfileSectionProps) {
  const canSave = nameForm.isValid && nameForm.isDirty && !nameForm.isSaving;
  return (
    <SettingsGroup label="Profile">
      <div className={`${CARD_CLASS} divide-y divide-slate-100 dark:divide-slate-800`}>
        <GradeLevelRow gradeLevel={gradeLevel} onGradeLevelChange={onGradeLevelChange} />

        <form
          className="px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) void onNameSave();
          }}
        >
          <label htmlFor="profile-display-name" className={ROW_LABEL_CLASS}>
            Display name
          </label>
          <div className="flex items-center gap-2 mt-2.5">
            <input
              id="profile-display-name"
              value={nameForm.value}
              maxLength={40}
              placeholder="Your name"
              aria-invalid={!nameForm.isValid}
              onChange={(event) => onNameChange(event.target.value)}
              className="min-w-0 flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-shadow focus:border-focus-primary focus:ring-4 focus:ring-focus-primary/15"
            />
            <button
              type="submit"
              disabled={!canSave}
              className="h-11 px-5 rounded-xl bg-focus-primary text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition"
            >
              {nameForm.isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        <AgeGroupControl
          savedAgeBand={savedAgeBand}
          selectedAgeBand={selectedAgeBand}
          onSelect={onAgeBandSelect}
          onSave={onAgeBandSave}
        />
      </div>
    </SettingsGroup>
  );
});

const StreakMilestoneCard = memo(function StreakMilestoneCard({ streak, daysActive, onOpen }: StreakMilestoneCardProps) {
  return (
    <SettingsGroup label="Study streak">
      <div className={`${CARD_CLASS} flex items-center justify-between gap-4 px-4 py-3.5`}>
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="shrink-0 w-10 h-10 rounded-full bg-focus-primary/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-focus-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={ROW_LABEL_CLASS}>Creator streak</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">View milestones and badges</p>
          </div>
        </div>
        <StreakPill streak={streak} daysActive={daysActive} onOpen={onOpen} />
      </div>
    </SettingsGroup>
  );
});

// Always visible in Settings — not just the dismissible "enable
// notifications?" banner on Home. Only the 'default' state gets an in-app
// button: 'granted'/'denied' can only be changed from the browser's own site
// settings (the Notification API can't re-prompt once denied).
const NotificationStatus = memo(function NotificationStatus({ permission, onEnable }: PreferencesPanelProps) {
  const statusText: Record<NotificationSupportState, string> = {
    granted: 'Allowed',
    denied: 'Blocked',
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
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="shrink-0 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Icon className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={ROW_LABEL_CLASS}>Notifications</p>
            <p className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[permission]}`} />
              {statusText[permission]}
            </p>
          </div>
        </div>
        {permission === 'default' && (
          <button
            type="button"
            onClick={onEnable}
            className="shrink-0 h-9 px-4 rounded-full bg-focus-primary text-white text-xs font-semibold active:scale-95 transition"
          >
            Enable
          </button>
        )}
      </div>

      {permission === 'denied' && (
        <div
          role="status"
          className="mx-4 mb-4 flex items-start gap-3 rounded-xl border border-rose-100 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-3"
        >
          <span className="shrink-0 w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
            <BellOff className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Notifications are blocked</p>
            <p className="text-xs text-rose-600/90 dark:text-rose-400/90 mt-0.5">
              Allow them in your browser's site settings to get exam reminders.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

const PreferencesPanel = memo(function PreferencesPanel({ permission, onEnable }: PreferencesPanelProps) {
  return (
    <SettingsGroup label="Preferences">
      <div className={`${CARD_CLASS} divide-y divide-slate-100 dark:divide-slate-800`}>
        <NotificationStatus permission={permission} onEnable={onEnable} />
        <div className="px-4 py-4">
          <span className={ROW_LABEL_CLASS}>Appearance</span>
          <div className="mt-2.5">
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </SettingsGroup>
  );
});

const LegalSection = memo(function LegalSection() {
  return (
    <SettingsGroup label="Legal">
      <div className={`${CARD_CLASS} overflow-hidden`}>
        <a
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3.5 px-4 min-h-[56px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800"
        >
          <span className={`flex items-center gap-3.5 ${ROW_LABEL_CLASS}`}>
            <Shield className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden /> Privacy Policy
          </span>
          <ExternalLink className="w-4 h-4 text-slate-400" aria-hidden />
        </a>
      </div>
    </SettingsGroup>
  );
});

const DestructiveAccountActions = memo(function DestructiveAccountActions({
  isGuest,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: DestructiveAccountActionsProps) {
  const row =
    'w-full flex items-center gap-3.5 px-3 min-h-[52px] rounded-2xl text-[15px] transition active:scale-[0.99]';
  return (
    <SettingsGroup label="Account">
      <div className={`${CARD_CLASS} p-1.5 space-y-0.5`}>
        {isGuest ? (
          <button
            type="button"
            onClick={onSignIn}
            className={`${row} font-semibold text-focus-primary hover:bg-focus-primary/10`}
          >
            <LogIn className="w-5 h-5" aria-hidden /> Sign in
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onSignOut}
              className={`${row} font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60`}
            >
              <LogOut className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden /> Sign out
            </button>
            <button
              type="button"
              onClick={onDeleteAccount}
              className={`${row} font-medium text-rose-600/90 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30`}
            >
              <Trash2 className="w-5 h-5" aria-hidden /> Delete account
            </button>
          </>
        )}
      </div>
    </SettingsGroup>
  );
});

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

/* ========================================================================== */
/*  Dashboard: types, calendar helpers, and components                        */
/* ========================================================================== */

export interface CalendarDay {
  key: string;
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  hasExams: readonly ExamEvent[];
}

type OpenSettingsHandler = () => void;
type SelectDateHandler = (dateKey: string) => void;
type AddExamHandler = () => void;
type EditExamHandler = (exam: ExamEvent) => void;
type ShiftMonthHandler = (delta: -1 | 1) => void;

interface DashboardHeaderProps {
  username: string;
  streak: number;
  totalReviews: number;
  onOpenSettings: OpenSettingsHandler;
}
interface StreakMetricsProps {
  streak: number;
  totalReviews: number;
}
interface CalendarWidgetProps {
  monthLabel: string;
  days: readonly CalendarDay[];
  onShiftMonth: ShiftMonthHandler;
  onSelectDate: SelectDateHandler;
}
interface DailyAgendaProps {
  selectedKey: string;
  exams: readonly ExamEvent[];
  history: HistoryItem[];
  onAddExam: AddExamHandler;
  onEditExam: EditExamHandler;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Always 42 cells (6 weeks) so the card height never jumps between months. */
function buildMonthGrid(
  viewYear: number,
  viewMonth: number,
  selectedKey: string,
  todayKey: string,
  examsByDate: ReadonlyMap<string, ExamEvent[]>,
): CalendarDay[] {
  const first = new Date(viewYear, viewMonth, 1);
  const start = new Date(viewYear, viewMonth, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = formatDateOnly(date);
    return {
      key,
      date,
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === viewMonth,
      isSelected: key === selectedKey,
      isToday: key === todayKey,
      hasExams: examsByDate.get(key) ?? [],
    };
  });
}

const StreakMetrics = memo(function StreakMetrics({ streak, totalReviews }: StreakMetricsProps) {
  const badge =
    'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-focus-primary/10 text-focus-primary text-xs font-medium tabular-nums';
  return (
    <div className="flex items-center gap-2 mt-1.5" role="list" aria-label="Study metrics">
      <span className={badge} role="listitem">
        <Flame className="w-4 h-4" aria-hidden /> {streak} day streak
      </span>
      <span className={badge} role="listitem">
        <CheckSquare className="w-4 h-4" aria-hidden /> {totalReviews} reviewed
      </span>
    </div>
  );
});

const DashboardHeader = memo(function DashboardHeader({
  username,
  streak,
  totalReviews,
  onOpenSettings,
}: DashboardHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-1">Dashboard</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white truncate">{username}</h1>
        <StreakMetrics streak={streak} totalReviews={totalReviews} />
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings menu"
        className="shrink-0 -mr-2 mt-0.5 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-full text-[13px] font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-primary/40"
      >
        <Settings className="w-4 h-4" aria-hidden />
        <span className="hidden sm:inline">Settings</span>
      </button>
    </header>
  );
});

const DayCell = memo(function DayCell({ day, onSelect }: { day: CalendarDay; onSelect: SelectDateHandler }) {
  const { isSelected, isToday, isCurrentMonth, hasExams } = day;
  const label = day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const tone = isSelected
    ? 'bg-focus-primary text-white font-semibold shadow-[0_4px_10px_-2px] shadow-focus-primary/40 animate-dash-pop'
    : isToday
      ? 'text-focus-primary font-semibold hover:bg-focus-primary/10'
      : isCurrentMonth
        ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06]'
        : 'text-slate-300 dark:text-slate-600 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04]';

  return (
    <button
      type="button"
      onClick={() => onSelect(day.key)}
      aria-label={hasExams.length ? `${label}, ${hasExams.length} exam${hasExams.length > 1 ? 's' : ''}` : label}
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      className="relative mx-auto flex items-center justify-center w-10 h-10 rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-primary/40"
    >
      <span className={`absolute inset-0 rounded-full flex items-center justify-center transition-colors ${tone}`}>
        {day.dayOfMonth}
      </span>
      {hasExams.length > 0 && (
        <span aria-hidden className="absolute bottom-1 flex items-center gap-0.5">
          {hasExams.slice(0, 3).map((e) => (
            <span
              key={e.id}
              className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : examColor(e.color).dot}`}
            />
          ))}
        </span>
      )}
    </button>
  );
});

const CalendarWidget = memo(function CalendarWidget({ monthLabel, days, onShiftMonth, onSelectDate }: CalendarWidgetProps) {
  const nav =
    'w-8 h-8 rounded-full inline-flex items-center justify-center text-slate-400 transition-colors hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200 active:bg-slate-900/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-primary/40';
  return (
    <section
      aria-label="Calendar"
      className="rounded-[20px] bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_-5px_rgba(0,0,0,0.03)] dark:shadow-none"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-0.5 -mr-1.5">
          <button type="button" onClick={() => onShiftMonth(-1)} aria-label="Previous month" className={nav}>
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </button>
          <button type="button" onClick={() => onShiftMonth(1)} aria-label="Next month" className={nav}>
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-2 gap-x-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="pb-1 text-center text-xs font-medium text-slate-400" aria-hidden>
            {d}
          </div>
        ))}
        {days.map((day) => (
          <DayCell key={day.key} day={day} onSelect={onSelectDate} />
        ))}
      </div>
    </section>
  );
});

const DailyAgenda = memo(function DailyAgenda({ selectedKey, exams, history, onAddExam, onEditExam }: DailyAgendaProps) {
  const heading = parseDateOnly(selectedKey)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  return (
    <section aria-label="Agenda for selected day" className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">{heading}</h3>
        <button
          type="button"
          onClick={onAddExam}
          className="group inline-flex items-center gap-1 text-[13px] font-semibold text-focus-primary transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:underline underline-offset-4"
        >
          <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" aria-hidden />
          Add Exam
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="mt-3 flex flex-col items-center justify-center rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 py-10 px-6 text-center ring-1 ring-inset ring-slate-200/60 dark:ring-slate-800">
          <span className="mb-3 inline-flex items-center justify-center w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800">
            <CalendarDays className="w-5 h-5 text-slate-400" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No exams on this day</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-[16rem]">
            Mark exam days your teacher gave you and we'll remind you to study.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {exams.map((exam) => {
            const linked = exam.linkedHistoryId ? history.find((h) => h.id === exam.linkedHistoryId) : undefined;
            return (
              <li key={exam.id}>
                <button
                  type="button"
                  onClick={() => onEditExam(exam)}
                  className="w-full text-left flex items-start gap-3 rounded-2xl bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none transition-transform active:scale-[0.99]"
                >
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${examColor(exam.color).dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{exam.title}</p>
                    {exam.subject && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{exam.subject}</p>}
                    {exam.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{exam.notes}</p>
                    )}
                    {linked && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-focus-primary bg-focus-primary/10 rounded-full px-2 py-0.5">
                        {linked.title}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});