import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection as fsCollection, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AlertCircle, X, ArrowLeft, GraduationCap, Camera, Bell, CalendarDays } from 'lucide-react';

import { HistoryItem, RecallCard, ExamEvent, Collection } from './types';
import { loadLocal, saveLocal, scopedKey } from './lib/storage';
import { isDue } from './lib/spacedRepetition';
import { isReminderDue } from './lib/examReminders';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  notifyReviewsReady,
  notifyExamReminder,
  NotificationSupportState,
} from './lib/notifications';
import { GRADE_LEVEL_OPTIONS } from './constants';
import { registerPushForUser } from './lib/push';

import AuthScreen from './components/AuthScreen';
import StudyHome from './components/StudyHome';
import QuizBuilder from './components/QuizBuilder';
import NoteCraft from './components/NoteCraft';
import ReviewQueue from './components/ReviewQueue';
import ProfileScreen from './components/ProfileScreen';
import VisualizerScreen from './components/VisualizerScreen';
import CalendarScreen from './components/CalendarScreen';
import BottomNav, { NavTab } from './components/BottomNav';
import { clearDeepLinkUrl, parseDeepLinkCardId, parseDeepLinkCollectionId } from './lib/deepLink';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const SCREEN_TITLES: Record<NavTab, string> = {
  home: 'Kojlux Study Hub',
  quiz: 'Create',
  visualizer: 'Concept Visualizer',
  review: 'Review',
  profile: 'Dashboard',
};

// ThemeProvider has to sit above AppContent (not inside it) since
// AppContent itself calls useTheme() below — a component can't consume a
// context it renders itself.
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const initialDeepLinkCardId = parseDeepLinkCardId();
  const initialDeepLinkCollectionId = parseDeepLinkCollectionId();
  const [deepLinkCardId, setDeepLinkCardId] = useState<string | null>(initialDeepLinkCardId);
  const [deepLinkCollectionId, setDeepLinkCollectionId] = useState<string | null>(initialDeepLinkCollectionId);
  const consumeDeepLink = () => {
    setDeepLinkCardId(null);
    setDeepLinkCollectionId(null);
    clearDeepLinkUrl();
  };
  // ---- Auth ----
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVEL_OPTIONS[2]);
  const [streak, setStreak] = useState<number>(0);

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
  const [guestMode, setGuestMode] = useState<boolean>(() => loadLocal('kojlux_guest_mode', false) || Boolean(initialDeepLinkCardId || initialDeepLinkCollectionId));
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

  // ---- Account-scoped data ----
  // `scopeId` identifies whose data is currently active: a signed-in user's
  // uid, the literal 'guest' while browsing without an account, or null
  // while that isn't decided yet (auth still resolving, or the Welcome gate
  // is showing). All per-account state below (history, recall cards, streak,
  // grade level, total reviews) is namespaced under this id so switching
  // accounts — or moving between guest and signed-in — never shows one
  // person's data to another.
  const scopeId = user ? user.uid : guestMode ? 'guest' : null;
  const loadedScopeRef = useRef<string | null>(null);

  // ---- Review-ready notifications ----
  // No service worker/push backend here, so this only works while the app is
  // open: poll for cards that just became due and fire a local notification.
  // Permission is requested from the banner's button click, never silently.
  const [notifPermission, setNotifPermission] = useState<NotificationSupportState>(() => getNotificationPermission());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  useEffect(() => {
    if (user && notifPermission === 'granted') {
      registerPushForUser(user.uid).catch((err) => console.error('Failed to enable push notifications', err));
    }
  }, [user, notifPermission]);

  const recallCardsRef = useRef<RecallCard[]>([]);
  // Seeded from localStorage (scoped per account) rather than starting null
  // every time the app mounts. Without this, closing the tab and reopening
  // it after a card's 3-hour delay had already passed meant the very next
  // check silently "seeded" on that card instead of notifying — the
  // notification was effectively dropped for anything that became due while
  // the tab was closed. Persisting the set across reloads means a newly-due
  // card is still recognized as newly due whenever the app next checks.
  const previouslyDueIdsRef = useRef<Set<string> | null>(null);
  const previouslyDueScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (scopeId && previouslyDueScopeRef.current !== scopeId) {
      previouslyDueScopeRef.current = scopeId;
      const stored = loadLocal<string[]>(scopedKey('kojlux_previously_due_ids', scopeId), []);
      previouslyDueIdsRef.current = new Set(stored);
    }
  }, [scopeId]);

  useEffect(() => {
    const checkForNewlyDueCards = () => {
      const currentlyDue = recallCardsRef.current.filter(isDue);
      const currentlyDueIds = currentlyDue.map((c) => c.id);
      if (previouslyDueIdsRef.current) {
        const newlyDue = currentlyDueIds.filter((id) => !previouslyDueIdsRef.current!.has(id));
        if (newlyDue.length > 0) notifyReviewsReady(newlyDue.length);
      }
      previouslyDueIdsRef.current = new Set(currentlyDueIds);
      if (previouslyDueScopeRef.current) {
        saveLocal(scopedKey('kojlux_previously_due_ids', previouslyDueScopeRef.current), currentlyDueIds);
      }
    };
    // Same shape as checkForNewlyDueCards above, but exams track their own
    // "already notified" flag (`reminderSent`) directly instead of a
    // separate previously-seen id set, since each reminder only ever fires
    // once in an exam's lifetime rather than repeatedly like a due card
    // does. NOTE: this only runs while the app is open — see the reliability
    // note in lib/examReminders.ts for why a fully closed tab won't get one.
    const checkExamReminders = () => {
      const due = examEventsRef.current.filter((e) => !e.reminderSent && isReminderDue(e));
      if (due.length === 0) return;
      due.forEach((exam) => notifyExamReminder(exam.title, exam.id));
      const dueIds = new Set(due.map((e) => e.id));
      setExamEvents((prev) => prev.map((e) => (dueIds.has(e.id) ? { ...e, reminderSent: true } : e)));
    };
    checkForNewlyDueCards();
    checkExamReminders();
    // The interval is what catches a card becoming due while the tab is
    // open; the visibilitychange listener catches one becoming due while
    // the tab was backgrounded/minimized, since browsers throttle or fully
    // suspend setInterval in that state and the timer alone can't be relied
    // on to fire promptly once the tab is foregrounded again.
    const interval = setInterval(() => {
      checkForNewlyDueCards();
      checkExamReminders();
    }, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForNewlyDueCards();
        checkExamReminders();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // ---- Appearance ----
  // Previously its own independent state that defaulted to dark and never
  // updated (nothing called its setter anymore once the theme picker took
  // over) — it kept forcing the `dark` class onto the wrapper below every
  // time, no matter which theme was picked, which is why every theme used
  // to render identically. isDarkMode below now comes from the same
  // ThemeProvider the picker itself writes to.
  const { isDarkMode } = useTheme();

  // ---- Navigation ----
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // ---- Shared study data: history + spaced-repetition cards ----
  // Start empty; the load effect below fills these in as soon as scopeId is
  // known, so nothing from a previous scope is ever visible even briefly.
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recallCards, setRecallCards] = useState<RecallCard[]>([]);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const examEventsRef = useRef<ExamEvent[]>([]);
  // Student-named folders of saved cards (e.g. "Bio Midterm") — see
  // types.ts Collection and RecallCard.collectionId/.saved.
  const [collections, setCollections] = useState<Collection[]>([]);
  // Which day the standalone Calendar overlay should open on next (see the
  // `showCalendar` overlay near the end of this component — there's no
  // bottom-nav tab for it, since the nav bar is already full). Passed to
  // CalendarScreen as a React `key` (not just a prop) so tapping a
  // different exam from the Profile preview forces a fresh mount that
  // actually jumps there, instead of being ignored by Calendar's own
  // internal "selected day" state once it's already mounted.
  const [calendarInitialDate, setCalendarInitialDate] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const openCalendar = (date?: string) => {
    setCalendarInitialDate(date ?? null);
    setShowCalendar(true);
  };

  // ---- Cross-device cloud sync ----
  // Local state is still saved to localStorage first (instant, works
  // offline), but for a signed-in user it's now ALSO mirrored to Firestore
  // and kept live in sync with every other device signed into the same
  // account. With classmates all sharing this app — often from more than
  // one device each — each history item, recall card, exam, and collection
  // is its own document in a subcollection (users/{uid}/historyItems/{id},
  // /recallCards/{id}, /examEvents/{id}, /collections/{id}) rather than one
  // giant array crammed into a single field. That matters: with one array
  // field, if two devices happened to save around the same moment, the one
  // that landed second would silently overwrite everything the first one
  // had just changed. With separate documents per item, two devices editing
  // *different* cards, exams, or history entries at the same time simply
  // both succeed — only an edit to the exact same item can collide, and
  // even then it only affects that one item, never anyone else's data.
  // gradeLevel/streak/totalReviews are simple counters/values, small enough
  // that a single shared profile document (users/{uid}) is fine for them —
  // totalReviews uses Firestore's atomic increment() below specifically so
  // two devices finishing a review at the same moment both get counted
  // instead of one overwriting the other's count.
  const lastCloudTotalReviewsRef = useRef<number | null>(null);
  const lastCloudStreakRef = useRef<number | null>(null);
  const lastCloudGradeLevelRef = useRef<string | null>(null);

  // Small profile fields (gradeLevel, streak, totalReviews) — one shared doc.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data();
        if (!data) return;
        if (typeof data.totalReviews === 'number' && data.totalReviews !== lastCloudTotalReviewsRef.current) {
          lastCloudTotalReviewsRef.current = data.totalReviews;
          setTotalReviews(data.totalReviews);
        }
        if (typeof data.streak === 'number' && data.streak !== lastCloudStreakRef.current) {
          lastCloudStreakRef.current = data.streak;
          setStreak(data.streak);
        }
        if (typeof data.gradeLevel === 'string' && data.gradeLevel !== lastCloudGradeLevelRef.current) {
          lastCloudGradeLevelRef.current = data.gradeLevel;
          setGradeLevel(data.gradeLevel);
        }
      },
      (err) => console.error('Profile sync listener failed', err)
    );
    return () => unsubscribe();
  }, [user]);

  // Per-item collections — history, recall cards, exams, saved-card folders.
  // Each listener just replaces local state with whatever's currently in
  // that subcollection; individual mutators (addExam, updateRecallCard,
  // etc., defined further down) write straight to the matching document the
  // moment the user does something, so there's no array-diffing here.
  useEffect(() => {
    if (!user) return;
    const unsubHistory = onSnapshot(
      fsCollection(db, 'users', user.uid, 'historyItems'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as HistoryItem);
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHistory(items.slice(0, 50));
      },
      (err) => console.error('History sync failed', err)
    );
    const unsubRecall = onSnapshot(
      fsCollection(db, 'users', user.uid, 'recallCards'),
      (snap) => setRecallCards(snap.docs.map((d) => d.data() as RecallCard)),
      (err) => console.error('Recall card sync failed', err)
    );
    const unsubExams = onSnapshot(
      fsCollection(db, 'users', user.uid, 'examEvents'),
      (snap) => setExamEvents(snap.docs.map((d) => d.data() as ExamEvent)),
      (err) => console.error('Exam sync failed', err)
    );
    const unsubCollections = onSnapshot(
      fsCollection(db, 'users', user.uid, 'collections'),
      (snap) => setCollections(snap.docs.map((d) => d.data() as Collection)),
      (err) => console.error('Collections sync failed', err)
    );
    return () => {
      unsubHistory();
      unsubRecall();
      unsubExams();
      unsubCollections();
    };
  }, [user]);

  // Small helpers used by the mutators below — write (or delete) exactly
  // one item's document in one of the per-account subcollections. No-ops
  // for guests, who have no account/uid to write to.
  //
  // Firestore's setDoc throws *synchronously* (not just a rejected promise)
  // when a field is literally `undefined` — which some callers produce on
  // purpose for empty optional fields (e.g. an exam's subject/notes/
  // linkedHistoryId). Callers depend on this function running to completion
  // before they do their own thing next (e.g. ExamSheet's Save handler
  // closes the modal right after calling onAddExam/onUpdateExam) — a
  // synchronous throw here would abort mid-call and leave the UI stuck open.
  // Stripping undefined values avoids that case entirely, and the try/catch
  // is a second line of defense so no cloud write, bad or otherwise, can
  // ever block the UI. The write is best-effort; local state is what the
  // rest of the app can always count on.
  const stripUndefined = (data: unknown): unknown => {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
    return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== undefined));
  };
  const upsertCloudItem = (sub: string, id: string, data: unknown) => {
    if (!user) return;
    try {
      setDoc(doc(db, 'users', user.uid, sub, id), stripUndefined(data) as object).catch((err) =>
        console.error(`Failed to sync ${sub} item`, err)
      );
    } catch (err) {
      console.error(`Failed to sync ${sub} item`, err);
    }
  };
  const deleteCloudItem = (sub: string, id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'users', user.uid, sub, id)).catch((err) =>
      console.error(`Failed to delete ${sub} item`, err)
    );
  };


  // Load this scope's data exactly once when it first becomes active (a new
  // sign-in, or dropping into guest mode). Re-running only on a genuine
  // scope change — not on every render — is what keeps this from re-loading
  // (and clobbering in-progress edits) on unrelated re-renders.
  useEffect(() => {
    if (!scopeId || loadedScopeRef.current === scopeId) return;
    loadedScopeRef.current = scopeId;
    setHistory(loadLocal(scopedKey('kojlux_history', scopeId), []));
    setRecallCards(loadLocal(scopedKey('kojlux_recall_cards', scopeId), []));
    setTotalReviews(loadLocal(scopedKey('kojlux_total_reviews', scopeId), 0));
    setExamEvents(loadLocal(scopedKey('kojlux_exam_events', scopeId), []));
    setCollections(loadLocal(scopedKey('kojlux_collections', scopeId), []));
    setGradeLevel(loadLocal(scopedKey('kojlux_grade_level', scopeId), GRADE_LEVEL_OPTIONS[2]));
    setStreak(loadLocal(scopedKey('kojlux_streak', scopeId), 0));
  }, [scopeId]);

  // These just keep the local offline cache warm — actual cloud sync now
  // happens per-item inside the mutators below (addExam, updateRecallCard,
  // etc.), not by watching these arrays and pushing the whole thing.
  useEffect(() => {
    if (!scopeId) return;
    saveLocal(scopedKey('kojlux_history', scopeId), history);
  }, [history, scopeId]);
  useEffect(() => {
    if (!scopeId) return;
    saveLocal(scopedKey('kojlux_recall_cards', scopeId), recallCards);
  }, [recallCards, scopeId]);
  useEffect(() => {
    if (!scopeId) return;
    saveLocal(scopedKey('kojlux_total_reviews', scopeId), totalReviews);
  }, [totalReviews, scopeId]);
  useEffect(() => {
    if (!scopeId) return;
    saveLocal(scopedKey('kojlux_exam_events', scopeId), examEvents);
  }, [examEvents, scopeId]);
  useEffect(() => {
    if (!scopeId) return;
    saveLocal(scopedKey('kojlux_collections', scopeId), collections);
  }, [collections, scopeId]);

  // ---- Server-side mirror for closed-browser push notifications ----
  // Everything above is local-first (localStorage), which a closed browser
  // can't read. For a Cloud Function to send a push at the right moment, it
  // needs the due dates in Firestore instead. Deliberately kept minimal —
  // no prompt/answer/image text, just what's needed to decide *when* and
  // *what to say* — since these documents are re-written on every change.
  // Guests have no account to attach this to, so this is sign-in only; see
  // PUSH_NOTIFICATIONS_SETUP.md for what a guest gets instead.
  useEffect(() => {
    if (!user) return;
    const dueDates = recallCards.map((c) => ({ id: c.id, dueAt: c.dueAt, sourceTitle: c.sourceTitle }));
    setDoc(doc(db, 'users', user.uid), { recallCardDueDates: dueDates }, { merge: true }).catch((err) =>
      console.error('Failed to sync recall card due dates', err)
    );
  }, [recallCards, user]);
  useEffect(() => {
    if (!user) return;
    const examReminders = examEvents
      .filter((e) => !e.reminderSent)
      .map((e) => ({ id: e.id, title: e.title, date: e.date }));
    setDoc(doc(db, 'users', user.uid), { examReminders }, { merge: true }).catch((err) =>
      console.error('Failed to sync exam reminders', err)
    );
  }, [examEvents, user]);
  useEffect(() => {
    recallCardsRef.current = recallCards;
  }, [recallCards]);
  useEffect(() => {
    examEventsRef.current = examEvents;
  }, [examEvents]);

  const addHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const combined = [item, ...prev];
      const next = combined.slice(0, 50);
      // Anything that falls off the 50-item cap should stop existing in the
      // cloud too, or it would just sit there taking up space forever.
      combined.slice(50).forEach((h) => deleteCloudItem('historyItems', h.id));
      return next;
    });
    upsertCloudItem('historyItems', item.id, item);
  };
  const addRecallCards = (cards: RecallCard[]) => {
    setRecallCards((prev) => [...prev, ...cards]);
    cards.forEach((c) => upsertCloudItem('recallCards', c.id, c));
  };
  const addExam = (exam: ExamEvent) => {
    setExamEvents((prev) => [...prev, exam]);
    upsertCloudItem('examEvents', exam.id, exam);
  };
  const updateExam = (exam: ExamEvent) => {
    setExamEvents((prev) => prev.map((e) => (e.id === exam.id ? exam : e)));
    upsertCloudItem('examEvents', exam.id, exam);
  };
  const deleteExam = (id: string) => {
    setExamEvents((prev) => prev.filter((e) => e.id !== id));
    deleteCloudItem('examEvents', id);
  };
  const addCollection = (collection: Collection) => {
    setCollections((prev) => [...prev, collection]);
    upsertCloudItem('collections', collection.id, collection);
  };
  const renameCollection = (id: string, name: string) => {
    setCollections((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, name } : c));
      const renamed = next.find((c) => c.id === id);
      if (renamed) upsertCloudItem('collections', id, renamed);
      return next;
    });
  };
  // Deleting a collection never deletes the cards inside it — they just
  // become un-filed (collectionId cleared) but stay in the saved library.
  const deleteCollection = (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    deleteCloudItem('collections', id);
    setRecallCards((prev) =>
      prev.map((c) => {
        if (c.collectionId !== id) return c;
        const updated = { ...c, collectionId: undefined };
        upsertCloudItem('recallCards', updated.id, updated);
        return updated;
      })
    );
  };
  const updateRecallCard = (updated: RecallCard) => {
    setRecallCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    upsertCloudItem('recallCards', updated.id, updated);
  };
  // ReviewQueue hands back the whole post-review array rather than a single
  // changed card, so this diffs it against what's currently in state to
  // find just the cards that actually changed (or were added/removed) and
  // only writes those — not the entire set on every review.
  const updateRecallCards = (updated: RecallCard[]) => {
    const prevById = new Map(recallCards.map((c) => [c.id, c]));
    const updatedIds = new Set(updated.map((c) => c.id));
    updated.forEach((c) => {
      const prev = prevById.get(c.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(c)) {
        upsertCloudItem('recallCards', c.id, c);
      }
    });
    recallCards.forEach((c) => {
      if (!updatedIds.has(c.id)) deleteCloudItem('recallCards', c.id);
    });
    setRecallCards(updated);
    setTotalReviews((n) => n + 1);
    if (user) {
      // Firestore's atomic increment() — not "read totalReviews, add one,
      // write it back" — so two devices finishing a review at the same
      // moment both actually get counted instead of one clobbering the
      // other's count.
      setDoc(doc(db, 'users', user.uid), { totalReviews: increment(1) }, { merge: true }).catch((err) =>
        console.error('Failed to sync total reviews', err)
      );
    }
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
    if (scopeId) saveLocal(scopedKey('kojlux_streak', scopeId), nextStreak);
    if (user) {
      lastCloudStreakRef.current = nextStreak;
      updateDoc(doc(db, 'users', user.uid), { streak: nextStreak }).catch((err) =>
        console.error('Failed to sync streak', err)
      );
    }
  };

  const handleGradeLevelChange = (g: string) => {
    setGradeLevel(g);
    if (scopeId) saveLocal(scopedKey('kojlux_grade_level', scopeId), g);
    if (user) {
      lastCloudGradeLevelRef.current = g;
      setDoc(doc(db, 'users', user.uid), { gradeLevel: g }, { merge: true }).catch((err) =>
        console.error('Failed to sync grade level', err)
      );
    }
  };

  // Explicit sign-out: distinct from onAuthStateChanged simply seeing `user`
  // go null (which also happens transiently while auth is still resolving).
  // Clears every piece of active, user-specific state immediately — history,
  // recall cards, streak, grade level — so nothing from the account that
  // just signed out is visible even for a frame, and resets scope tracking
  // so the next sign-in (or guest session) loads its own data fresh instead
  // of quietly reusing whatever is still sitting in memory.
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed', err);
    }
    setHistory([]);
    setRecallCards([]);
    setTotalReviews(0);
    setExamEvents([]);
    setCollections([]);
    setStreak(0);
    setGradeLevel(GRADE_LEVEL_OPTIONS[2]);
    setGuestMode(false);
    setShowAuthScreen(false);
    setGuestBannerDismissed(false);
    loadedScopeRef.current = null;
    lastCloudTotalReviewsRef.current = null;
    lastCloudStreakRef.current = null;
    lastCloudGradeLevelRef.current = null;
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

  if (!user && showAuthScreen) {
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
  if (!user && !guestMode) {
    return <WelcomeGate onSkip={() => setGuestMode(true)} onSignIn={() => setShowAuthScreen(true)} />;
  }

  return (
    <div className="min-h-screen bg-focus-bg dark:bg-slate-950">
      {/* Nav renders itself as a bottom bar on phones and a left rail from
          md up — see BottomNav.tsx. It's fixed/full-height on desktop, so
          it lives outside the centered content column below. */}
      <BottomNav active={activeTab} dueCount={dueCount} onChange={setActiveTab} />

      <div className="md:pl-20 lg:pl-56 min-h-screen flex flex-col">
        {/* Content stays a comfortable single reading column on phones
            (max-w-md) and gradually claims more of the available width as
            the viewport grows, instead of staying pinned to phone-width on
            every screen size. */}
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3 flex items-center justify-between gap-3">
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {SCREEN_TITLES[activeTab]}
          </h1>
          {activeTab === 'home' && (
            <button
              onClick={() => openCalendar()}
              aria-label="Study Calendar"
              className="shrink-0 w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
            >
              <CalendarDays className="w-4 h-4 text-focus-primary" />
            </button>
          )}
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

        {isNotificationSupported() && notifPermission === 'default' && !notifBannerDismissed && (recallCards.length > 0 || user) && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2.5 bg-focus-primary/10 dark:bg-focus-primary/15 border border-focus-primary/25 rounded-2xl p-3">
              <Bell className="w-4 h-4 text-focus-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Want a nudge when a review is ready? Turn on notifications and we'll let you know.
                </p>
                <div className="flex gap-4 mt-1.5">
                  <button
                    onClick={async () => {
                      const permission = await requestNotificationPermission();
                      setNotifPermission(permission);
                      // Only signed-in users have a Firestore doc for the
                      // backend to push to — see the sync effects above and
                      // PUSH_NOTIFICATIONS_SETUP.md.
                      if (permission === 'granted' && user) registerPushForUser(user.uid);
                    }}
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

        <main className="flex-1 px-5 pb-28 md:pb-10">
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
              darkMode={isDarkMode}
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
              onUpdateCard={updateRecallCard}
              history={history}
              onAddRecallCards={addRecallCards}
              collections={collections}
              onAddCollection={addCollection}
              onRenameCollection={renameCollection}
              onDeleteCollection={deleteCollection}
              onError={setErrorMsg}
              submitterId={user?.uid ?? 'guest'}
              deepLinkCardId={deepLinkCardId}
              deepLinkCollectionId={deepLinkCollectionId}
              onConsumeDeepLink={consumeDeepLink}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen
              email={user?.email || ''}
              username={username}
              gradeLevel={gradeLevel}
              onGradeLevelChange={handleGradeLevelChange}
              streak={streak}
              totalReviews={totalReviews}
              isGuest={!user}
              onSignOut={handleSignOut}
              onSignIn={() => setShowAuthScreen(true)}
              exams={examEvents}
              history={history}
              onAddExam={addExam}
              onUpdateExam={updateExam}
              onDeleteExam={deleteExam}
            />
          )}
        </main>
        </div>
      </div>

      {/* Study Calendar isn't a bottom-nav tab — there's no room left on that
          bar — so it opens as a full-screen overlay from the icon button in
          the Home header instead, the same pattern already used below for
          errorMsg and for AuthScreen earlier in this file. */}
      {showCalendar && (
        <div className="fixed inset-0 z-[150] bg-focus-bg dark:bg-slate-950 overflow-y-auto md:pl-20 lg:pl-56">
          <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto min-h-screen flex flex-col">
            <header className="sticky top-0 z-10 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3 flex items-center gap-3">
              <button
                onClick={() => setShowCalendar(false)}
                aria-label="Back"
                className="shrink-0 w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
              <h1 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Study Calendar
              </h1>
            </header>
            <main className="flex-1 px-5 pb-10">
              <CalendarScreen
                key={calendarInitialDate ?? 'calendar-default'}
                exams={examEvents}
                history={history}
                onAddExam={addExam}
                onUpdateExam={updateExam}
                onDeleteExam={deleteExam}
                initialDate={calendarInitialDate}
              />
            </main>
          </div>
        </div>
      )}

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
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-2xl transition shadow-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The Quiz tab hosts both the Quiz Builder and, via an in-screen toggle,
// NoteCraft — the two started as separate nav destinations in the old
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
  const [subTab, setSubTab] = useState<'quiz' | 'notecraft'>('quiz');
  return (
    <div className="space-y-5">
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {(['quiz', 'notecraft'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
              subTab === t ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t === 'quiz' ? 'Quiz Builder' : 'NoteCraft'}
          </button>
        ))}
      </div>
      {subTab === 'quiz' ? (
        <QuizBuilder gradeLevel={props.gradeLevel} onSaveHistory={props.onSaveHistory} onAddRecallCards={props.onAddRecallCards} onError={props.onError} />
      ) : (
        <NoteCraft
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