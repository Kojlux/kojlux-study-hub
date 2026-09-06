import React, { useEffect, useState } from 'react';
import { X, FolderPlus, LogIn, Compass } from 'lucide-react';
import { fetchSharedCard, fetchSharedCollection } from '../lib/sharedCards';
import { setPendingImport, clearPendingImport } from '../lib/pendingImport';
import { cardFromSharedSnapshot } from '../lib/sharedImport';
import { makeCollection } from '../lib/collections';
import { RecallCard, Collection, SharedCardSnapshot, SharedCollectionSnapshot } from '../types';

interface Props {
  // Non-null when the app was opened via a `/card/:id` or `/collection/:id`
  // share link (see App.tsx + lib/deepLink.ts). Wraps the whole app shell —
  // not just the Review tab — so a link works no matter which tab happens
  // to be active, and so the guest lock screen below can actually blur/
  // disable navigation instead of just replacing one tab's content.
  cardId?: string | null;
  collectionId?: string | null;
  isLoggedIn: boolean;
  onImportCard: (cards: RecallCard[]) => void;
  onImportCollection: (collection: Collection, cards: RecallCard[]) => void;
  // Clears the deep-link state + URL (see consumeDeepLink in App.tsx).
  onDismiss: () => void;
  // Opens the sign-in/register screen (App.tsx's setShowAuthScreen(true)).
  onRequestAuth: () => void;
  children: React.ReactNode;
}

export default function SharedLinkGate({
  cardId,
  collectionId,
  isLoggedIn,
  onImportCard,
  onImportCollection,
  onDismiss,
  onRequestAuth,
  children,
}: Props) {
  const [card, setCard] = useState<SharedCardSnapshot | null>(null);
  const [collection, setCollection] = useState<SharedCollectionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setCollection(null);
    setNotFound(false);
    if (cardId) {
      setLoading(true);
      fetchSharedCard(cardId).then((snap) => {
        if (cancelled) return;
        setLoading(false);
        if (snap) setCard(snap);
        else setNotFound(true);
      });
    } else if (collectionId) {
      setLoading(true);
      fetchSharedCollection(collectionId).then((snap) => {
        if (cancelled) return;
        setLoading(false);
        if (snap) setCollection(snap);
        else setNotFound(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [cardId, collectionId]);

  const active = Boolean(cardId || collectionId);
  if (!active) return <>{children}</>;

  // Flow A (logged in): clone the shared card/collection straight into this
  // account. A fresh RecallCard/Collection id is generated for every clone
  // (see cardFromSharedSnapshot), so this is always a copy in the
  // importer's own uid-scoped data — never a reference to the sender's.
  const importNow = () => {
    if (card) {
      onImportCard([cardFromSharedSnapshot(card)]);
    }
    if (collection) {
      const newCollection = makeCollection(collection.name);
      const cards = collection.cards.map((c) => cardFromSharedSnapshot(c, newCollection.id));
      onImportCollection(newCollection, cards);
    }
    onDismiss();
  };

  // Flow B (guest): remember what they wanted, then send them to sign up —
  // App.tsx's post-login effect resumes this import automatically once
  // `user` is set. Deliberately does NOT call onDismiss() here: the deep
  // link (and this gate) needs to stay alive across the AuthScreen detour,
  // since pendingImport alone doesn't carry the fetched snapshot data.
  const requestSignupThenImport = () => {
    setPendingImport(cardId ? { type: 'card', id: cardId } : { type: 'collection', id: collectionId! });
    onRequestAuth();
  };

  // Guest explicitly declines — drop any queued import and exit to the
  // normal (already-guest-mode) app.
  const explore = () => {
    clearPendingImport();
    onDismiss();
  };

  const title = card?.sourceTitle || collection?.name || 'Shared card';
  const preview = card?.prompt || (collection ? `${collection.cards.length} card${collection.cards.length === 1 ? '' : 's'}` : '');

  if (isLoggedIn) {
    // ---- Flow A: seamless import banner — the app underneath stays fully
    // interactive, nothing is blurred or locked. ----
    return (
      <>
        {children}
        {(loading || card || collection || notFound) && (
          <div className="fixed top-4 inset-x-4 z-[250] max-w-md mx-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xl p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {loading && <p className="text-xs text-slate-400">Loading shared card…</p>}
                {notFound && <p className="text-xs text-slate-500">This share link is no longer available.</p>}
                {(card || collection) && (
                  <>
                    <p className="text-[10px] font-bold text-focus-primary uppercase tracking-wide mb-0.5">Shared with you</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{preview}</p>
                    <button
                      onClick={importNow}
                      className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white bg-focus-primary px-3 py-2 rounded-xl"
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> Add to My Collection
                    </button>
                  </>
                )}
              </div>
              <button onClick={onDismiss} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ---- Flow B: restricted review mode — the rest of the app is visually
  // and functionally locked behind this screen until the guest either signs
  // up or explicitly exits. ----
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none select-none blur-sm brightness-90 transition" aria-hidden="true">
        {children}
      </div>
      <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-5">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-4">
          {loading && <p className="text-xs text-slate-400 text-center">Loading shared card…</p>}
          {notFound && <p className="text-xs text-slate-500 text-center">This share link is no longer available.</p>}
          {(card || collection) && (
            <>
              <p className="text-[10px] font-bold text-focus-primary uppercase tracking-wide">Shared with you</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{preview}</p>
              <div className="space-y-2 pt-2">
                <button
                  onClick={requestSignupThenImport}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-focus-primary text-white rounded-2xl text-sm font-bold"
                >
                  <LogIn className="w-4 h-4" /> Save to Collection
                </button>
                <button
                  onClick={explore}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-sm font-bold"
                >
                  <Compass className="w-4 h-4" /> Explore App
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
