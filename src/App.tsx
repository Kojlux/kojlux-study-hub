import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AlertCircle, X, ArrowLeft, GraduationCap, Camera, Bell } from 'lucide-react';

import { HistoryItem, RecallCard } from './types';
import { loadLocal, saveLocal } from './lib/storage';
import { isDue } from './lib/spacedRepetition';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  notifyReviewsReady,
  NotificationSupportState,
} from './lib/notifications';
import { GRADE_LEVEL_OPTIONS } from './constants';

import AuthScreen from './components/AuthScreen';
import StudyHome from './components/StudyHome';
import QuizBuilder from './components/QuizBuilder';
import NotesSummarizer from './components/NotesSummarizer';
import ReviewQueue from './components/ReviewQueue';
import ProfileScreen from './components/ProfileScreen';
import VisualizerScreen from './components/VisualizerScreen';
import BottomNav, { NavTab } from './components/BottomNav';

const SCREEN_TITLES: Record<NavTab, string> = {
  home: 'Study Home',
  quiz: 'Create',
  visualizer: 'Concept Visualizer',
  review: 'Review',
  profile: 'Profile',
};

export default function App() {
  // ---- Auth ----
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [gradeLevel, setGradeLevel] = useState<string>(() => loadLocal('kojlux_grade_level', GRADE_LEVEL_OPTIONS[2]));
  const [streak, setStreak] = useState<number>(() => loadLocal('kojlux_streak', 0));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.gradeLevel) setGradeLevel(data.gradeLevel);
            if (typeof data.streak === 'number') setStreak(data.streak);
          }
        } catch (err) {
          console.error('Failed to load profile from Firestore', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // ---- Guest access ----
  // Sign-in used to be forced at startup. Now the gate offers Skip or Sign
  // In: `guestMode` lets someone in without an account (everything just
  // stays local, same as it already does whenever `user` is null elsewhere
  // in this file), and `showAuthScreen` is only for whether the *gate* is
  // currently showing the sign-in form or its own Skip/Sign-In choice.
  const [guestMode, setGuestMode] = useState<boolean>(() => loadLocal('kojlux_guest_mode', false));
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  useEffect(() => saveLocal('kojlux_guest_mode', guestMode), [guestMode]);
  // If a guest actually signs in later, they're no longer a guest.
  useEffect(() => {
    if (user) {
      setGuestMode(false);
      setShowAuthScreen(false);
    }
  }, [user]);

  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);

  // ---- Review-ready notifications ----
  // No service worker/push backend here, so this only works while the app is
  // open: poll for cards that just became due and fire a local notification.
  // Permission is requested from the banner's button click, never silently.
  const [notifPermission, setNotifPermission] = useState<NotificationSupportState>(() => getNotificationPermission());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  const recallCardsRef = useRef<RecallCard[]>([]);
  const previouslyDueIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const checkForNewlyDueCards = () => {
      const currentlyDue = recallCardsRef.current.filter(isDue);
      const currentlyDueIds = currentlyDue.map((c) => c.id);
      // Skip notifying on the very first check — that's just seeding state
      // with whatever was already due when the app loaded, not "new".
      if (previouslyDueIdsRef.current) {
        const newlyDue = currentlyDueIds.filter((id) => !previouslyDueIdsRef.current!.has(id));
        if (newlyDue.length > 0) notifyReviewsReady(newlyDue.length);
      }
      previouslyDueIdsRef.current = new Set(currentlyDueIds);
    };
    checkForNewlyDueCards();
    const interval = setInterval(checkForNewlyDueCards, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ---- Appearance ----
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('kojlux_dark_mode');
    return stored === null ? true : stored === 'true'; // dark mode is the default until the user chooses otherwise
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('kojlux_dark_mode', String(darkMode));
  }, [darkMode]);

  // ---- Navigation ----
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // ---- Shared study data: history + spaced-repetition cards ----
  const [history, setHistory] = useState<HistoryItem[]>(() => loadLocal('kojlux_history', []));
  const [recallCards, setRecallCards] = useState<RecallCard[]>(() => loadLocal('kojlux_recall_cards', []));
  const [totalReviews, setTotalReviews] = useState<number>(() => loadLocal('kojlux_total_reviews', 0));

  useEffect(() => saveLocal('kojlux_history', history), [history]);
  useEffect(() => saveLocal('kojlux_recall_cards', recallCards), [recallCards]);
  useEffect(() => saveLocal('kojlux_total_reviews', totalReviews), [totalReviews]);
  useEffect(() => {
    recallCardsRef.current = recallCards;
  }, [recallCards]);

  const addHistory = (item: HistoryItem) => setHistory((prev) => [item, ...prev].slice(0, 50));
  const addRecallCards = (cards: RecallCard[]) => setRecallCards((prev) => [...prev, ...cards]);
  const updateRecallCards = (updated: RecallCard[]) => {
    setRecallCards(updated);
    setTotalReviews((n) => n + 1);
    bumpStreak();
  };

  // A day counts toward the streak the first time the student completes any
  // review or quiz that day — tracked by date string, not a running timer.
  const bumpStreak = () => {
    const todayKey = new Date().toDateString();
    const lastActive = localStorage.getItem('kojlux_last_active_day');
    if (lastActive === todayKey) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = lastActive === yesterday.toDateString();
    const nextStreak = wasYesterday ? streak + 1 : 1;
    setStreak(nextStreak);
    localStorage.setItem('kojlux_last_active_day', todayKey);
    saveLocal('kojlux_streak', nextStreak);
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { streak: nextStreak }).catch((err) =>
        console.error('Failed to sync streak', err)
      );
    }
  };

  const handleGradeLevelChange = (g: string) => {
    setGradeLevel(g);
    saveLocal('kojlux_grade_level', g);
    if (user) {
      setDoc(doc(db, 'users', user.uid), { gradeLevel: g }, { merge: true }).catch((err) =>
        console.error('Failed to sync grade level', err)
      );
    }
  };

  // ---- Errors ----
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dueCount = recallCards.filter(isDue).length;
  const username = user?.displayName || user?.email?.split('@')[0] || 'Student';

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-focus-bg dark:bg-slate-950">
        <div className="w-10 h-10 border-3 border-focus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !guestMode) {
    if (showAuthScreen) {
      return (
        <div className="relative min-h-screen">
          <button
            onClick={() => setShowAuthScreen(false)}
            className="absolute top-4 left-4 z-50 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-3 py-2 rounded-full shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <AuthScreen />
        </div>
      );
    }
    return <WelcomeGate onSkip={() => setGuestMode(true)} onSignIn={() => setShowAuthScreen(true)} />;
  }

  return (
    <div className={`min-h-screen bg-focus-bg dark:bg-slate-950 ${darkMode ? 'dark' : ''}`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3">
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {SCREEN_TITLES[activeTab]}
          </h1>
        </header>

        {!user && !guestBannerDismissed && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 rounded-2xl p-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="flex-1 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                You're using Kojlux as a guest. Refreshing this page or clearing your browser's cache can delete recents
                and reviews that haven't been synced to an account.
              </p>
              <button onClick={() => setGuestBannerDismissed(true)} className="shrink-0 text-amber-500 hover:text-amber-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {isNotificationSupported() && notifPermission === 'default' && !notifBannerDismissed && recallCards.length > 0 && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2.5 bg-focus-primary/10 dark:bg-focus-primary/15 border border-focus-primary/25 rounded-2xl p-3">
              <Bell className="w-4 h-4 text-focus-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Want a nudge when a review is ready? Turn on notifications and we'll let you know.
                </p>
                <div className="flex gap-4 mt-1.5">
                  <button
                    onClick={async () => setNotifPermission(await requestNotificationPermission())}
                    className="text-[11px] font-bold text-focus-primary"
                  >
                    Enable Notifications
                  </button>
                  <button onClick={() => setNotifBannerDismissed(true)} className="text-[11px] font-bold text-slate-400">
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-5 pb-28">
          {activeTab === 'home' && (
            <StudyHome
              username={username}
              streak={streak}
              cards={recallCards}
              history={history}
              onNavigate={(tab) => setActiveTab(tab === 'summarizer' ? 'quiz' : (tab as NavTab))}
            />
          )}

          {activeTab === 'quiz' && (
            <QuizBuilderOrSummarizer
              gradeLevel={gradeLevel}
              history={history}
              onSaveHistory={addHistory}
              onAddRecallCards={addRecallCards}
              onError={setErrorMsg}
              onGoToVisualizer={() => setActiveTab('visualizer')}
            />
          )}

          {activeTab === 'visualizer' && (
            <VisualizerScreen
              darkMode={darkMode}
              gradeLevel={gradeLevel}
              onGradeLevelChange={handleGradeLevelChange}
              onError={setErrorMsg}
              onSaveHistory={addHistory}
            />
          )}

          {activeTab === 'review' && (
            <ReviewQueue
              cards={recallCards}
              onUpdateCards={updateRecallCards}
              history={history}
              onAddRecallCards={addRecallCards}
              onError={setErrorMsg}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen
              email={user?.email || ''}
              username={username}
              gradeLevel={gradeLevel}
              onGradeLevelChange={handleGradeLevelChange}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              streak={streak}
              totalReviews={totalReviews}
            />
          )}
        </main>

        <BottomNav active={activeTab} dueCount={dueCount} onChange={setActiveTab} />
      </div>

      {errorMsg && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => setErrorMsg(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">Something went wrong</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-2xl transition shadow-sm flex items-center justify-center gap-2"
            >
              <X className="w-3.5 h-3.5" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The Quiz tab hosts both the Quiz Builder and, via an in-screen toggle, the
// Notes Summarizer — the two started as separate nav destinations in the old
// five-tab layout, but user testing on educational apps consistently shows
// two closely related "create study material" flows are easier to find
// bundled with a sub-toggle than as separate top-level destinations that
// compete with Review/Visualize for thumb reach.
function QuizBuilderOrSummarizer(props: {
  gradeLevel: string;
  history: HistoryItem[];
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onGoToVisualizer: () => void;
}) {
  const [subTab, setSubTab] = useState<'quiz' | 'summarizer'>('quiz');
  return (
    <div className="space-y-5">
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {(['quiz', 'summarizer'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
              subTab === t ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t === 'quiz' ? 'Quiz Builder' : 'Summarizer'}
          </button>
        ))}
      </div>
      {subTab === 'quiz' ? (
        <QuizBuilder gradeLevel={props.gradeLevel} onSaveHistory={props.onSaveHistory} onAddRecallCards={props.onAddRecallCards} onError={props.onError} />
      ) : (
        <NotesSummarizer
          gradeLevel={props.gradeLevel}
          history={props.history}
          onSaveHistory={props.onSaveHistory}
          onAddRecallCards={props.onAddRecallCards}
          onError={props.onError}
          onGoToVisualizer={props.onGoToVisualizer}
        />
      )}
    </div>
  );
}

// Shown at startup instead of a forced Sign In / Register screen. Sign-in is
// still available (and still required to sync across devices / back things
// up to Firestore), but it's no longer mandatory just to open the app —
// "Skip for now" drops straight into a fully-functional local/guest session,
// same as the rest of the app already treats a null `user`.
function WelcomeGate({ onSkip, onSignIn }: { onSkip: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-focus-bg dark:bg-slate-950 flex items-center justify-center p-5">
      <div className="max-w-sm w-full space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-focus-primary flex items-center justify-center shadow-lg shadow-focus-primary/25">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">Welcome to Kojlux Study Hub</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">
            Turn notes and textbook pages into quizzes, summaries, and spaced-repetition review. Sign in to sync
            across devices, or jump straight in as a guest.
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onSignIn}
            className="w-full py-3.5 bg-focus-primary hover:bg-focus-primary-dark text-white rounded-2xl text-sm font-bold transition"
          >
            Sign In / Register
          </button>
          <button
            onClick={onSkip}
            className="w-full py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-sm font-bold transition"
          >
            Skip for now
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 rounded-2xl p-3.5 flex gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
            Skipping sign-in keeps everything on this device only. Refreshing the page or clearing your browser's
            cache/site data can permanently delete recents and review cards that were never synced to an account.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 flex gap-2.5">
          <Camera className="w-4 h-4 text-focus-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-700 dark:text-slate-200">Camera access</span> is only requested when
            you choose to photograph notes or a textbook page for a quiz or summary — you can always type or paste
            text instead. We may also ask for notification permission later so we can let you know when a review is
            ready.
          </p>
        </div>
      </div>
    </div>
  );
}