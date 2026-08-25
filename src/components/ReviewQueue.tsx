import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Brain, Maximize2, PartyPopper, RotateCw, SkipForward, ZoomIn, ZoomOut,
  Sparkles, Check,
} from 'lucide-react';
import { RecallCard, HistoryItem } from '../types';
import { scheduleNextReview, isDue, RecallRating } from '../lib/spacedRepetition';
import AiCoach from './AiCoach';

interface Props {
  cards: RecallCard[];
  onUpdateCards: (cards: RecallCard[]) => void;
  history: HistoryItem[];
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
}

export default function ReviewQueue({ cards, onUpdateCards, history, onAddRecallCards, onError }: Props) {
  const dueCards = useMemo(() => cards.filter(isDue), [cards]);
  const dueIds = useMemo(() => dueCards.map((c) => c.id), [dueCards]);

  // Session order is tracked separately from `cards` so that "Skip" can push
  // a card to the back of today's queue without touching its schedule —
  // unlike rating, skipping never calls onUpdateCards. Kept in sync with
  // whichever cards are currently due: newly-due cards are appended, cards
  // that are no longer due (because they were just rated) drop out.
  const [sessionQueue, setSessionQueue] = useState<string[]>(() => dueIds);
  useEffect(() => {
    setSessionQueue((prev) => {
      const stillDue = prev.filter((id) => dueIds.includes(id));
      const newlyDue = dueIds.filter((id) => !prev.includes(id));
      return [...stillDue, ...newlyDue];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueIds.join(',')]);

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
  // instead of vanishing or being marked as reviewed.
  const skip = () => {
    if (!current) return;
    setSessionQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
    setExplanation('');
    setRevealed(false);
  };

  if (dueCards.length === 0) {
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
        <RecentsSection history={history} onBulkGenerate={startCoachRun} onError={onError} busy={coachItems !== null} />
        <AiCoach
          items={coachItems}
          requestedCount={coachCount}
          onComplete={(newCards) => onAddRecallCards(newCards)}
          onError={onError}
          onDismiss={dismissCoachRun}
        />
      </div>
    );
  }

  if (!current) return null; // sessionQueue syncing after a rate/skip; renders next tick

  // If the material this card came from included a photo (a quiz/summary built
  // from an uploaded image), it rides along on the card so the prompt doesn't
  // feel like a question out of nowhere. Optional — older cards without one
  // just show text, same as before.
  const cardImage = current.image;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Brain className="w-3.5 h-3.5 text-focus-primary" /> {dueCards.length} due
        </span>
        <span className="text-[11px] text-slate-400">{current.sourceTitle}</span>
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
            {/* Pinned footer — always visible, never scrolls out of view. */}
            <div className="shrink-0 p-6 pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">How well did you recall it?</p>
              <div className="grid grid-cols-4 gap-2">
                <RateButton label="Again" color="rose" onClick={() => rate('again')} />
                <RateButton label="Hard" color="amber" onClick={() => rate('hard')} />
                <RateButton label="Good" color="focus" onClick={() => rate('good')} />
                <RateButton label="Easy" color="sage" onClick={() => rate('easy')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-1.5">
        {sessionQueue.map((id, i) => (
          <span key={id} className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-6 bg-focus-primary' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>

      <RecentsSection history={history} onBulkGenerate={startCoachRun} onError={onError} busy={coachItems !== null} />
      <AiCoach
        items={coachItems}
        requestedCount={coachCount}
        onComplete={(newCards) => onAddRecallCards(newCards)}
        onError={onError}
        onDismiss={dismissCoachRun}
      />

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

// "Recents" on the Review page: a browsable list of recent quizzes,
// summaries, and visualizations. A long-press on any item enters selection
// mode and selects it; further taps toggle other items in or out. Once one
// or more are selected, "Create flashcards" hands the whole batch to AI
// Coach in one go, rather than resummarizing each item on its own.
function RecentsSection({
  history,
  onBulkGenerate,
  onError,
  busy,
}: {
  history: HistoryItem[];
  onBulkGenerate: (items: HistoryItem[], count: number) => void;
  onError: (msg: string) => void;
  busy: boolean;
}) {
  const recents = history.slice(0, 8);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // How many flashcards to build from the selected items. Left as
  // number | '' (rather than always-a-number) so the field can actually go
  // empty while typing instead of snapping back to its old value.
  const [cardCount, setCardCount] = useState<number | ''>(8);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  if (recents.length === 0) return null;

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
    // A long press already fired for this same press — the trailing click
    // event browsers still emit shouldn't toggle it right back off.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (selectMode) toggleSelected(id);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Recents</p>
        {selectMode && (
          <button onClick={clearSelection} className="text-[11px] font-bold text-slate-400">
            Cancel
          </button>
        )}
      </div>
      {!selectMode && (
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Long-press an item to select a few and turn them into flashcards together.
        </p>
      )}
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
                if (raw === '') { setCardCount(''); return; }
                const parsed = Number(raw);
                if (!Number.isNaN(parsed)) setCardCount(Math.round(parsed));
              }}
              onBlur={() => setCardCount((c) => Math.min(50, Math.max(0, c === '' ? 0 : c)))}
              aria-label="Number of flashcards to generate"
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

// Fullscreen viewer for a card's source image. Rendered as a sibling of the
// flip card (not nested inside it) so its `fixed` positioning isn't caught
// by the flip card's 3D transform context. Zoom works via buttons, mouse
// wheel/trackpad, or a two-finger pinch (handled natively by the browser via
// touch-action); once zoomed in, dragging pans around the image. "Back"
// (or Escape) closes it without touching the card underneath — no rating or
// explanation state is affected.
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const clampScale = (s: number) => Math.min(4, Math.max(1, +s.toFixed(2)));

  const zoomIn = () => setScale((s) => clampScale(s + 0.5));
  const zoomOut = () =>
    setScale((s) => {
      const next = clampScale(s - 0.5);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const next = clampScale(s - e.deltaY * 0.0015);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale === 1) return;
    setIsDragging(true);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    setPos({
      x: dragState.current.origX + (e.clientX - dragState.current.startX),
      y: dragState.current.origY + (e.clientY - dragState.current.startY),
    });
  };
  const endDrag = () => {
    dragState.current = null;
    setIsDragging(false);
  };

  const resetOnDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPos({ x: 0, y: 0 });
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/95 flex flex-col" onWheel={handleWheel}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-bold py-2 pr-3 -m-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 1}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-white/60 font-bold w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={scale >= 4}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={resetOnDoubleClick}
      >
        <img
          src={src}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
          className="max-w-full max-h-full object-contain"
        />
      </div>
      <p className="text-center text-[10px] text-white/40 font-semibold pb-4 shrink-0">
        Scroll or use the buttons to zoom {scale > 1 ? '· drag to pan' : ''}
      </p>
    </div>
  );
}

function RateButton({ label, color, onClick }: { label: string; color: 'rose' | 'amber' | 'focus' | 'sage'; onClick: () => void }) {
  const styles: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400',
    amber: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400',
    focus: 'bg-focus-primary/10 text-focus-primary border-focus-primary/30',
    sage: 'bg-focus-sage/10 text-focus-sage-dark border-focus-sage/30',
  };
  return (
    <button onClick={onClick} className={`py-2.5 rounded-xl text-[11px] font-bold border ${styles[color]}`}>
      {label}
    </button>
  );
}