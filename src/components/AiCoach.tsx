import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import { HistoryItem, RecallCard, QuizData, SummaryData, VisualizationResponse } from '../types';
import { generateContentWithFallback, GEMINI_KEYS, parseJsonResponse } from '../lib/gemini';
import { makeRecallCard } from '../lib/spacedRepetition';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStore';

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

const DRAFT_KEY = 'ai_coach_job';

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

  // Actual generation logic, pulled out so it can be triggered either by a
  // fresh `items` prop from the parent, or by resuming a job that was still
  // in flight when the tab was interrupted (see the resume effect below).
  const runGeneration = async (jobItems: HistoryItem[], jobRequestedCount: number | null) => {
    try {
      const material = jobItems.map(describeHistoryItem).join('\n\n');
      const targetCount = jobRequestedCount ?? Math.min(20, Math.max(4, jobItems.length * 3));
      const prompt = `A student selected ${jobItems.length} items from their study history to turn into one combined flashcard set. Write recall questions that cover the material across all of them — it's fine, and often better, for a question to connect two items. Write EXACTLY ${targetCount} question${targetCount === 1 ? '' : 's'} total — not more, not fewer. Respond ONLY with strict JSON: {"cards": [{"prompt": string, "answer": string, "sourceTitle": string}]}\n\n${material}`;

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
          sourceTitle: c.sourceTitle || `${jobItems.length} Recents`,
          prompt: c.prompt,
          answer: c.answer,
          immediate: true,
        })
      );
      setStatus('done');
      clearDraft(DRAFT_KEY); // job finished — nothing left to resume
      onComplete(cards);
    } catch (err) {
      console.error(err);
      onError('Could not build flashcards from those items — try again.');
      clearDraft(DRAFT_KEY); // don't keep retrying a job that's actually failing
      runningFor.current = null;
      setStatus('idle');
    }
  };

  // On mount only: if a job was still running when the tab died (crash,
  // refresh, mobile low-memory kill), resume it here — independent of
  // whatever `items` this fresh mount receives as a prop, since the
  // parent's own selection state (ReviewQueue's `coachItems`) doesn't
  // survive a full-page refresh any better than this component's did.
  // Without this, a refresh mid-generation silently drops the whole batch
  // with no error and no retry, which reads to the student as "my cards
  // just vanished" even though nothing had actually been saved yet.
  useEffect(() => {
    loadDraft<{ items: HistoryItem[]; requestedCount: number | null }>(DRAFT_KEY).then((job) => {
      if (job && job.items?.length && !runningFor.current) {
        runningFor.current = job.items;
        setStatus('working');
        runGeneration(job.items, job.requestedCount);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!items || items === runningFor.current) return;
    runningFor.current = items;
    setStatus('working');
    // Persist the job BEFORE the async call starts, so a crash at any point
    // during generation — not just after it — leaves something to resume.
    saveDraft(DRAFT_KEY, { items, requestedCount });
    runGeneration(items, requestedCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Dismissing (whether the student taps the X, or the auto-timer below
  // fires) needs to do two things: reset our own `status` back to 'idle' so
  // the toast actually disappears, and let the parent know via onDismiss.
  // Previously only the latter happened, which is why the X button looked
  // broken — the toast stayed on screen no matter what was clicked.
  const dismiss = () => {
    setStatus('idle');
    onDismiss();
  };

  // Auto-dismiss the "done" toast a couple seconds after it lands, so it
  // doesn't linger and nobody has to tap the X at all.
  useEffect(() => {
    if (status !== 'done') return;
    const timer = setTimeout(dismiss, 2000);
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
        <button onClick={dismiss} className="shrink-0 text-white/60 hover:text-white" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}