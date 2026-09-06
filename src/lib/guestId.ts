// Per-browser stable guest identity.
//
// This is a UI-level courtesy fix, not a security boundary: it stops
// guests from stepping on each other's posts (overwrite/delete) in normal
// use, but a motivated user can clear localStorage, open a private tab, or
// forge a `submittedBy`/`requesterId` value in a raw fetch/devtools call
// straight to Firestore. Firestore security rules cannot verify *this*
// value at all, because it never touches Firebase Auth — there's no
// `request.auth` behind it. Real, server-verified guest identity requires
// Firebase Anonymous Auth (`signInAnonymously`), which hands back a
// genuine `request.auth.uid` the rules engine can check. See the note at
// the bottom of firestore.rules for exactly what changes once that lands.

const GUEST_ID_STORAGE_KEY = 'kojlux_guest_id';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers without crypto.randomUUID.
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Returns the same id for this browser across reloads and tabs (localStorage
// is per-origin, not per-tab). Generates and persists one on first call.
//
// Falls back to a fresh, non-persisted id if localStorage is unavailable
// (private browsing in some browsers, storage disabled by policy, etc.) —
// that guest just won't be recognized as the same guest on their next visit,
// which is a strict improvement over the old shared 'guest' bucket, not a
// regression.
export function getStableGuestId(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing) return existing;
    const fresh = `guest_${generateId()}`;
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return `guest_${generateId()}`;
  }
}
