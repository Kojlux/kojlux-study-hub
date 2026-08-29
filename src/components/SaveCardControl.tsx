import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Folder } from 'lucide-react';
import { RecallCard, Collection } from '../types';
import { makeCollection } from '../lib/collections';
import Modal from './Modal';
import { useToast } from './Toast';

interface Props {
  card: RecallCard;
  collections: Collection[];
  onUpdateCard: (card: RecallCard) => void;
  onAddCollection: (collection: Collection) => void;
}

// Bookmark control shown on the back of a review card. Unsaved (AI-generated)
// cards show an outline bookmark + "Save"; already-saved cards show a filled
// bookmark + "Saved". Either state opens the same modal: pick an existing
// collection, type a new one, save with no collection, or (if already saved)
// remove it. This used to be an anchored dropdown, which is what let it get
// clipped by the flip card's transform/overflow-hidden — see Modal.tsx for
// why a portal-based modal fixes that for good.
export default function SaveCardControl({ card, collections, onUpdateCard, onAddCollection }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { showToast } = useToast();

  const close = () => {
    setOpen(false);
    setNewName('');
  };

  const saveTo = (collectionId?: string, collectionName?: string) => {
    onUpdateCard({ ...card, saved: true, collectionId });
    showToast(collectionName ? `Saved to ${collectionName}` : 'Saved');
    close();
  };

  const createAndSave = () => {
    if (!newName.trim()) return;
    const created = makeCollection(newName);
    onAddCollection(created);
    saveTo(created.id, created.name);
  };

  const unsave = () => {
    onUpdateCard({ ...card, saved: false, collectionId: undefined });
    showToast('Removed from saved');
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={card.saved ? 'Manage where this card is saved' : 'Save this card to study later'}
        className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition ${
          card.saved
            ? 'text-focus-primary bg-focus-primary/10'
            : 'text-slate-400 hover:text-focus-primary hover:bg-focus-primary/10'
        }`}
      >
        {card.saved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
        {card.saved ? 'Saved' : 'Save'}
      </button>

      {open && (
        <Modal onClose={close} title="Save flashcard">
          <div className="space-y-2.5">
            {card.saved && (
              <button
                type="button"
                onClick={unsave}
                className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              >
                Remove from saved
              </button>
            )}
            <button
              type="button"
              onClick={() => saveTo(undefined)}
              className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              Save without a collection
            </button>
            {collections.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => saveTo(c.id, c.name)}
                    className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    <Folder className="w-3.5 h-3.5 text-focus-primary shrink-0" /> {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createAndSave();
                }}
                placeholder="New collection…"
                className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
              />
              <button
                type="button"
                onClick={createAndSave}
                disabled={!newName.trim()}
                title="Create this collection and save the card into it"
                className="shrink-0 px-3 py-2 rounded-xl bg-focus-primary text-white text-xs font-bold disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
