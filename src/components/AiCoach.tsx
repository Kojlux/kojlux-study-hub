import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import { HistoryItem, RecallCard, QuizData, SummaryData, VisualizationResponse } from '../types';
import { generateContentWithFallback, GEMINI_KEYS, parseJsonResponse } from '../lib/gemini';
import { makeRecallCard } from '../lib/spacedRepetition';

interface Props {
  // Setting this to a non-null array of items kicks off a background run.
  // Setting it back to null (or leaving it) after completion is the caller's
  // job — this component only reports back via the callbacks below.
  items: HistoryItem[] | null;
  // How many flashcards the student asked for. Falls back to the auto
  // formula below when not given (kept only as a safety net).
  requestedCount: number | null;
  onComplete: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onDismiss: () => void;
}

function describeHistoryItem(item: HistoryItem, index: number): string {
  if (item.type === 'quiz') {
    const q = item.data as QuizData;
    return `[Item ${index + 1} — Quiz: "${q.title}"]\n${q.questions
      .map((qq) => `Q: ${qq.question}\nA: ${qq.correctAnswer}`)
      .join('\n')}`;
  }
  if (item.type === 'summary') {
    const s = item.data as SummaryData;
    return `[Item ${index + 1} — Summary: "${s.title}"]\nOverview: ${s.overview}\nKey points: ${s.keyPoints.join('; ')}`;
  }
  const v = item.data as VisualizationResponse;
  return `[Item ${index + 1} — Visualization: "${v.title}"]\n${v.steps
    .map((st) => `${st.label}: ${st.explanation}`)
    .join('; ')}`;
}

// Runs entirely in the background: takes several past quizzes/summaries/
// visualizations selected together from Review's Recents list, asks the
// Recall Coach key for one combined batch of cross-item recall questions
// (deliberately allowed to connect two items in a single question), and
// reports the resulting cards back once ready. This is what lets bulk
// selection turn several history items into one flashcard set in a single
// pass instead of resummarizing them one at a time.
export default function AiCoach({ items, requestedCount, onComplete, onError, onDismiss }: Props) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle');
  const runningFor = useRef<HistoryItem[] | null>(null);

  useEffect(() => {
    if (!items || items === runningFor.current) return;
    runningFor.current = items;
    setStatus('working');

    (async () => {
      try {
        const material = items.map(describeHistoryItem).join('\n\n');
        // The student's chosen count wins when they gave one; otherwise fall
        // back to the old auto-scaled guess.
        const targetCount = requestedCount ?? Math.min(20, Math.max(4, items.length * 3));
        const prompt = `A student selected ${items.length} items from their study history to turn into one combined flashcard set. Write recall questions that cover the material across all of them — it's fine, and often better, for a question to connect two items. Write EXACTLY ${targetCount} question${targetCount === 1 ? '' : 's'} total — not more, not fewer. Respond ONLY with strict JSON: {"cards": [{"prompt": string, "answer": string, "sourceTitle": string}]}\n\n${material}`;

        const response = await generateContentWithFallback(GEMINI_KEYS.recallCoach, {
          model: 'gemini-3.6-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const parsed = parseJsonResponse<{ cards: { prompt: string; answer: string; sourceTitle: string }[] }>(
          response.text
        );
        // The model doesn't always follow "exactly N" precisely — trim any
        // overshoot ourselves rather than trusting the response as-is.
        const cards = parsed.cards.slice(0, targetCount).map((c) =>
          makeRecallCard({
            sourceType: 'concept-link',
            sourceTitle: c.sourceTitle || `${items.length} Recents`,
            prompt: c.prompt,
            answer: c.answer,
            immediate: true,
          })
        );
        setStatus('done');
        onComplete(cards);
      } catch (err) {
        console.error(err);
        onError('Could not build flashcards from those items — try again.');
        runningFor.current = null;
        setStatus('idle');
      }
    })();
  }, [items]);

  // Auto-dismiss the "done" toast a few seconds after it lands, so it
  // doesn't linger — but only while nothing new has been queued since.
  useEffect(() => {
    if (status !== 'done') return;
    const timer = setTimeout(() => onDismiss(), 4000);
    return () => clearTimeout(timer);
  }, [status, onDismiss]);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2.5rem)] max-w-sm">
      <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
        {status === 'working' ? (
          <Sparkles className="w-4 h-4 text-focus-primary animate-pulse shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-focus-sage shrink-0" />
        )}
        <p className="flex-1 text-xs font-semibold leading-relaxed">
          {status === 'working' ? 'Cards getting ready…' : 'Done'}
        </p>
        <button onClick={onDismiss} className="shrink-0 text-white/60 hover:text-white" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}