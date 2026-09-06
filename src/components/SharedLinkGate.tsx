import React, { useEffect, useState } from 'react';
import { X, FolderPlus, LogIn, Compass, Folder } from 'lucide-react';
import { fetchSharedCard, fetchSharedCollection } from '../lib/sharedCards';
import { setPendingImport, clearPendingImport } from '../lib/pendingImport';
import { cardFromSharedSnapshot } from '../lib/sharedImport';
import { makeCollection } from '../lib/collections';
import { RecallCard, Collection, SharedCardSnapshot, SharedCollectionSnapshot } from '../types';
import Modal from './Modal';

interface Props {
  cardId?: string | null;
  collectionId?: string | null;
  isLoggedIn: boolean;
  collections: Collection[];
  onImportCard: (cards: RecallCard[]) => void;
  onImportCollection: (collection: Collection | null, cards: RecallCard[]) => void;
  onDismiss: () => void;
  onRequestAuth: () => void;
  children: React.ReactNode;
}

export default function SharedLinkGate({
  cardId,
  collectionId,
  isLoggedIn,
  collections,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setCollection(null);
    setNotFound(false);
    setPickerOpen(false);
    setSelectedCollectionId('');
    setNewCollectionName('');

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

  const closePicker = () => {
    setPickerOpen(false);
    setSelectedCollectionId('');
    setNewCollectionName('');
  };

  const importNow = (destinationId?: string) => {
    if (card) {
      onImportCard([cardFromSharedSnapshot(card, destinationId)]);
    }
    if (collection) {
      const cards = collection.cards.map((c) => cardFromSharedSnapshot(c, destinationId));
      onImportCard(cards);
    }
    closePicker();
    onDismiss();
  };

  const createAndImport = () => {
    if (!newCollectionName.trim()) return;
    const created = makeCollection(newCollectionName);
    if (card) {
      onImportCollection(created, [cardFromSharedSnapshot(card, created.id)]);
    }
    if (collection) {
      const cards = collection.cards.map((c) => cardFromSharedSnapshot(c, created.id));
      onImportCollection(created, cards);
    }
    closePicker();
    onDismiss();
  };

  const requestSignupThenImport = () => {
    const targetCollectionId = selectedCollectionId || undefined;
    const nextCollectionName = newCollectionName.trim() || undefined;
    setPendingImport(
      cardId
        ? { type: 'card', id: cardId, targetCollectionId, newCollectionName: nextCollectionName }
        : { type: 'collection', id: collectionId!, targetCollectionId, newCollectionName: nextCollectionName }
    );
    closePicker();
    onRequestAuth();
  };

  const explore = () => {
    clearPendingImport();
    onDismiss();
  };

  const title = card?.sourceTitle || collection?.name || 'Shared card';
  const preview = card?.prompt || (collection ? `${collection.cards.length} card${collection.cards.length === 1 ? '' : 's'}` : '');

  const renderPicker = (continueLabel: string, continueAction: () => void) => (
    <Modal onClose={closePicker} title={card ? 'Save shared flashcard' : 'Save shared collection'}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setSelectedCollectionId('');
            setNewCollectionName('');
            continueAction();
          }}
          className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          Save without a collection
        </button>
        {collections.length > 0 && (
          <select
            value={selectedCollectionId}
            onChange={(event) => {
              setSelectedCollectionId(event.target.value);
              setNewCollectionName('');
            }}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
          >
            <option value="">Choose an existing collection…</option>
            {collections.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        )}
        <input
          value={newCollectionName}
          onChange={(event) => {
            setNewCollectionName(event.target.value);
            if (event.target.value) setSelectedCollectionId('');
          }}
          placeholder="Or create a new collection…"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
        <button
          type="button"
          onClick={continueAction}
          className="w-full py-3 bg-focus-primary text-white rounded-2xl text-sm font-bold"
        >
          {continueLabel}
        </button>
      </div>
    </Modal>
  );

  if (isLoggedIn) {
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
                      onClick={() => setPickerOpen(true)}
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
        {pickerOpen && renderPicker('Add to collection', () => {
          if (newCollectionName.trim()) {
            createAndImport();
            return;
          }
          importNow(selectedCollectionId || undefined);
        })}
      </>
    );
  }

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
                  onClick={() => setPickerOpen(true)}
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
      {pickerOpen && renderPicker('Continue to sign in', () => {
        if (newCollectionName.trim()) {
          requestSignupThenImport();
          return;
        }
        requestSignupThenImport();
      })}
    </div>
  );
}
