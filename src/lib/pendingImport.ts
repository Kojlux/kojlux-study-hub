// ---------------------------------------------------------------------------
// Bridges a guest tapping "Save to Collection" on a shared-link lock screen
// (see components/SharedLinkGate.tsx) to the actual import, which can only
// happen once they finish signing in or registering.
//
// Deliberately stored under a plain, UNSCOPED localStorage key rather than
// scopedKey() from lib/storage.ts — at the moment this is written there is
// no scopeId yet, since the whole point is that the visitor doesn't have an
// account (or active guest session) tied to it. It's read back once, right
// after App.tsx sees `user` go from null to set, and cleared immediately
// after — see the effect in App.tsx.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kojlux_pending_import';

export type PendingImport = { type: 'card'; id: string } | { type: 'collection'; id: string };

export function setPendingImport(pending: PendingImport): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Best-effort — if storage is unavailable, the student just re-taps
    // "Save to Collection" after signing in instead of it resuming
    // automatically.
  }
}

export function getPendingImport(): PendingImport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingImport) : null;
  } catch {
    return null;
  }
}

export function clearPendingImport(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
