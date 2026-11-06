import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, updateProfile, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection as fsCollection, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AlertCircle, X, ArrowLeft, Camera, Bell, UserRound, Mail, Palette } from 'lucide-react';

import { AgeBand, HistoryItem, RecallCard, ExamEvent, Collection, NotificationItem, SummaryData } from './types';
import { loadLocal, saveLocal, scopedKey } from './lib/storage';
import { isDue } from './lib/spacedRepetition';
import { isReminderDue } from './lib/examReminders';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  notifyReviewsReady,
  notifyExamReminder,
  dismissBrowserNotification,
  NotificationSupportState,
} from './lib/notifications';
import {
  loadNotifications,
  addNotification,
  upsertNotification,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationsByTagRead,
  clearNotification,
  clearNotificationsByTag,
} from './lib/notificationCenter';
import { clearDraft, listDraftKeys, loadDraft, saveDraft } from './lib/draftStore';
import { GRADE_LEVEL_OPTIONS } from './constants';
import { PushRegistrationStatus, registerNotificationServiceWorker, registerPushForUser } from './lib/push';

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
import { clearNotificationLink, parseNotificationLink } from './lib/notificationLinks';
import { useSidebarCollapse } from './components/study-home/hooks';

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
  const [notificationLink] = useState(parseNotificationLink);
  const [notificationExamId, setNotificationExamId] = useState<string | null>(notificationLink?.examId ?? null);
  useEffect(() => {
    if (notificationLink) clearNotificationLink();
  }, []);

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
  const [ageBand, setAgeBand] = useState<AgeBand | null>(() => loadLocal<AgeBand | null>('kojlux_age_band', null));
  const [displayName, setDisplayName] = useState<string>(() => loadLocal('kojlux_display_name', ''));
  const [onboardingStep, setOnboardingStep] = useState<'privacy' | 'age' | 'access' | 'news' | 'complete'>(() => {
    try {
      if (localStorage.getItem('kojlux_onboarding_complete') === 'true') return 'complete';
      const accepted = localStorage.getItem('kojlux_privacy_accepted') === 'true';
      const savedAgeBand = loadLocal<AgeBand | null>('kojlux_age_band', null);
      if (accepted && savedAgeBand) return 'complete';
      if (accepted) return 'age';
      return 'privacy';
    } catch {
      return 'privacy';
    }
  });
  const deletionAuthRequested = new URLSearchParams(window.location.search).get('requireAuth') === 'account-deletion';
  const [showAuthScreen, setShowAuthScreen] = useState(deletionAuthRequested);
  const [streak, setStreak] = useState<number>(0);
  const [activityDays, setActivityDays] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !firebaseUser.emailVerified) {
        setUser(null);
        setAuthLoading(false);
        if (!showAuthScreen) {
          void signOut(auth).catch((err) => console.error('Failed to sign out unverified account', err));
        }
        return;
      }
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        if (deletionAuthRequested) {
          window.location.replace(`${import.meta.env.BASE_URL}account-deletion.html`);
          return;
        }
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data.username === 'string' && data.username.trim()) setDisplayName(data.username.trim());
            if (data.gradeLevel) setGradeLevel(data.gradeLevel);
            if (data.ageBand === 'under13' || data.ageBand === '13to17' || data.ageBand === '18plus') {
              setAgeBand(data.ageBand);
              saveLocal('kojlux_age_band', data.ageBand);
            }
            if (typeof data.streak === 'number') setStreak(data.streak);
            if (Array.isArray(data.activityDays)) setActivityDays(data.activityDays.filter((day): day is string => typeof day === 'string'));
          }
        } catch (err) {
          console.error('Failed to load profile from Firestore', err);
        }
      }
    });
    return () => unsubscribe();
  }, [deletionAuthRequested, showAuthScreen]);

  // ---- Guest access ----
  // Sign-in used to be forced at startup. Now the gate offers Skip or Sign
  // In: `guestMode` lets someone in without an account (everything just
  // stays local, same as it already does whenever `user` is null elsewhere
  // in this file), and `showAuthScreen` is only for whether the *gate* is
  // currently showing the sign-in form or its own Skip/Sign-In choice.
  const [guestMode, setGuestMode] = useState<boolean>(() =>
    loadLocal('kojlux_guest_mode', false) ||
    Boolean(initialDeepLinkCardId || initialDeepLinkCollectionId || notificationLink)
  );
  const [focusSession, setFocusSession] = useState<'quiz' | 'notecraft' | null>(
    notificationLink?.resumeQuizId ? 'quiz' : null
  );
  const [resumeQuizId, setResumeQuizId] = useState<string | null>(notificationLink?.resumeQuizId ?? null);
  useEffect(() => saveLocal('kojlux_guest_mode', guestMode), [guestMode]);
  // If a guest actually signs in later, they're no longer a guest.
  useEffect(() => {
    if (user) {
      setGuestMode(false);
      setShowAuthScreen(false);
      if (onboardingStep === 'access') setOnboardingStep('news');
    }
  }, [user, onboardingStep]);

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
  // Review-ready and exam reminders are also fired as browser notifications;
  // paused quizzes have in-app reminders and background pushes for signed-in
  // users. All remain recorded here for visibility inside the app.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // ---- Review-ready notifications ----
  // Foreground polling provides local notifications for guests and remains
  // the fallback; signed-in users can also receive background FCM pushes
  // after permission is granted and push registration succeeds.
  // Permission is requested from the banner's button click, never silently.
  const [notifPermission, setNotifPermission] = useState<NotificationSupportState>(() => getNotificationPermission());
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState<PushRegistrationStatus>('idle');
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

  const setupPushNotifications = useCallback(async (uid: string | null) => {
    setPushRegistrationStatus('checking');
    try {
      const registration = await registerNotificationServiceWorker();
      if (!registration) {
        setPushRegistrationStatus('failed');
        return;
      }
      if (!uid) {
        setPushRegistrationStatus('local-only');
        return;
      }
      const token = await registerPushForUser(uid);
      setPushRegistrationStatus(token ? 'registered' : 'failed');
    } catch (err) {
      console.error('Failed to enable push notifications', err);
      setPushRegistrationStatus('failed');
    }
  }, []);

  useEffect(() => {
    if (notifPermission === 'granted') void setupPushNotifications(user?.uid ?? null);
    else setPushRegistrationStatus('idle');
  }, [user, notifPermission, setupPushNotifications]);

  // Shared by the "enable notifications" banner and the always-visible
  // status row in Profile > Settings, so both stay in sync with a single
  // source of truth instead of each requesting permission independently.
  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifPermission(permission);
    if (permission === 'granted') await setupPushNotifications(user?.uid ?? null);
  };

  const completeAgeBand = (selectedAgeBand: AgeBand) => {
    setAgeBand(selectedAgeBand);
    saveLocal('kojlux_age_band', selectedAgeBand);
    if (selectedAgeBand === 'under13') setActiveTab('home');
    if (user) {
      setDoc(doc(db, 'users', user.uid), { ageBand: selectedAgeBand }, { merge: true }).catch((err) =>
        console.error('Failed to sync age band', err)
      );
    }
  };

  const handleDisplayNameChange = async (nextName: string) => {
    const cleanedName = nextName.trim().slice(0, 40);
    if (!cleanedName) return;
    setDisplayName(cleanedName);
    saveLocal('kojlux_display_name', cleanedName);
    if (user) {
      try {
        await updateProfile(user, { displayName: cleanedName });
        await setDoc(doc(db, 'users', user.uid), { username: cleanedName }, { merge: true });
      } catch (err) {
        console.error('Failed to sync display name', err);
        setErrorMsg('Could not save your name right now.');
      }
    }
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
    const newlyDue = previouslyDueIdsRef.current
      ? currentlyDueIds.filter((id) => !previouslyDueIdsRef.current!.has(id))
      : [];
    if (previouslyDueIdsRef.current) {
      if (newlyDue.length > 0) notifyReviewsReady(newlyDue.length);
    }
    previouslyDueIdsRef.current = new Set(currentlyDueIds);
    if (previouslyDueScopeRef.current) {
      saveLocal(scopedKey('kojlux_previously_due_ids', previouslyDueScopeRef.current), currentlyDueIds);
    }
    if (scopeIdRef.current) {
      const storedNotifications = loadNotifications(scopeIdRef.current);
      const hasReviewsReadyNotification = storedNotifications.some((notification) => notification.dedupeTag === 'reviews-ready');
      if (currentlyDue.length > 0 && (newlyDue.length > 0 || !hasReviewsReadyNotification)) {
        setNotifications(
          upsertNotification(scopeIdRef.current, 'reviews-ready', {
            type: 'review_ready',
            title: currentlyDue.length === 1 ? 'A review is ready' : `${currentlyDue.length} reviews are ready`,
            body: 'A few minutes now beats cramming later — tap to jump into Review.',
            targetTab: 'review',
          })
        );
      } else if (currentlyDue.length === 0) {
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
      upsertCloudItem('examEvents', exam.id, { ...exam, reminderSent: true });
      if (scopeIdRef.current) {
        setNotifications(
          addNotification(scopeIdRef.current, {
            type: 'exam_reminder',
            title: "Don't forget to study!",
            body: `Your exam "${exam.title}" is tomorrow. Tap to review your materials.`,
            targetTab: 'profile',
            targetId: exam.id,
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
  const [activeTab, setActiveTab] = useState<NavTab>(() => notificationLink?.tab ?? 'home');
  const sidebarCollapse = useSidebarCollapse();
  const handleNotificationTargetHandled = useCallback(() => setNotificationExamId(null), []);
  const [reviewCollectionRequest, setReviewCollectionRequest] = useState<string | null>(null);
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
        const items = snap.docs
          .map((d) => d.data() as HistoryItem)
          .filter((item) => item.type === 'quiz' || item.type === 'summary');
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

  // Paused quizzes are stored separately so a new quiz can be generated
  // without replacing earlier work. Reminder checks run while the app is
  // open and again whenever the student returns.
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    const checkPausedQuizzes = async () => {
      try {
        const activeDraft = await loadDraft<{
          quizData?: { title?: string };
          workId?: string;
          lastReminderAt?: string;
          pausedAt?: string;
        }>(`quiz_builder_${scopeId}`);
        const pausedKeys = await listDraftKeys(`quiz_paused_${scopeId}_`);
        const drafts = await Promise.all(pausedKeys.map(async (key) => ({
          key,
          draft: await loadDraft<{
            quizData?: { title?: string };
            workId?: string;
            pausedAt?: string;
            lastReminderAt?: string;
          }>(key),
        })));
        if (cancelled) return;

        const initialNotifications = loadNotifications(scopeId);
        let nextNotifications = initialNotifications;
        const candidates = [
          ...(activeDraft?.quizData ? [{
            key: `quiz_builder_${scopeId}`,
            draft: activeDraft,
            id: activeDraft.workId ?? `legacy-${scopeId}`,
            pausedAt: new Date(Number(activeDraft.workId?.split('-')[0]) || Date.now()).toISOString(),
          }] : []),
          ...drafts.flatMap(({ key, draft }) => draft?.quizData ? [{
            key,
            draft,
            id: draft.workId ?? key.slice(`quiz_paused_${scopeId}_`.length),
            pausedAt: draft.pausedAt ?? new Date(Number(draft.workId?.split('-')[0]) || Date.now()).toISOString(),
          }] : []),
        ];

        for (const { key, draft, id, pausedAt } of candidates) {
          const tag = `quiz-resume:${id}`;
          const existing = nextNotifications.find((notification) => notification.dedupeTag === tag);
          const lastReminderAt = draft.lastReminderAt ?? existing?.createdAt ?? pausedAt;
          const reminderDue = Date.now() - Date.parse(lastReminderAt) >= 24 * 60 * 60 * 1000;
          if (!existing || reminderDue) {
            nextNotifications = upsertNotification(scopeId, tag, {
              type: 'quiz_resume',
              title: reminderDue ? `Your quiz is waiting: ${draft.quizData?.title ?? 'Paused quiz'}` : `Resume: ${draft.quizData?.title ?? 'Paused quiz'}`,
              body: reminderDue
                ? 'Your quiz is still saved. Resume it whenever you are ready to finish.'
                : 'Your answers are saved. Tap to continue where you left off.',
              targetTab: 'quiz',
              targetId: id,
            });
            await saveDraft(key, { ...draft, workId: id, pausedAt, lastReminderAt: new Date().toISOString() });
          }
        }
        if (!cancelled && JSON.stringify(nextNotifications) !== JSON.stringify(initialNotifications)) {
          setNotifications(nextNotifications);
        }
      } catch (err) {
        console.error('Failed to check paused quiz reminders', err);
      }
    };
    void checkPausedQuizzes();
    const interval = window.setInterval(() => void checkPausedQuizzes(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
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

  const openAccountDeletionPage = () => {
    window.location.assign(`${import.meta.env.BASE_URL}account-deletion.html`);
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

  const username = displayName || user?.displayName || user?.email?.split('@')[0] || 'Student';

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
  if (onboardingStep !== 'complete' && !deletionAuthRequested) {
    return (
      <WelcomeGate
        step={onboardingStep}
        ageBand={ageBand}
        onAcceptPrivacy={() => {
          saveLocal('kojlux_privacy_accepted', true);
          setOnboardingStep('age');
        }}
        onAgeBandChange={setAgeBand}
        onBack={() => setOnboardingStep((step) => step === 'age' ? 'privacy' : step === 'access' ? 'age' : 'access')}
        onNext={() => {
          if (onboardingStep === 'age') {
            if (!ageBand) return;
            completeAgeBand(ageBand);
            setOnboardingStep('access');
          } else if (onboardingStep === 'access' && user) {
            setOnboardingStep('news');
          } else if (onboardingStep === 'news') {
            saveLocal('kojlux_onboarding_complete', true);
            setOnboardingStep('complete');
          }
        }}
        onSkip={() => {
          if (ageBand) completeAgeBand(ageBand);
          setGuestMode(true);
          setOnboardingStep('news');
        }}
        onSignIn={() => {
          if (ageBand) completeAgeBand(ageBand);
          setShowAuthScreen(true);
        }}
        isSignedIn={!!user}
      />
    );
  }
  if (!user && !guestMode) {
    return (
      <WelcomeGate
        step="access"
        ageBand={ageBand}
        onAcceptPrivacy={() => undefined}
        onAgeBandChange={setAgeBand}
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => {
          if (ageBand) completeAgeBand(ageBand);
          setGuestMode(true);
        }}
        onSignIn={() => {
          if (ageBand) completeAgeBand(ageBand);
          setShowAuthScreen(true);
        }}
        isSignedIn={!!user}
      />
    );
  }
  if (!ageBand) {
    return <AgeBandGate onComplete={completeAgeBand} />;
  }

  const isUnder13 = ageBand === 'under13';
  const appNotices = (
    <>
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
                <button onClick={enableNotifications} className="text-[11px] font-bold text-focus-primary">
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
    </>
  );

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
    <>
      {!focusSession && (
        <BottomNav
          active={activeTab}
          collapsed={sidebarCollapse.collapsed}
          onToggleCollapse={sidebarCollapse.toggle}
          blockedTabs={isUnder13 ? ['community'] : []}
          overlayOpen={showNotifications}
          onChange={(tab) => {
            setShowNotifications(false);
            setActiveTab(tab);
          }}
        />
      )}

      {/* Notifications open from the bell icon as a page beside the side nav, so the nav
          and its divider line stay on screen. Picking any tab closes it. */}
      {!focusSession && showNotifications ? (
        <NotificationCenter
          notifications={notifications}
          onDeletePausedQuiz={(item) => {
            if (!scopeId) return;
            let nextNotifications = clearNotification(scopeId, item.id);
            if (item.targetId) {
              void clearDraft(`quiz_paused_${scopeId}_${item.targetId}`);
              deleteCloudItem('quizResumeReminders', item.targetId);
              void loadDraft<{ workId?: string }>(`quiz_builder_${scopeId}`).then((activeDraft) => {
                if (activeDraft?.workId === item.targetId) void clearDraft(`quiz_builder_${scopeId}`);
              });
              nextNotifications = clearNotificationsByTag(scopeId, `quiz-resume:${item.targetId}`);
            }
            setNotifications(nextNotifications);
          }}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={() => {
            if (scopeId) {
              notifications.forEach((item) => void dismissBrowserNotification(item));
              setNotifications(markAllNotificationsRead(scopeId));
            }
          }}
          onSelect={(item) => {
            void dismissBrowserNotification(item);
            if (scopeId) setNotifications(markNotificationRead(scopeId, item.id));
            setShowNotifications(false);
            if (item.type === 'quiz_resume' && item.targetId) {
              setResumeQuizId(item.targetId);
              setFocusSession('quiz');
              setActiveTab('quiz');
              return;
            }
            if (item.type === 'exam_reminder' && item.targetId) {
              setNotificationExamId(item.targetId);
            }
            if (item.targetTab === 'community' && isUnder13) {
              setActiveTab('home');
            } else if (item.targetTab) {
              setActiveTab(item.targetTab as NavTab);
            }
          }}
        />
      ) : activeTab === 'home' ? (
        <StudyHome
          username={username}
          streak={streak}
          sidebarCollapse={sidebarCollapse}
          activityDays={activityDays}
          history={history}
          dueCards={recallCards.filter(isDue)}
          collections={collections}
          recallCards={recallCards}
          blockedNavItems={isUnder13 ? ['community'] : []}
          notificationCount={notifications.filter((notification) => !notification.read).length}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenCollection={(collection) => {
            setReviewCollectionRequest(collection.id);
            setActiveTab('review');
          }}
          onNavigate={(tab) => setActiveTab(tab === 'summarizer' ? 'quiz' : tab as NavTab)}
        >
          {appNotices}
        </StudyHome>
      ) : (
        <div className={`${focusSession ? 'fixed inset-0 z-[100] min-h-[100svh] overflow-y-auto bg-focus-bg text-slate-900 dark:text-slate-100' : `min-h-screen bg-focus-bg dark:bg-[#0B0F19] md:pl-20 ${sidebarCollapse.collapsed ? 'lg:pl-20' : 'lg:pl-60'}`}`}>
          <div className={`${focusSession ? 'w-full min-h-[100svh]' : 'w-full max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto min-h-screen flex flex-col'}`}>
            {/* The Dashboard (profile) screen draws its own title, so the shared
                top bar is skipped there to avoid showing "Dashboard" twice. */}
            {!focusSession && activeTab !== 'profile' && (
              <header className="sticky top-0 z-30 bg-focus-bg/90 dark:bg-slate-950/90 backdrop-blur-md px-5 pt-6 pb-3 flex items-center justify-between gap-3">
                <h1 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {SCREEN_TITLES[activeTab]}
                </h1>
              </header>
            )}
            {!focusSession && appNotices}
            <main className={focusSession ? 'min-h-[100svh]' : `flex-1 px-5 pb-28 md:pb-10 ${activeTab === 'profile' ? 'pt-6' : ''}`}>

          {activeTab === 'quiz' && (
            <QuizBuilderOrSummarizer
              gradeLevel={gradeLevel}
              scopeId={scopeId ?? 'guest'}
              history={history}
              resumeQuizId={resumeQuizId}
              focusMode={focusSession}
              onResumeConsumed={() => setResumeQuizId(null)}
              onFocusModeChange={setFocusSession}
              onPauseQuiz={(id, title) => {
                if (scopeId) {
                  setNotifications(addNotification(scopeId, {
                    type: 'quiz_resume',
                    title: `Paused: ${title}`,
                    body: 'Your answers are saved. Tap to continue where you left off.',
                    targetTab: 'quiz',
                    targetId: id,
                    dedupeTag: `quiz-resume:${id}`,
                  }));
                  if (user) {
                    upsertCloudItem('quizResumeReminders', id, {
                      workId: id,
                      title,
                      nextReminderAt: Date.now() + 24 * 60 * 60 * 1000,
                    });
                  }
                }
                setFocusSession(null);
                setActiveTab('home');
              }}
              onSubmitQuiz={(id) => {
                if (scopeId) {
                  setNotifications(clearNotificationsByTag(scopeId, `quiz-resume:${id}`));
                  void clearDraft(`quiz_paused_${scopeId}_${id}`);
                  deleteCloudItem('quizResumeReminders', id);
                }
                setFocusSession(null);
              }}
              sourceSummary={quizSourceSummary}
              onSourceConsumed={() => setQuizSourceSummary(null)}
              onCreateQuizFromSummary={(summary) => {
                setQuizSourceSummary(summary);
                setFocusSession(null);
                setActiveTab('quiz');
              }}
              onSaveHistory={addHistory}
              onAddRecallCards={addRecallCards}
              onError={setErrorMsg}
            />
          )}

          {activeTab === 'community' && !isUnder13 && (
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
              initialCollectionId={reviewCollectionRequest}
              onCollectionRequestHandled={() => setReviewCollectionRequest(null)}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen
              email={user?.email || ''}
              username={username}
              ageBand={ageBand}
              onDisplayNameChange={handleDisplayNameChange}
              onAgeBandChange={completeAgeBand}
              gradeLevel={gradeLevel}
              onGradeLevelChange={handleGradeLevelChange}
              streak={streak}
              activityDays={activityDays}
              totalReviews={totalReviews}
              isGuest={!user}
              onSignOut={handleSignOut}
              onSignIn={() => setShowAuthScreen(true)}
              onDeleteAccount={openAccountDeletionPage}
              exams={examEvents}
              history={history}
              onAddExam={addExam}
              onUpdateExam={updateExam}
              onDeleteExam={deleteExam}
              notifPermission={notifPermission}
              onEnableNotifications={enableNotifications}
              pushRegistrationStatus={pushRegistrationStatus}
              initialExamId={notificationExamId}
              onNotificationTargetHandled={handleNotificationTargetHandled}
            />
          )}
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
    </>
    </SharedLinkGate>
  );
}

// The Quiz tab hosts both the Quiz Builder and, via an in-screen toggle,
// NoteCraft — the two started as separate nav destinations in the old
// five-tab layout, but user testing on educational apps consistently shows
// two closely related "create study material" flows are easier to find
// bundled with a sub-toggle than as separate top-level destinations that
// compete with Review for thumb reach.
function QuizBuilderOrSummarizer(props: {
  gradeLevel: string;
  scopeId: string;
  history: HistoryItem[];
  sourceSummary: SummaryData | null;
  resumeQuizId: string | null;
  focusMode: 'quiz' | 'notecraft' | null;
  onResumeConsumed: () => void;
  onFocusModeChange: (mode: 'quiz' | 'notecraft' | null) => void;
  onPauseQuiz: (id: string, title: string) => void;
  onSubmitQuiz: (id: string) => void;
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
        {props.focusMode === null && (['quiz', 'notecraft'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium uppercase tracking-wide transition ${
              subTab === t
                ? 'bg-focus-primary text-white'
                : 'bg-transparent text-gray-500 dark:bg-[#161D30] dark:text-slate-400 dark:border dark:border-slate-800/40'
            }`}
          >
            {t === 'quiz' ? 'Quiz Builder' : 'NoteCraft'}
          </button>
        ))}
      </div>
      {subTab === 'quiz' ? (
        <QuizBuilder
          gradeLevel={props.gradeLevel}
          scopeId={props.scopeId}
          resumeDraftId={props.resumeQuizId}
          onResumeConsumed={props.onResumeConsumed}
          onFocusModeChange={(focused) => props.onFocusModeChange(focused ? 'quiz' : null)}
          onPauseQuiz={props.onPauseQuiz}
          onSubmitQuiz={props.onSubmitQuiz}
          summarySource={props.sourceSummary ? formatSummaryForQuiz(props.sourceSummary) : null}
          onSummarySourceConsumed={props.onSourceConsumed}
          onSaveHistory={props.onSaveHistory}
          onAddRecallCards={props.onAddRecallCards}
          onError={props.onError}
        />
      ) : (
        <NoteCraft
          gradeLevel={props.gradeLevel}
          scopeId={props.scopeId}
          isFocusMode={props.focusMode === 'notecraft'}
          onFocusModeChange={(focused) => props.onFocusModeChange(focused ? 'notecraft' : null)}
          onSaveHistory={props.onSaveHistory}
          onAddRecallCards={props.onAddRecallCards}
          onError={props.onError}
          onCreateQuizFromSummary={props.onCreateQuizFromSummary}
        />
      )}
    </div>
  );
}

type OnboardingStep = 'privacy' | 'age' | 'access' | 'news' | 'complete';

function WelcomeGate({
  step,
  ageBand,
  isSignedIn,
  onAcceptPrivacy,
  onAgeBandChange,
  onBack,
  onNext,
  onSkip,
  onSignIn,
}: {
  step: OnboardingStep;
  ageBand: AgeBand | null;
  isSignedIn: boolean;
  onAcceptPrivacy: () => void;
  onAgeBandChange: (ageBand: AgeBand) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onSignIn: () => void;
}) {
  const [privacyAccepted, setPrivacyAccepted] = useState(() => {
    try {
      return localStorage.getItem('kojlux_privacy_accepted') === 'true';
    } catch {
      return false;
    }
  });
  const [privacyDeclined, setPrivacyDeclined] = useState(false);
  const stepIndex = ({ privacy: 1, age: 2, access: 3, news: 4, complete: 4 } as const)[step];
  const stepTitle = {
    privacy: 'Your privacy comes first',
    age: 'Choose your age group',
    access: 'Choose how to continue',
    news: 'A few things to know',
    complete: 'Welcome',
  }[step];

  const acceptPrivacy = () => {
    setPrivacyAccepted(true);
    setPrivacyDeclined(false);
    onAcceptPrivacy();
  };

  return (
    <div className="min-h-[100svh] bg-focus-bg dark:bg-slate-950 flex items-center justify-center p-5">
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

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-focus-primary">Step {stepIndex} of 4</span>
          {step !== 'privacy' && step !== 'news' && (
            <button onClick={onBack} className="text-xs font-bold text-slate-400 hover:text-focus-primary">
              Back
            </button>
          )}
        </div>
        <div className="h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-focus-primary transition-all" style={{ width: `${stepIndex * 25}%` }} />
        </div>

        <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-900 dark:text-white">{stepTitle}</h2>

          {step === 'privacy' && (
            <div className="mt-3 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Review how Kojlux handles your information before continuing.
              </p>
              <a
                href={`${import.meta.env.BASE_URL}privacy.html`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-xs font-bold text-focus-primary"
              >
                Read the Privacy Policy
              </a>
              <button
                type="button"
                onClick={acceptPrivacy}
                className={`w-full py-3 rounded-xl text-sm font-bold transition ${
                  privacyAccepted ? 'bg-emerald-600 text-white' : 'bg-focus-primary text-white hover:bg-focus-primary-dark'
                }`}
              >
                {privacyAccepted ? 'Policy accepted' : 'I accept the Privacy Policy'}
              </button>
              {privacyDeclined && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  You need to accept the Privacy Policy before continuing.
                </p>
              )}
              <button
                onClick={() => privacyAccepted ? onNext() : setPrivacyDeclined(true)}
                className="w-full py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold"
              >
                Next
              </button>
            </div>
          )}

          {step === 'age' && (
            <div className="mt-3 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                This helps us apply stronger protections for younger students.
              </p>
              <select
                value={ageBand ?? ''}
                onChange={(event) => onAgeBandChange(event.target.value as AgeBand)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-200"
              >
                <option value="" disabled>Select an age group</option>
                <option value="under13">Under 13</option>
                <option value="13to17">13–17</option>
                <option value="18plus">18 or older</option>
              </select>
              {ageBand === 'under13' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Materials and external links are disabled for extra protection.</p>
              )}
              <button
                onClick={onNext}
                disabled={!ageBand}
                className="w-full py-3 rounded-xl bg-focus-primary text-white text-sm font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {step === 'access' && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isSignedIn ? 'You are signed in and ready to continue.' : 'Sign in or create an account to sync your work, or continue as a guest.'}
              </p>
              {isSignedIn ? (
                <button onClick={onNext} className="w-full py-3.5 rounded-xl bg-focus-primary text-white text-sm font-bold">
                  Continue
                </button>
              ) : (
                <>
                  <button onClick={onSignIn} className="w-full py-3.5 rounded-xl bg-focus-primary text-white text-sm font-bold">
                    Sign In / Register
                  </button>
                  <button
                    onClick={onSkip}
                    className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold"
                  >
                    Skip for now
                  </button>
                </>
              )}
            </div>
          )}

          {step === 'news' && (
            <div className="mt-4 space-y-3">
              <NewsItem icon={Camera} title="Camera access" text="The camera is requested only when you choose to take a photo. Uploading or typing are alternatives." />
              <NewsItem icon={UserRound} title="Guest access" text="Guests can use the app, but their work stays on this device and can be lost if browser data is cleared." />
              <NewsItem icon={Mail} title="Report a problem" text="Contact the Kojlux Study Hub team at officialkojux@gmail.com." />
              <NewsItem icon={Palette} title="Choose a theme" text="Personalize the app from Themes in Settings." />
              <button onClick={onNext} className="mt-2 w-full py-3.5 rounded-xl bg-focus-primary text-white text-sm font-bold">
                Start studying
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NewsItem({ icon: Icon, title, text }: { icon: typeof Camera; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3">
      <Icon className="w-4 h-4 text-focus-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function AgeBandGate({ onComplete }: { onComplete: (ageBand: AgeBand) => void }) {
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  return (
    <div className="min-h-screen bg-focus-bg dark:bg-slate-950 flex items-center justify-center p-5">
      <div className="max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <h1 className="text-base font-black text-slate-900 dark:text-white">Choose your age group</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">This helps us apply stronger protections for younger students.</p>
        </div>
        <select value={ageBand ?? ''} onChange={(event) => setAgeBand(event.target.value as AgeBand)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200">
          <option value="" disabled>Select an age group</option>
          <option value="under13">Under 13</option>
          <option value="13to17">13–17</option>
          <option value="18plus">18 or older</option>
        </select>
        <button type="button" disabled={!ageBand} onClick={() => ageBand && onComplete(ageBand)} className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold disabled:opacity-40">Continue</button>
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