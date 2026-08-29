import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Same project as before — Kojlux Study Hub. Video upload/post helpers
// (uploadBase64File, createVideoPost) have been removed: the "Trending
// Classroom Reels" feed is gone, so nothing in the app needs them anymore.
// Auth + Firestore remain, now used to sync each student's grade level,
// study streak, and spaced-repetition Review queue across devices.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// ExamEvent, RecallCard, and HistoryItem all have optional fields (subject,
// notes, linkedHistoryId, image, collectionId, sourcePrompt, etc.) that get
// left as `undefined` in JS whenever the student doesn't fill them in.
// Firestore's default setDoc() rejects any field set to `undefined` outright
// ("Unsupported field value: undefined") — ignoreUndefinedProperties tells
// it to just skip those fields instead of throwing, which is what we want:
// an exam with no notes should save fine, not fail to save at all.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });