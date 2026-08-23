import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AlertCircle, X } from 'lucide-react';

import { HistoryItem, RecallCard } from './types';
import { loadLocal, saveLocal } from './lib/storage';
import { isDue } from './lib/spacedRepetition';
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

  // ---- Appearance ----
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('kojlux_dark_mode') === 'true');
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

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className={`min-h-screen bg-focus-bg dark:bg-slate-950 ${darkMode ? 'dark' : ''}`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3">
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {SCREEN_TITLES[activeTab]}
          </h1>
        </header>

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

          {activeTab === 'review' && <ReviewQueue cards={recallCards} onUpdateCards={updateRecallCards} />}

          {activeTab === 'profile' && (
            <ProfileScreen
              email={user.email || ''}
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
        <NotesSummarizer gradeLevel={props.gradeLevel} history={props.history} onSaveHistory={props.onSaveHistory} onAddRecallCards={props.onAddRecallCards} onError={props.onError} />
      )}
    </div>
  );
}