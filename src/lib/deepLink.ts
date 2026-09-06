// ---------------------------------------------------------------------------
// Deep-linking helpers for sharing a single flashcard.
//
// GitHub Pages serves this app from /kojlux-study-hub/ and does not rewrite
// arbitrary /card/:id requests to index.html. Share links therefore use the
// hash portion of a base-aware URL: the server serves the app normally, and
// the browser keeps the card or collection id for App.tsx to read.
//
// This file is intentionally free of any Firebase import — it only ever
// builds/parses strings. The actual publish/fetch of a card's shareable
// content lives in lib/sharedCards.ts.
// ---------------------------------------------------------------------------

export const CARD_ROUTE_PREFIX = '/card/';
export const COLLECTION_ROUTE_PREFIX = '/collection/';

function appBaseUrl(): string {
  return import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
}

function buildHashShareUrl(prefix: string, id: string): string {
  return `${window.location.origin}${appBaseUrl()}#${prefix}${encodeURIComponent(id)}`;
}

export function buildCardShareUrl(cardId: string): string {
  return buildHashShareUrl(CARD_ROUTE_PREFIX, cardId);
}

export function buildCollectionShareUrl(collectionId: string): string {
  return buildHashShareUrl(COLLECTION_ROUTE_PREFIX, collectionId);
}

// Custom scheme reserved for an optional future "Open in App" banner, once
// (if) this is wrapped as a native app via Capacitor/Expo. Inert on plain
// web — nothing currently constructs a banner around this — but keeping the
// builder here means both the web URL and the native scheme are derived
// from the same card id in one place.
export function buildCardAppScheme(cardId: string): string {
  return `kojlux://card/${encodeURIComponent(cardId)}`;
}

function parseRouteId(route: string, prefix: string): string | null {
  if (!route.startsWith(prefix)) return null;
  const raw = route.slice(prefix.length).split('/')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function currentDeepLinkRoute(): string {
  const hashRoute = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  return hashRoute || window.location.pathname;
}

export function parseDeepLinkCardId(route: string = currentDeepLinkRoute()): string | null {
  return parseRouteId(route, CARD_ROUTE_PREFIX);
}

export function parseDeepLinkCollectionId(route: string = currentDeepLinkRoute()): string | null {
  return parseRouteId(route, COLLECTION_ROUTE_PREFIX);
}

// Clears the shared-link route back to the app base without a page reload, once the
// student has viewed (and optionally saved) the shared card — otherwise a
// refresh later would keep reopening the same shared-card viewer forever.
export function clearDeepLinkUrl(): void {
  window.history.replaceState(null, '', `${window.location.origin}${appBaseUrl()}`);
}
