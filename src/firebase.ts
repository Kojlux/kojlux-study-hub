import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Same project as before — Kojlux Study Hub. Storage is used by the
// Materials page (lib/communityLinks.ts), which lets a
// student upload a file directly (image/video/PDF/doc) instead of only
// linking out to one, capped at 15MB and auto-deleted after ~75 days to
// keep usage inside Firebase's free Storage tier. Note that as of Feb 2026
// Firebase requires the project to be on the pay-as-you-go Blaze plan to
// use Storage at all (a card on file), even though usage inside the free
// tier still costs $0 — see https://firebase.google.com/pricing.
// Auth + Firestore remain, used to sync each student's grade level, study
// streak, and spaced-repetition Review queue across devices.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

const appIdPrefix = `1:${firebaseConfig.messagingSenderId}:web:`;
if (!/^1:\d+:web:[A-Za-z0-9_-]+$/.test(firebaseConfig.appId) || !firebaseConfig.appId.startsWith(appIdPrefix)) {
  throw new Error(
    '[firebase] VITE_FIREBASE_APP_ID must be the Web App ID from Firebase Project settings ' +
    'and match VITE_FIREBASE_MESSAGING_SENDER_ID.'
  );
}

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
export const storage = getStorage(app);