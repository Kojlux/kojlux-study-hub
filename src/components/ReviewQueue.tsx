import React, { useMemo, useState } from 'react';
import { Brain, RefreshCw, Sparkles, PartyPopper, RotateCw } from 'lucide-react';
import { RecallCard } from '../types';
import { scheduleNextReview, isDue, RecallRating } from '../lib/spacedRepetition';
import { generateContentWithFallback, GEMINI_KEYS, parseJsonResponse } from '../lib/gemini';

interface Props {
  cards: RecallCard[];
  onUpdateCards: (cards: RecallCard[]) => void;
}

export default function ReviewQueue({ cards, onUpdateCards }: Props) {
  const dueCards = useMemo(() => cards.filter(isDue), [cards]);
  const [index, setIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [gradingBusy, setGradingBusy] = useState(false);

  const current = dueCards[index];

  const reveal = async () => {
    setRevealed(true);
    if (!explanation.trim() || !current) return;
    // Self-explanation effect: before showing the "correct" answer we already
    // reveal, ask Gemini to give one line of feedback comparing the
    // student's own explanation to the target — this is the metacognitive
    // step that plain flashcards skip.
    setGradingBusy(true);
    try {
      const prompt = `A student is reviewing this recall prompt: "${current.prompt}". The target answer is: "${current.answer}". The student wrote, before seeing the answer: "${explanation}". In one short encouraging sentence, tell them what their explanation got right and what (if anything) it missed. Respond ONLY with strict JSON: {"feedback": string}`;
      const response = await generateContentWithFallback(GEMINI_KEYS.recallCoach, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const parsed = parseJsonResponse<{ feedback: string }>(response.text);
      setAiFeedback(parsed.feedback);
    } catch (err) {
      console.error(err);
      // Non-fatal — the card, correct answer, and rating buttons already work
      // without AI feedback, so we fail silently here.
    } finally {
      setGradingBusy(false);
    }
  };

  const rate = (rating: RecallRating) => {
    if (!current) return;
    const updated = scheduleNextReview(current, rating);
    onUpdateCards(cards.map((c) => (c.id === current.id ? updated : c)));
    setExplanation('');
    setRevealed(false);
    setAiFeedback(null);
    setIndex((i) => i); // dueCards recomputes; stay at same position since the reviewed card drops out
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

  const displayIndex = dueCards.findIndex((c) => c.id === current?.id);
  // If the material this card came from included a photo (a quiz/summary built
  // from an uploaded image), it rides along on the card so the prompt doesn't
  // feel like a question out of nowhere. Optional — older cards without one
  // just show text, same as before.
  const cardImage = current?.image;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Brain className="w-3.5 h-3.5 text-focus-primary" /> {dueCards.length} due
        </span>
        <span className="text-[11px] text-slate-400">{current?.sourceTitle}</span>
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
              <img src={cardImage} className="max-h-28 w-auto mx-auto mb-3 rounded-lg object-contain border border-slate-100 dark:border-slate-800" />
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
              <button
                onClick={reveal}
                className="mt-3 w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                <RotateCw className="w-4 h-4" /> Flip Card
              </button>
            </div>
          </div>

          {/* Back */}
          <div
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 flex flex-col overflow-y-auto"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Answer</p>
            {cardImage && (
              <img src={cardImage} className="max-h-20 w-auto mx-auto mb-2 rounded-lg object-contain border border-slate-100 dark:border-slate-800 opacity-80" />
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
            {gradingBusy && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-3"><RefreshCw className="w-3 h-3 animate-spin" /> Comparing your explanation…</p>
            )}
            {aiFeedback && (
              <div className="bg-focus-primary/5 border border-focus-primary/20 rounded-xl p-3 flex items-start gap-2 mt-3">
                <Sparkles className="w-3.5 h-3.5 text-focus-primary shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300">{aiFeedback}</p>
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
        {dueCards.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === displayIndex ? 'w-6 bg-focus-primary' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>
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