import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain, Maximize2, PartyPopper, RotateCw, SkipForward, Plus, Image as ImageIcon, X, FolderOpen,
} from 'lucide-react';
import { RecallCard, HistoryItem, Collection } from '../types';
import { scheduleNextReview, isDue, RecallRating, makeRecallCard } from '../lib/spacedRepetition';
import { makeCollection } from '../lib/collections';
import AiCoach from './AiCoach';
import Modal from './Modal';
import { ToastProvider, useToast } from './Toast';
import SaveCardControl from './SaveCardControl';
import ShareCardButton from './ShareCardButton';
import StudyLibrary from './StudyLibrary';
import ImageLightbox from './ImageLightbox';

interface Props {
  cards: RecallCard[];
  onUpdateCards: (cards: RecallCard[]) => void;
  // Single-card update — used for saving/unsaving/re-filing/editing a card,
  // which shouldn't also bump totalReviews/streak the way onUpdateCards
  // (rating a card) does.
  onUpdateCard: (card: RecallCard) => void;
  history: HistoryItem[];
  onAddRecallCards: (cards: RecallCard[]) => void;
  collections: Collection[];
  onAddCollection: (collection: Collection) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onError: (msg: string) => void;
}

// The toast system lives at the top of this page (see Toast.tsx) so every
// action below it — saving a card, editing one, adding a manual flashcard —
// can show a real, working confirmation. `AiCoach` isn't included in this
// redesign since it wasn't part of what was shared; its own internal "Done"
// message is wired independently. If that message is the one getting stuck,
// applying the same ToastProvider/useToast pattern from Toast.tsx inside
// AiCoach — swapping its current stuck-open logic for the per-id timer here
// — will fix it the same way it's fixed everywhere on this page.
export default function ReviewQueue(props: Props) {
  return (
    <ToastProvider>
      <ReviewQueueInner {...props} />
    </ToastProvider>
  );
}

function ReviewQueueInner({
  cards,
  onUpdateCards,
  onUpdateCard,
  history,
  onAddRecallCards,
  collections,
  onAddCollection,
  onRenameCollection,
  onDeleteCollection,
  onError,
}: Props) {
  const { showToast } = useToast();
  const dueCards = useMemo(() => cards.filter(isDue), [cards]);
  const dueIds = useMemo(() => dueCards.map((c) => c.id), [dueCards]);

  // Session order is tracked separately from `cards` so that "Skip" can push
  // a card to the back of today's queue without touching its schedule —
  // unlike rating, skipping never calls onUpdateCards. Kept in sync with
  // whichever cards are currently due: newly-due cards are appended, cards
  // that are no longer due (because they were just rated) drop out.
  const [sessionQueue, setSessionQueue] = useState<string[]>(() => dueIds);

  // Non-null while playing through a saved collection instead of today's due
  // cards — holds the label shown in the header (e.g. a collection name or
  // "All Saved"). Playing a collection reuses this same session queue/flip
  // card, it just points sessionQueue at the collection's card ids instead
  // of the due ones, and skips the due-sync effect below so it isn't
  // clobbered mid-session.
  const [collectionLabel, setCollectionLabel] = useState<string | null>(null);

  useEffect(() => {
    if (collectionLabel) return;
    setSessionQueue((prev) => {
      const stillDue = prev.filter((id) => dueIds.includes(id));
      const newlyDue = dueIds.filter((id) => !prev.includes(id));
      return [...stillDue, ...newlyDue];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueIds.join(','), collectionLabel]);

  const [explanation, setExplanation] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Recents bulk selection -> AI Coach. coachItems is non-null while a
  // background generation run is in flight or has just finished (see
  // AiCoach); coachCount travels alongside it as the student's chosen count.
  const [coachItems, setCoachItems] = useState<HistoryItem[] | null>(null);
  const [coachCount, setCoachCount] = useState<number | null>(null);
  const startCoachRun = (items: HistoryItem[], count: number) => {
    setCoachItems(items);
    setCoachCount(count);
  };
  const dismissCoachRun = () => {
    setCoachItems(null);
    setCoachCount(null);
  };

  const current = cards.find((c) => c.id === sessionQueue[0]);

  // Flipping just reveals the target answer — no AI grading step. The
  // self-written explanation stays on screen next to the target answer so
  // the student can compare the two themselves.
  const reveal = () => setRevealed(true);

  const rate = (rating: RecallRating) => {
    if (!current) return;
    const updated = scheduleNextReview(current, rating);
    onUpdateCards(cards.map((c) => (c.id === current.id ? updated : c)));
    setSessionQueue((q) => q.slice(1));
    setExplanation('');
    setRevealed(false);
  };

  // Skip: move this card to the back of today's session queue, unrated and
  // unscheduled — it'll come back around later in the same review session
  // instead of vanishing or being marked as reviewed. Works the same way
  // whether the session is today's due cards or a played collection, since
  // it only ever reorders the local queue.
  const skip = () => {
    if (!current) return;
    setSessionQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
    setExplanation('');
    setRevealed(false);
  };

  // Start playing a saved collection right here on the review page — same
  // flip card, no scheduling. Called from the Saved tab's "Play" button.
  const playCollection = (collectionCards: RecallCard[], label: string) => {
    setSessionQueue(collectionCards.map((c) => c.id));
    setCollectionLabel(label);
    setExplanation('');
    setRevealed(false);
  };

  // Leave a collection session and go back to today's due cards.
  const exitCollection = () => {
    setCollectionLabel(null);
    setSessionQueue(dueIds);
    setExplanation('');
    setRevealed(false);
  };

  // Advance to the next card in a collection session — never touches
  // scheduling or calls onUpdateCards, since a played collection isn't
  // being rated. Finishing the last card returns to the due-cards view.
  const advanceCollection = () => {
    if (sessionQueue.length <= 1) {
      exitCollection();
      return;
    }
    setSessionQueue((q) => q.slice(1));
    setExplanation('');
    setRevealed(false);
  };

  const library = (
    <StudyLibrary
      cards={cards}
      history={history}
      collections={collections}
      onBulkGenerate={startCoachRun}
      onError={onError}
      busy={coachItems !== null}
      onUpdateCard={onUpdateCard}
      onAddCollection={onAddCollection}
      onRenameCollection={onRenameCollection}
      onDeleteCollection={onDeleteCollection}
      onPlayCollection={playCollection}
    />
  );

  const coach = (
    <AiCoach
      items={coachItems}
      requestedCount={coachCount}
      onComplete={(newCards) => {
        onAddRecallCards(newCards);
        showToast(`${newCards.length} flashcard${newCards.length === 1 ? '' : 's'} added`);
      }}
      onError={onError}
      onDismiss={dismissCoachRun}
    />
  );

  if (!collectionLabel && dueCards.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center text-center py-10 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-focus-sage/15 flex items-center justify-center">
            <PartyPopper className="w-8 h-8 text-focus-sage-dark" />
          </div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">All caught up</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px]">
            Nothing due right now. New cards appear here automatically from your quizzes and summaries — come back later for spaced review.
          </p>
        </div>
        <ManualFlashcardSection onAdd={onAddRecallCards} collections={collections} onAddCollection={onAddCollection} />
        {library}
        {coach}
      </div>
    );
  }

  if (!current) return null; // sessionQueue syncing after a rate/skip; renders next tick

  // If the material this card came from included a photo (a quiz/summary
  // built from an uploaded image), it rides along on the card so the prompt
  // doesn't feel like a question out of nowhere. Optional — older cards
  // without one just show text, same as before.
  const cardImage = current.image;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {collectionLabel ? (
          <>
            <span
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
              title="Playing through this saved collection — no scheduling involved"
            >
              <FolderOpen className="w-3.5 h-3.5 text-focus-primary" /> {collectionLabel}
            </span>
            <button
              type="button"
              onClick={exitCollection}
              title="Exit and return to today's due cards"
              className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" /> Exit
            </button>
          </>
        ) : (
          <>
            <span
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
              title="Cards scheduled for review today, based on spaced repetition"
            >
              <Brain className="w-3.5 h-3.5 text-focus-primary" /> {dueCards.length} due
            </span>
            <span className="text-[11px] text-slate-400">{current.sourceTitle}</span>
          </>
        )}
      </div>

      {/* Flip flashcard: front = prompt (+ source image, + your own explanation),
          back = the target answer, AI feedback, and rating buttons. Tapping
          "Flip Card" turns it over rather than just swapping content in place,
          so it reads as a flashcard rather than a quiz form. */}
      <div style={{ perspective: '1500px' }} className="min-h-[320px]">
        <div
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.5s',
            transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
          className="relative w-full h-full min-h-[320px]"
        >
          {/* Front */}
          <div
            style={{ backfaceVisibility: 'hidden' }}
            className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden"
          >
            {/* Only this part scrolls — long prompts never push Skip/Flip
                Card out of reach the way they used to. */}
            <div className="flex-1 overflow-y-auto p-6 pb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Question</p>
              {cardImage && (
                <button
                  type="button"
                  onClick={() => setLightboxSrc(cardImage)}
                  className="relative mx-auto mb-3 block group"
                  aria-label="View image full screen"
                  title="View image full screen"
                >
                  <img src={cardImage} className="max-h-28 w-auto mx-auto rounded-lg object-contain border border-slate-100 dark:border-slate-800" />
                  <span className="absolute inset-0 rounded-lg bg-slate-900/0 group-hover:bg-slate-900/20 group-active:bg-slate-900/30 transition flex items-center justify-center">
                    <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </button>
              )}
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{current.prompt}</p>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain it in your own words first — this is what actually builds recall."
                title="Writing your own explanation before flipping is what makes recall stick"
                rows={4}
                className="w-full mt-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
              />
            </div>
            {/* Pinned footer — Skip / Flip Card always stay visible, whatever
                the content above scrolls to. */}
            <div className="shrink-0 flex gap-2.5 p-6 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={skip}
                disabled={sessionQueue.length < 2}
                className="py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                title="Come back to this card later — it won't be marked as reviewed"
              >
                <SkipForward className="w-4 h-4" /> Skip
              </button>
              <button
                onClick={reveal}
                className="flex-1 py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                title="See the target answer"
              >
                <RotateCw className="w-4 h-4" /> Flip Card
              </button>
            </div>
          </div>

          {/* Back */}
          <div
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden"
          >
            {/* Only this part scrolls — the rating buttons below are what
                actually advance to the next card, so they can't be allowed
                to end up out of reach on a long answer or short screen. */}
            <div className="flex-1 overflow-y-auto p-6 pb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Answer</p>
              {cardImage && (
                <button
                  type="button"
                  onClick={() => setLightboxSrc(cardImage)}
                  className="relative mx-auto mb-2 block group"
                  aria-label="View image full screen"
                  title="View image full screen"
                >
                  <img src={cardImage} className="max-h-20 w-auto mx-auto rounded-lg object-contain border border-slate-100 dark:border-slate-800 opacity-80" />
                  <span className="absolute inset-0 rounded-lg bg-slate-900/0 group-hover:bg-slate-900/20 group-active:bg-slate-900/30 transition flex items-center justify-center">
                    <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </button>
              )}
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed mb-3">{current.prompt}</p>
              <div className="bg-focus-sage/10 border border-focus-sage/25 rounded-xl p-3">
                <p className="text-[10px] font-bold text-focus-sage-dark uppercase tracking-wide mb-1">Target answer</p>
                <p className="text-xs text-slate-700 dark:text-slate-200">{current.answer}</p>
              </div>
              {explanation.trim() && (
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mt-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">What you wrote</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{explanation}</p>
                </div>
              )}
            </div>
            {/* Pinned footer — always visible, never scrolls out of view.
                Collection sessions skip rating entirely (no scheduling), so
                they just get a single Next Card button instead. */}
            <div className="shrink-0 p-6 pt-3 border-t border-slate-100 dark:border-slate-800">
              {collectionLabel ? (
                <button
                  onClick={advanceCollection}
                  title={sessionQueue.length <= 1 ? 'Finish this collection' : 'Go to the next card'}
                  className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold"
                >
                  {sessionQueue.length <= 1 ? 'Done' : 'Next Card'}
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">How well did you recall it?</p>
                    <div className="flex items-center gap-3">
                      <ShareCardButton card={current} />
                      <SaveCardControl card={current} collections={collections} onUpdateCard={onUpdateCard} onAddCollection={onAddCollection} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <RateButton label="Again" color="rose" onClick={() => rate('again')} title="Didn't recall it — you'll see this again very soon" />
                    <RateButton label="Hard" color="amber" onClick={() => rate('hard')} title="Recalled it, but it took real effort" />
                    <RateButton label="Good" color="focus" onClick={() => rate('good')} title="Recalled it with some effort — normal pace" />
                    <RateButton label="Easy" color="sage" onClick={() => rate('easy')} title="Recalled it instantly — next review pushed further out" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex justify-center gap-1.5"
        title={`${sessionQueue.length} card${sessionQueue.length === 1 ? '' : 's'} left in ${collectionLabel ? 'this collection' : "today's session"}`}
      >
        {sessionQueue.map((id, i) => (
          <span key={id} className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-6 bg-focus-primary' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>

      {!collectionLabel && (
        <>
          <ManualFlashcardSection onAdd={onAddRecallCards} collections={collections} onAddCollection={onAddCollection} />
          {library}
        </>
      )}
      {coach}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

// Manual flashcard wizard: lets a student build a card by hand — typing
// their own Front (prompt) and Back (answer) text — instead of relying
// solely on automated generation from a quiz/summary/photo. Cards made this
// way are due immediately (there's no "first exposure" gap to protect,
// since the student just wrote it themselves) and are tagged sourceType
// 'manual' so they're distinguishable from AI-generated cards elsewhere.
function ManualFlashcardSection({
  onAdd,
  collections,
  onAddCollection,
}: {
  onAdd: (cards: RecallCard[]) => void;
  collections: Collection[];
  onAddCollection: (collection: Collection) => void;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [label, setLabel] = useState('');
  // Which collection (if any) to file this card into right away — hand-typed
  // cards are already saved by default, so this just decides whether they
  // land in "Uncategorized" or a named folder from the start.
  const [collectionId, setCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  // Optional photo to ride along with a hand-written card, same as quiz/
  // summary-generated cards already support.
  const [image, setImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setFront('');
    setBack('');
    setLabel('');
    setImage(null);
    setCollectionId('');
    setNewCollectionName('');
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleImageFile = (selected: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const canSubmit = front.trim().length > 0 && back.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    // A typed name in "new collection" wins over picking an existing one —
    // create it first so the card can be filed into it immediately.
    let finalCollectionId = collectionId || undefined;
    if (newCollectionName.trim()) {
      const created = makeCollection(newCollectionName);
      onAddCollection(created);
      finalCollectionId = created.id;
    }
    const card = makeRecallCard({
      sourceType: 'manual',
      sourceTitle: label.trim() || 'Custom flashcard',
      prompt: front.trim(),
      answer: back.trim(),
      image: image ?? undefined,
      immediate: true,
      collectionId: finalCollectionId,
    });
    onAdd([card]);
    showToast('Flashcard added');
    close();
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Write your own question and answer"
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:border-focus-primary hover:text-focus-primary transition"
      >
        <Plus className="w-4 h-4" /> Add custom flashcard
      </button>

      {open && (
        <Modal onClose={close} title="New flashcard">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Front</label>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Question or prompt"
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
              placeholder="Answer"
              rows={2}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Image (optional)</label>
            {image ? (
              <div className="relative inline-block">
                <img src={image} className="max-h-28 rounded-xl object-contain border border-slate-200 dark:border-slate-700" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center shadow"
                  aria-label="Remove image"
                  title="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-focus-primary transition"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Add photo
              </button>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Spanish Vocab"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Collection (optional)</label>
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
                  <option key={c.id} value={c.id}>{c.name}</option>
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
          <div className="flex gap-2.5">
            <button
              onClick={close}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-2xl"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex-1 py-3 bg-focus-primary text-white text-xs font-bold rounded-2xl disabled:opacity-50"
            >
              Add card
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RateButton({
  label,
  color,
  onClick,
  title,
}: {
  label: string;
  color: 'rose' | 'amber' | 'focus' | 'sage';
  onClick: () => void;
  title?: string;
}) {
  const styles: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400',
    amber: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400',
    focus: 'bg-focus-primary/10 text-focus-primary border-focus-primary/30',
    sage: 'bg-focus-sage/10 text-focus-sage-dark border-focus-sage/30',
  };
  return (
    <button onClick={onClick} title={title} className={`py-2.5 rounded-xl text-[11px] font-bold border ${styles[color]}`}>
      {label}
    </button>
  );
}