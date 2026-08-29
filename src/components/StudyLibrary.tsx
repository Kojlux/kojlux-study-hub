import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Sparkles, History, FolderOpen, Play, Pencil, X, Settings2, RotateCw, Maximize2,
} from 'lucide-react';
import { RecallCard, HistoryItem, Collection } from '../types';
import { makeCollection } from '../lib/collections';
import Modal from './Modal';
import ImageLightbox from './ImageLightbox';
import { useToast } from './Toast';

const UNCATEGORIZED = '__uncategorized__';

interface Props {
  cards: RecallCard[];
  history: HistoryItem[];
  collections: Collection[];
  onBulkGenerate: (items: HistoryItem[], count: number) => void;
  onError: (msg: string) => void;
  busy: boolean;
  onUpdateCard: (card: RecallCard) => void;
  onAddCollection: (collection: Collection) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  // Starts a real review session on the main Review page using this set of
  // cards, instead of today's due cards — no scheduling involved.
  onPlayCollection: (cards: RecallCard[], label: string) => void;
}

// Replaces the old pairing of an always-open, endlessly-growing "Recents"
// list and a separate collapsible "Saved Cards" accordion. Both live behind
// one tab switcher now, so a student can jump straight to whichever view
// they actually want instead of scrolling past one to reach the other.
export default function StudyLibrary({
  cards,
  history,
  collections,
  onBulkGenerate,
  onError,
  busy,
  onUpdateCard,
  onAddCollection,
  onRenameCollection,
  onDeleteCollection,
  onPlayCollection,
}: Props) {
  const recents = history.slice(0, 8);
  const savedCards = useMemo(() => cards.filter((c) => c.saved), [cards]);

  const [tab, setTab] = useState<'recents' | 'saved'>(recents.length > 0 ? 'recents' : 'saved');

  if (recents.length === 0 && savedCards.length === 0) return null;

  return (
    <div className="space-y-3.5">
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setTab('recents')}
          title="Recent quizzes, summaries, and visualizations"
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
            tab === 'recents' ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Recents
        </button>
        <button
          type="button"
          onClick={() => setTab('saved')}
          title="Flashcards you've saved to study later"
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
            tab === 'saved' ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" /> Saved {savedCards.length > 0 && `(${savedCards.length})`}
        </button>
      </div>

      {tab === 'recents' ? (
        recents.length > 0 ? (
          <RecentsPanel recents={recents} onBulkGenerate={onBulkGenerate} onError={onError} busy={busy} />
        ) : (
          <EmptyPanel text="Recent quizzes, summaries, and visualizations will show up here." />
        )
      ) : savedCards.length > 0 ? (
        <SavedPanel
          savedCards={savedCards}
          collections={collections}
          onUpdateCard={onUpdateCard}
          onAddCollection={onAddCollection}
          onRenameCollection={onRenameCollection}
          onDeleteCollection={onDeleteCollection}
          onPlayCollection={onPlayCollection}
        />
      ) : (
        <EmptyPanel text="Bookmark a flashcard while reviewing to build your saved library." />
      )}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="text-center py-6 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
      <p className="text-[11px] text-slate-400 leading-relaxed">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recents tab — same long-press-to-multiselect flow as before, just now
// living under its own tab instead of always taking up page space.
// ---------------------------------------------------------------------------
function RecentsPanel({
  recents,
  onBulkGenerate,
  onError,
  busy,
}: {
  recents: HistoryItem[];
  onBulkGenerate: (items: HistoryItem[], count: number) => void;
  onError: (msg: string) => void;
  busy: boolean;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cardCount, setCardCount] = useState<number | ''>(8);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const clearSelection = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPress = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSelectMode(true);
      setSelectedIds((prev) => new Set(prev).add(id));
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
    }, 500);
  };
  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleClick = (id: string) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (selectMode) toggleSelected(id);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {selectMode
            ? `${selectedIds.size} selected`
            : 'Long-press an item to select a few and turn them into flashcards together.'}
        </p>
        {selectMode && (
          <button onClick={clearSelection} className="text-[11px] font-bold text-slate-400 shrink-0">
            Cancel
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {recents.map((item) => {
          const selected = selectedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onPointerDown={() => startPress(item.id)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onClick={() => handleClick(item.id)}
              title={selectMode ? undefined : 'Long-press to select'}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition ${
                selected
                  ? 'bg-focus-primary/10 border-focus-primary'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {selectMode && (
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    selected ? 'bg-focus-primary border-focus-primary' : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {selected && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.title}</span>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{item.type}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cards</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              value={cardCount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setCardCount('');
                  return;
                }
                const parsed = Number(raw);
                if (!Number.isNaN(parsed)) setCardCount(Math.round(parsed));
              }}
              onBlur={() => setCardCount((c) => Math.min(50, Math.max(0, c === '' ? 0 : c)))}
              aria-label="Number of flashcards to generate"
              title="How many flashcards to generate from the selected items"
              className="w-14 py-2.5 text-center text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <button
            disabled={busy}
            onClick={() => {
              const count = cardCount === '' ? 0 : cardCount;
              if (count < 1) {
                onError("Choose at least 1 flashcard — 0 won't generate anything.");
                return;
              }
              const chosen = recents.filter((h) => selectedIds.has(h.id));
              onBulkGenerate(chosen, Math.min(50, count));
              clearSelection();
            }}
            className="flex-1 py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" /> Create flashcards from {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved tab — chip filters instead of a checklist-that-doubles-as-a-rename-
// field, plus real actions (Study / Edit) instead of a static, click-to-flip
// row.
// ---------------------------------------------------------------------------
function SavedPanel({
  savedCards,
  collections,
  onUpdateCard,
  onAddCollection,
  onRenameCollection,
  onDeleteCollection,
  onPlayCollection,
}: {
  savedCards: RecallCard[];
  collections: Collection[];
  onUpdateCard: (card: RecallCard) => void;
  onAddCollection: (collection: Collection) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onPlayCollection: (cards: RecallCard[], label: string) => void;
}) {
  const [filterSet, setFilterSet] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);
  const [studyCard, setStudyCard] = useState<RecallCard | null>(null);
  const [editCard, setEditCard] = useState<RecallCard | null>(null);

  const uncategorizedCount = savedCards.filter((c) => !c.collectionId).length;

  // Drop any filter chip that no longer corresponds to a real collection
  // (e.g. it was just deleted) so the chip row never gets stuck showing a
  // stale selection.
  useEffect(() => {
    setFilterSet((prev) => {
      const validIds = new Set([UNCATEGORIZED, ...collections.map((c) => c.id)]);
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [collections]);

  const toggleFilter = (id: string) =>
    setFilterSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleCards =
    filterSet.size === 0 ? savedCards : savedCards.filter((c) => filterSet.has(c.collectionId ?? UNCATEGORIZED));

  const collectionName = (id?: string) =>
    id ? collections.find((c) => c.id === id)?.name ?? 'Uncategorized' : 'Uncategorized';

  // Label for the Play button: the one selected collection/Uncategorized
  // chip if exactly one is active, otherwise "All Saved" (no filter, or
  // several chips at once).
  const activeLabel =
    filterSet.size === 1 ? collectionName([...filterSet][0] === UNCATEGORIZED ? undefined : [...filterSet][0]) : 'All Saved';

  return (
    <div className="space-y-3">
      {(collections.length > 0 || uncategorizedCount > 0) && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-wrap gap-1.5">
            <Chip label="All" active={filterSet.size === 0} onClick={() => setFilterSet(new Set())} />
            {collections.map((c) => {
              const count = savedCards.filter((sc) => sc.collectionId === c.id).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={c.id}
                  label={`${c.name} (${count})`}
                  active={filterSet.has(c.id)}
                  onClick={() => toggleFilter(c.id)}
                />
              );
            })}
            {uncategorizedCount > 0 && (
              <Chip
                label={`Uncategorized (${uncategorizedCount})`}
                active={filterSet.has(UNCATEGORIZED)}
                onClick={() => toggleFilter(UNCATEGORIZED)}
              />
            )}
          </div>
          {collections.length > 0 && (
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              title="Rename or delete collections"
              aria-label="Manage collections"
              className="shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-focus-primary flex items-center justify-center transition"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {visibleCards.length > 0 && (
        <button
          type="button"
          onClick={() => onPlayCollection(visibleCards, activeLabel)}
          title={`Start a review session with all ${visibleCards.length} card${visibleCards.length === 1 ? '' : 's'} — jumps to the Review page`}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-focus-primary text-white text-xs font-bold"
        >
          <Play className="w-3.5 h-3.5" /> Play {activeLabel} ({visibleCards.length})
        </button>
      )}

      <div className="space-y-2">
        {visibleCards.map((c) => (
          <div
            key={c.id}
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 space-y-2.5"
          >
            <div>
              <p className="text-[10px] font-bold text-focus-primary uppercase tracking-wide mb-1">
                {collectionName(c.collectionId)}
              </p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">{c.prompt}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStudyCard(c)}
                title="Flip through this card's question and answer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-focus-primary/10 text-focus-primary text-[11px] font-bold"
              >
                <Play className="w-3.5 h-3.5" /> Study
              </button>
              <button
                type="button"
                onClick={() => setEditCard(c)}
                title="Edit this card's question, answer, or collection"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {manageOpen && (
        <ManageCollectionsModal
          collections={collections}
          savedCards={savedCards}
          onRename={onRenameCollection}
          onDelete={onDeleteCollection}
          onClose={() => setManageOpen(false)}
        />
      )}
      {studyCard && <StudyCardModal key={studyCard.id} card={studyCard} onClose={() => setStudyCard(null)} />}
      {editCard && (
        <EditCardModal
          key={editCard.id}
          card={editCard}
          collections={collections}
          onUpdateCard={onUpdateCard}
          onAddCollection={onAddCollection}
          onClose={() => setEditCard(null)}
        />
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Filter to ${label}`}
      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition ${
        active
          ? 'bg-focus-primary text-white border-focus-primary'
          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function ManageCollectionsModal({
  collections,
  savedCards,
  onRename,
  onDelete,
  onClose,
}: {
  collections: Collection[];
  savedCards: RecallCard[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { showToast } = useToast();

  return (
    <Modal onClose={onClose} title="Manage collections">
      <div className="space-y-1.5">
        {collections.map((c) => {
          const count = savedCards.filter((sc) => sc.collectionId === c.id).length;
          const isRenaming = renamingId === c.id;
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5"
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      onRename(c.id, renameValue.trim());
                      showToast('Collection renamed');
                    }
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-focus-primary rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                  title="Rename"
                  className="flex-1 min-w-0 text-left text-xs font-bold text-slate-700 dark:text-slate-200 truncate"
                >
                  {c.name} <span className="text-slate-400 font-semibold">({count})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onDelete(c.id);
                  showToast('Collection deleted — cards kept as Uncategorized');
                }}
                aria-label={`Delete ${c.name}`}
                title="Delete collection (cards stay saved, just uncategorized)"
                className="shrink-0 text-slate-300 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Quick flip-through viewer for a single saved card — same front/back idea
// as the main review flip card, without the rating step, since studying a
// saved card here never touches its spaced-repetition schedule.
function StudyCardModal({ card, onClose }: { card: RecallCard; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title={card.sourceTitle}>
      <div className="space-y-3">
        {card.image && (
          <button
            type="button"
            onClick={() => setLightboxSrc(card.image!)}
            className="relative mx-auto block group"
            aria-label="View image full screen"
            title="View image full screen"
          >
            <img
              src={card.image}
              className="max-h-28 w-auto mx-auto rounded-lg object-contain border border-slate-100 dark:border-slate-800"
            />
            <span className="absolute inset-0 rounded-lg bg-slate-900/0 group-hover:bg-slate-900/20 transition flex items-center justify-center">
              <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
            </span>
          </button>
        )}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Question</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{card.prompt}</p>
        </div>
        {revealed && (
          <div className="bg-focus-sage/10 border border-focus-sage/25 rounded-xl p-3">
            <p className="text-[10px] font-bold text-focus-sage-dark uppercase tracking-wide mb-1">Answer</p>
            <p className="text-xs text-slate-700 dark:text-slate-200">{card.answer}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          title={revealed ? 'Hide the answer again' : 'Reveal the answer'}
          className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        >
          <RotateCw className="w-4 h-4" /> {revealed ? 'Hide Answer' : 'Show Answer'}
        </button>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </Modal>
  );
}

// Edit a saved card's front/back text, label, and collection — the thing a
// student actually needs when a generated card is slightly off, instead of
// only being able to bookmark/unbookmark it.
function EditCardModal({
  card,
  collections,
  onUpdateCard,
  onAddCollection,
  onClose,
}: {
  card: RecallCard;
  collections: Collection[];
  onUpdateCard: (card: RecallCard) => void;
  onAddCollection: (collection: Collection) => void;
  onClose: () => void;
}) {
  const [front, setFront] = useState(card.prompt);
  const [back, setBack] = useState(card.answer);
  const [label, setLabel] = useState(card.sourceTitle);
  const [collectionId, setCollectionId] = useState(card.collectionId ?? '');
  const [newCollectionName, setNewCollectionName] = useState('');
  const { showToast } = useToast();

  const canSave = front.trim().length > 0 && back.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    let finalCollectionId = collectionId || undefined;
    if (newCollectionName.trim()) {
      const created = makeCollection(newCollectionName);
      onAddCollection(created);
      finalCollectionId = created.id;
    }
    onUpdateCard({
      ...card,
      prompt: front.trim(),
      answer: back.trim(),
      sourceTitle: label.trim() || card.sourceTitle,
      collectionId: finalCollectionId,
    });
    showToast('Changes saved');
    onClose();
  };

  const removeFromSaved = () => {
    onUpdateCard({ ...card, saved: false, collectionId: undefined });
    showToast('Removed from saved');
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Edit flashcard">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Front</label>
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={2}
            autoFocus
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Back</label>
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={2}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Collection</label>
          {collections.length > 0 && (
            <select
              value={newCollectionName ? '' : collectionId}
              onChange={(e) => {
                setCollectionId(e.target.value);
                setNewCollectionName('');
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
            >
              <option value="">Uncategorized</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={newCollectionName}
            onChange={(e) => {
              setNewCollectionName(e.target.value);
              if (e.target.value) setCollectionId('');
            }}
            placeholder="Or create a new collection…"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
          />
        </div>
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={removeFromSaved}
            title="Unsave this card — it stays where it was generated, just no longer in your saved library"
            className="py-3 px-4 bg-rose-50 dark:bg-rose-950/30 text-rose-500 text-xs font-bold rounded-2xl"
          >
            Remove
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="flex-1 py-3 bg-focus-primary text-white text-xs font-bold rounded-2xl disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}