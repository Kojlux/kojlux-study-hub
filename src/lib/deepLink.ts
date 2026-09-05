// ---------------------------------------------------------------------------
// Deep-linking helpers for sharing a single flashcard.
//
// Architecture: plain path-based URLs (`/card/:id`), not a `#hash` fragment.
// Hash fragments never reach the server and are invisible to OS-level
// Universal Links (iOS) / App Links (Android) — so if this app is ever
// wrapped natively (Capacitor, Expo, etc.), a real path is what those
// features match against. Firebase Hosting needs one rewrite rule for a
// shared link to survive a hard refresh landing directly on /card/:id:
//
//   { "hosting": { "rewrites": [{ "source": "/card/**", "destination": "/index.html" }] } }
//
// No router library is added for a single route — App.tsx reads
// window.location.pathname once on mount (parseDeepLinkCardId) and passes
// the id down; ReviewQueue/SharedCardViewer render that one card
// independently of the signed-in user's own due-card queue.
//
// This file is intentionally free of any Firebase import — it only ever
// builds/parses strings. The actual publish/fetch of a card's shareable
// content lives in lib/sharedCards.ts.
// ---------------------------------------------------------------------------

export const CARD_ROUTE_PREFIX = '/card/';
export const COLLECTION_ROUTE_PREFIX = '/collection/';

export function buildCardShareUrl(cardId: string): string {
  return `${window.location.origin}${CARD_ROUTE_PREFIX}${encodeURIComponent(cardId)}`;
}

export function buildCollectionShareUrl(collectionId: string): string {
  return `${window.location.origin}${COLLECTION_ROUTE_PREFIX}${encodeURIComponent(collectionId)}`;
}

// Custom scheme reserved for an optional future "Open in App" banner, once
// (if) this is wrapped as a native app via Capacitor/Expo. Inert on plain
// web — nothing currently constructs a banner around this — but keeping the
// builder here means both the web URL and the native scheme are derived
// from the same card id in one place.
export function buildCardAppScheme(cardId: string): string {
  return `kojlux://card/${encodeURIComponent(cardId)}`;
}

export function parseDeepLinkCardId(pathname: string = window.location.pathname): string | null {
  if (!pathname.startsWith(CARD_ROUTE_PREFIX)) return null;
  const raw = pathname.slice(CARD_ROUTE_PREFIX.length).split('/')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseDeepLinkCollectionId(pathname: string = window.location.pathname): string | null {
  if (!pathname.startsWith(COLLECTION_ROUTE_PREFIX)) return null;
  const raw = pathname.slice(COLLECTION_ROUTE_PREFIX.length).split('/')[0];
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Clears the /card/:id path back to `/` without a page reload, once the
// student has viewed (and optionally saved) the shared card — otherwise a
// refresh later would keep reopening the same shared-card viewer forever.
export function clearDeepLinkUrl(): void {
  window.history.replaceState(null, '', '/');
}
