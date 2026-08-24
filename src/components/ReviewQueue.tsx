import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Brain, Maximize2, PartyPopper, RotateCw, SkipForward, ZoomIn, ZoomOut } from 'lucide-react';
import { RecallCard } from '../types';
import { scheduleNextReview, isDue, RecallRating } from '../lib/spacedRepetition';

interface Props {
  cards: RecallCard[];
  onUpdateCards: (cards: RecallCard[]) => void;
}

export default function ReviewQueue({ cards, onUpdateCards }: Props) {
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
      <div className="flex flex-col items-center justify-center text-center py-16 space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-focus-sage/15 flex items-center justify-center">
          <PartyPopper className="w-8 h-8 text-focus-sage-dark" />
        </div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">All caught up</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px]">
          Nothing due right now. New cards appear here automatically from your quizzes and summaries — come back later for spaced review.
        </p>
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
            className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 flex flex-col"
          >
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
            <div className="mt-4 flex-1 flex flex-col">
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain it in your own words first — this is what actually builds recall."
                rows={4}
                className="w-full flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
              />
              <div className="mt-3 flex gap-2.5">
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
          </div>

          {/* Back */}
          <div
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 flex flex-col overflow-y-auto"
          >
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
            <div className="mt-auto pt-4">
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

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
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