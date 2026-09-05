// lib/draftStore.ts
//
// Session-draft persistence for in-progress generative work (quizzes, notes,
// visualizations, AI Coach batches). This is DELIBERATELY separate from the
// Firestore sync in App.tsx: drafts are single-device, throwaway-once-saved
// state, so there's no need to round-trip them through the network or
// security rules. They just need to survive a refresh.
//
// Uses IndexedDB (via idb-keyval) instead of localStorage because these
// screens can hold base64 image/PDF/video data URLs that easily exceed
// localStorage's ~5-10MB per-origin quota and throw QuotaExceededError.
// IndexedDB's quota is much larger (typically hundreds of MB to low GB,
// browser-dependent) and writes don't block the main thread.
//
// Install once: npm install idb-keyval

import { get, set, del } from 'idb-keyval';

const PREFIX = 'kojlux_draft_';

export async function loadDraft<T>(key: string): Promise<T | undefined> {
  try {
    return (await get(PREFIX + key)) as T | undefined;
  } catch (err) {
    console.error(`Failed to load draft "${key}"`, err);
    return undefined;
  }
}

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  try {
    await set(PREFIX + key, value);
  } catch (err) {
    // Fails "loud but safe": the in-memory session keeps working, it just
    // won't survive a refresh this one time. Never let a draft-save failure
    // interrupt the user's actual task.
    console.error(`Failed to save draft "${key}"`, err);
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await del(PREFIX + key);
  } catch (err) {
    console.error(`Failed to clear draft "${key}"`, err);
  }
}
