import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection as fsCollection, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AlertCircle, X, ArrowLeft, Camera, Bell } from 'lucide-react';

import { HistoryItem, RecallCard, ExamEvent, Collection, NotificationItem, SummaryData } from './types';
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
import {
  loadNotifications,
  addNotification,
  upsertNotification,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationsByTagRead,
} from './lib/notificationCenter';
import { loadDraft } from './lib/draftStore';
import { GRADE_LEVEL_OPTIONS } from './constants';
import { registerPushForUser } from './lib/push';

import AuthScreen from './components/AuthScreen';
import StudyHome from './components/StudyHome';
import QuizBuilder from './components/QuizBuilder';
import NoteCraft from './components/NoteCraft';
import ReviewQueue from './components/ReviewQueue';
import ProfileScreen from './components/ProfileScreen';
import MaterialsHub from './components/MaterialsHub';
import NotificationCenter from './components/NotificationCenter';
import BottomNav, { NavTab } from './components/BottomNav';
import { clearDeepLinkUrl, parseDeepLinkCardId, parseDeepLinkCollectionId } from './lib/deepLink';
import { ThemeProvider } from './context/ThemeContext';
import SharedLinkGate from './components/SharedLinkGate';
import { fetchSharedCard, fetchSharedCollection } from './lib/sharedCards';
import { cardFromSharedSnapshot } from './lib/sharedImport';
import { getPendingImport, clearPendingImport } from './lib/pendingImport';
import { makeCollection } from './lib/collections';

const SCREEN_TITLES: Record<NavTab, string> = {
  home: 'Kojlux Study Hub',
  quiz: 'Create',
  community: 'Materials',
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
  const [activityDays, setActivityDays] = useState<string[]>([]);

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
            if (Array.isArray(data.activityDays)) setActivityDays(data.activityDays.filter((day): day is string => typeof day === 'string'));
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
  // The due-card/exam poll below (checkForNewlyDueCards/checkExamReminders)
  // is set up once on mount with an empty effect dependency array — it has
  // to be, since it also owns the setInterval/visibilitychange wiring — so
  // it can't just close over `scopeId` from render. This ref keeps it
  // pointed at whichever scope is currently active (signed-in user vs.
  // guest vs. a fresh sign-in) without re-running that whole effect.
  const scopeIdRef = useRef<string | null>(null);
  useEffect(() => {
    scopeIdRef.current = scopeId;
  }, [scopeId]);

  // ---- Notification Center ----
  // Every notification below (review-ready, exam reminders, quiz-resume) is
  // recorded here in addition to being fired as a browser Notification, so
  // it's visible any time the student opens the app — including when
  // browser notifications were never granted. See lib/notificationCenter.ts.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // ---- Review-ready notifications ----
  // No service worker/push backend here, so this only works while the app is
  // open: poll for cards that just became due and fire a local notification.
  // Permission is requested from the banner's button click, never silently.
  const [notifPermission, setNotifPermission] = useState<NotificationSupportState>(() => getNotificationPermission());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  useEffect(() => {
    const refreshNotificationPermission = () => setNotifPermission(getNotificationPermission());
    window.addEventListener('focus', refreshNotificationPermission);
    document.addEventListener('visibilitychange', refreshNotificationPermission);
    return () => {
      window.removeEventListener('focus', refreshNotificationPermission);
      document.removeEventListener('visibilitychange', refreshNotificationPermission);
    };
  }, []);

  useEffect(() => {
    if (user && notifPermission === 'granted') {
      registerPushForUser(user.uid).catch((err) => console.error('Failed to enable push notifications', err));
    }
  }, [user, notifPermission]);

  // Shared by the "enable notifications" banner and the always-visible
  // status row in Profile > Settings, so both stay in sync with a single
  // source of truth instead of each requesting permission independently.
  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifPermission(permission);
    if (permission === 'granted' && user) registerPushForUser(user.uid);
  };

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

  // Hoisted out of the polling effect below (instead of defined inline
  // inside it) so they can ALSO be called the instant recallCards/examEvents
  // actually change — see the two effects near the ref-sync effects further
  // down. Both still read from recallCardsRef/examEventsRef rather than the
  // recallCards/examEvents state directly, since the mount-time interval/
  // visibilitychange listeners below capture whichever version of these
  // functions exists at mount — reading from refs (always current) instead
  // of closed-over state (frozen at mount) is what keeps THOSE calls correct
  // over time, same as before this refactor.
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
    if (scopeIdRef.current) {
      if (currentlyDue.length > 0) {
        setNotifications(
          upsertNotification(scopeIdRef.current, 'reviews-ready', {
            type: 'review_ready',
            title: currentlyDue.length === 1 ? 'A review is ready' : `${currentlyDue.length} reviews are ready`,
            body: 'A few minutes now beats cramming later — tap to jump into Review.',
            targetTab: 'review',
          })
        );
      } else {
        setNotifications(markNotificationsByTagRead(scopeIdRef.current, 'reviews-ready'));
      }
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
    due.forEach((exam) => {
      notifyExamReminder(exam.title, exam.id);
      if (scopeIdRef.current) {
        setNotifications(
          addNotification(scopeIdRef.current, {
            type: 'exam_reminder',
            title: "Don't forget to study!",
            body: `Your exam "${exam.title}" is tomorrow. Tap to review your materials.`,
            targetTab: 'profile',
            dedupeTag: `exam-reminder-${exam.id}`,
          })
        );
      }
    });
    const dueIds = new Set(due.map((e) => e.id));
    setExamEvents((prev) => prev.map((e) => (dueIds.has(e.id) ? { ...e, reminderSent: true } : e)));
  };

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Navigation ----
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [quizSourceSummary, setQuizSourceSummary] = useState<SummaryData | null>(null);

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
  const activityDaysRef = useRef<string[]>([]);
  useEffect(() => { activityDaysRef.current = activityDays; }, [activityDays]);

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
    const storedActivityDays = loadLocal<string[]>(scopedKey('kojlux_activity_days', scopeId), []);
    setActivityDays(storedActivityDays);
    activityDaysRef.current = storedActivityDays;
    setNotifications(loadNotifications(scopeId));
  }, [scopeId]);

  // ---- Mid-quiz refresh recovery ----
  // QuizBuilder already persists an in-progress quiz to IndexedDB as the
  // student answers (see lib/draftStore.ts + the draft effects in
  // QuizBuilder.tsx), so a refresh doesn't lose their work. What it can't do
  // on its own is tell the student that draft exists — a refresh always
  // drops back to the Home tab, not the Quiz tab where QuizBuilder would
  // silently rehydrate it. This checks for that draft once scope is known
  // and, if one exists, drops a "resume your quiz" notification into the
  // Notification Center pointing back at the Quiz tab.
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    loadDraft<{ quizData: unknown }>('quiz_builder')
      .then((draft) => {
        if (cancelled || !draft || !draft.quizData) return;
        setNotifications(
          addNotification(scopeId, {
            type: 'quiz_resume',
            title: 'Resume your quiz',
            body: "Looks like you left a quiz in progress — tap to pick up right where you left off.",
            targetTab: 'quiz',
            dedupeTag: 'quiz-resume',
          })
        );
      })
      .catch((err) => console.error('Failed to check for an in-progress quiz draft', err));
    return () => {
      cancelled = true;
    };
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

  // The mount-time effect above only checks once immediately, then again on
  // a 60s interval or a visibility change — fine for catching a card
  // crossing its due date while the tab sits open, but NOT for the very
  // first render: recallCards/examEvents load asynchronously (localStorage,
  // then Firestore for signed-in users), so that first mount-time check
  // fires against an empty array before real data has arrived, decides
  // nothing's due, and marks the Notification Center's "reviews are ready"
  // entry read. The result: the bell could say "nothing due" for up to a
  // minute — or until the tab is backgrounded and refocused — even while
  // Review correctly shows every due card. Re-running the moment the real
  // data lands closes that gap immediately instead of waiting on the poll.
  useEffect(() => {
    checkForNewlyDueCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallCards]);
  useEffect(() => {
    checkExamReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (item.type === 'quiz' || item.type === 'summary') recordStudyActivity();
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
  };


  // A day counts toward the streak the first time the student creates a quiz,
  // creates a summary, or posts study material that day.
  const bumpStreak = () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const lastActive = scopeId ? loadLocal<string | null>(scopedKey('kojlux_last_active_day', scopeId), null) : null;
    if (lastActive === todayKey) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = lastActive === yesterday.toISOString().slice(0, 10);
    const nextStreak = wasYesterday ? streak + 1 : 1;
    setStreak(nextStreak);
    if (scopeId) {
      saveLocal(scopedKey('kojlux_last_active_day', scopeId), todayKey);
      saveLocal(scopedKey('kojlux_streak', scopeId), nextStreak);
    }
    if (user) {
      lastCloudStreakRef.current = nextStreak;
      updateDoc(doc(db, 'users', user.uid), { streak: nextStreak }).catch((err) =>
        console.error('Failed to sync streak', err)
      );
    }
  };

  const recordStudyActivity = () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (activityDaysRef.current.includes(todayKey)) return;
    const nextDays = [...activityDaysRef.current, todayKey].sort();
    activityDaysRef.current = nextDays;
    setActivityDays(nextDays);
    if (scopeId) saveLocal(scopedKey('kojlux_activity_days', scopeId), nextDays);
    if (user) setDoc(doc(db, 'users', user.uid), { activityDays: nextDays }, { merge: true }).catch((err) => console.error('Failed to sync activity days', err));
    bumpStreak();
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
    setNotifications([]);
    setGuestMode(false);
    setShowAuthScreen(false);
    setGuestBannerDismissed(false);
    loadedScopeRef.current = null;
    lastCloudTotalReviewsRef.current = null;
    lastCloudStreakRef.current = null;
    lastCloudGradeLevelRef.current = null;
  };

  // ---- Resume a shared-link import queued before the guest signed up ----
  // See components/SharedLinkGate.tsx: a guest who tapped "Save to
  // Collection" on the restricted lock screen had their card/collection id
  // stashed in lib/pendingImport.ts (not this account's data — there was no
  // account yet). The moment `user` goes from null to set, re-fetch that
  // snapshot and clone it in, same as the normal in-app import path. Guarded
  // by a ref so this can't double-run across re-renders once it's started.
  const importedPendingRef = useRef(false);
  useEffect(() => {
    if (!user || importedPendingRef.current) return;
    const pending = getPendingImport();
    if (!pending) return;
    importedPendingRef.current = true;
    (async () => {
      try {
        if (pending.type === 'card') {
          const snap = await fetchSharedCard(pending.id);
          if (!snap) return;
          if (pending.newCollectionName?.trim()) {
            const destination = makeCollection(pending.newCollectionName.trim());
            addCollection(destination);
            addRecallCards([cardFromSharedSnapshot(snap, destination.id)]);
          } else if (pending.targetCollectionId) {
            addRecallCards([cardFromSharedSnapshot(snap, pending.targetCollectionId)]);
          } else {
            addRecallCards([cardFromSharedSnapshot(snap)]);
          }
        } else {
          const snap = await fetchSharedCollection(pending.id);
          if (snap) {
            if (pending.newCollectionName?.trim()) {
              const destination = makeCollection(pending.newCollectionName.trim());
              addCollection(destination);
              addRecallCards(snap.cards.map((c) => cardFromSharedSnapshot(c, destination.id)));
            } else if (pending.targetCollectionId) {
              addRecallCards(snap.cards.map((c) => cardFromSharedSnapshot(c, pending.targetCollectionId)));
            } else {
              addRecallCards(snap.cards.map((c) => cardFromSharedSnapshot(c)));
            }
          }
        }
      } catch (err) {
        console.error('Failed to resume pending shared-link import', err);
      } finally {
        clearPendingImport();
        consumeDeepLink();
      }
    })();
  }, [user]);

  // ---- Errors ----
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    <SharedLinkGate
      cardId={deepLinkCardId}
      collectionId={deepLinkCollectionId}
      isLoggedIn={!!user}
      collections={collections}
      onImportCard={addRecallCards}
      onImportCollection={(collection, importedCards) => {
        if (collection) addCollection(collection);
        addRecallCards(importedCards);
      }}
      onDismiss={consumeDeepLink}
      onRequestAuth={() => setShowAuthScreen(true)}
    >
    <div className="min-h-screen bg-focus-bg dark:bg-slate-950">
      {/* Nav renders itself as a bottom bar on phones and a left rail from
          md up — see BottomNav.tsx. It's fixed/full-height on desktop, so
          it lives outside the centered content column below. */}
      <BottomNav active={activeTab} onChange={setActiveTab} />

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
              onClick={() => setShowNotifications(true)}
              aria-label="Notifications"
              className="relative shrink-0 w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
            >
              <Bell className="w-4 h-4 text-focus-primary" />
              {notifications.some((n) => !n.read) && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifications.filter((n) => !n.read).length > 9 ? '9+' : notifications.filter((n) => !n.read).length}
                </span>
              )}
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
                    onClick={enableNotifications}
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
              activityDays={activityDays}
              history={history}
              onNavigate={(tab) => setActiveTab(tab === 'summarizer' ? 'quiz' : (tab as NavTab))}
            />
          )}

          {activeTab === 'quiz' && (
            <QuizBuilderOrSummarizer
              gradeLevel={gradeLevel}
              history={history}
              sourceSummary={quizSourceSummary}
              onSourceConsumed={() => setQuizSourceSummary(null)}
              onCreateQuizFromSummary={(summary) => {
                setQuizSourceSummary(summary);
                setActiveTab('quiz');
              }}
              onSaveHistory={addHistory}
              onAddRecallCards={addRecallCards}
              onError={setErrorMsg}
            />
          )}

          {activeTab === 'community' && (
            <MaterialsHub currentUserId={user?.uid ?? null} defaultGradeLevel={gradeLevel} onError={setErrorMsg} onStudyActivity={recordStudyActivity} />
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
              notifPermission={notifPermission}
              onEnableNotifications={enableNotifications}
            />
          )}
        </main>
        </div>
      </div>

      {/* Opens as a full-screen overlay from the bell icon in the Home
          header, the same pattern the Study Calendar overlay used to use
          before it moved to living inline on the Profile screen. */}
      {showNotifications && (
        <NotificationCenter
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={() => {
            if (scopeId) setNotifications(markAllNotificationsRead(scopeId));
          }}
          onSelect={(item) => {
            if (scopeId) setNotifications(markNotificationRead(scopeId, item.id));
            setShowNotifications(false);
            if (item.targetTab) setActiveTab(item.targetTab as NavTab);
          }}
        />
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
    </SharedLinkGate>
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
  sourceSummary: SummaryData | null;
  onSourceConsumed: () => void;
  onCreateQuizFromSummary: (summary: SummaryData) => void;
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<'quiz' | 'notecraft'>('quiz');
  useEffect(() => {
    if (props.sourceSummary) setSubTab('quiz');
  }, [props.sourceSummary]);
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
        <QuizBuilder
          gradeLevel={props.gradeLevel}
          summarySource={props.sourceSummary ? formatSummaryForQuiz(props.sourceSummary) : null}
          onSummarySourceConsumed={props.onSourceConsumed}
          onSaveHistory={props.onSaveHistory}
          onAddRecallCards={props.onAddRecallCards}
          onError={props.onError}
        />
      ) : (
        <NoteCraft
          gradeLevel={props.gradeLevel}
          onSaveHistory={props.onSaveHistory}
          onAddRecallCards={props.onAddRecallCards}
          onError={props.onError}
          onCreateQuizFromSummary={props.onCreateQuizFromSummary}
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
  const [consent, setConsent] = useState<'pending' | 'accepted' | 'declined'>(() => {
    try {
      return localStorage.getItem('kojlux_privacy_accepted') === 'true' ? 'accepted' : 'pending';
    } catch {
      return 'pending';
    }
  });

  const acceptPrivacy = () => {
    try {
      localStorage.setItem('kojlux_privacy_accepted', 'true');
    } catch {
      // Consent still applies for this session if browser storage is unavailable.
    }
    setConsent('accepted');
  };

  return (
    <div className="min-h-screen bg-focus-bg dark:bg-slate-950 flex items-center justify-center p-5">
      <div className="max-w-sm w-full space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden shadow-lg shadow-focus-primary/25">
            <img
              src={`${import.meta.env.BASE_URL}icon.png`}
              alt="Kojlux Study Hub app icon"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">Welcome to Kojlux Study Hub</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">
            Turn notes and textbook pages into quizzes, summaries, and spaced-repetition review. Sign in to sync
            across devices, or jump straight in as a guest.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Before you enter</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Please review the{' '}
            <a
              href={`${import.meta.env.BASE_URL}privacy.html`}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-focus-primary underline underline-offset-2"
            >
              Privacy Policy
            </a>{' '}
            before using Kojlux Study Hub.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={acceptPrivacy}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                consent === 'accepted'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-focus-primary text-white hover:bg-focus-primary-dark'
              }`}
            >
              {consent === 'accepted' ? 'Accepted' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={() => setConsent('declined')}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold transition"
            >
              Decline
            </button>
          </div>
          {consent === 'declined' && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed">
              You must accept the Privacy Policy to enter the app. You can accept it whenever you are ready.
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onSignIn}
            disabled={consent !== 'accepted'}
            className="w-full py-3.5 bg-focus-primary hover:bg-focus-primary-dark text-white rounded-2xl text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sign In / Register
          </button>
          <button
            onClick={onSkip}
            disabled={consent !== 'accepted'}
            className="w-full py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
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

function formatSummaryForQuiz(summary: SummaryData): string {
  const glossary = summary.glossary?.map((item) => `${item.term}: ${item.definition}`).join('\n') || '';
  return [
    `Summary: ${summary.title}`,
    summary.overview,
    'Key points:',
    ...summary.keyPoints.map((point) => `- ${point}`),
    glossary ? `Glossary:\n${glossary}` : '',
  ].filter(Boolean).join('\n\n');
}