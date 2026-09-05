import React, { useEffect, useState } from 'react';
import { Link2, X, PlusCircle, Loader2, AlertCircle } from 'lucide-react';
import { fetchSharedCard } from '../lib/sharedCards';
import { makeRecallCard } from '../lib/spacedRepetition';
import { RecallCard, SharedCardSnapshot } from '../types';
import { useToast } from './Toast';

interface Props {
  cardId: string;
  onAdd: (cards: RecallCard[]) => void;
  onDismiss: () => void;
}

type LoadState = 'loading' | 'error' | 'not-found' | SharedCardSnapshot;

// Renders whatever a `/card/:id` deep link points at. Deliberately
// independent of the signed-in student's own `cards` array — the id in the
// link resolves against the public `sharedCards` snapshot (lib/sharedCards.ts),
// not the recipient's private recallCards subcollection, since a friend
// opening the link has no access to (and shouldn't need) the sender's
// account data.
export default function SharedCardViewer({ cardId, onAdd, onDismiss }: Props) {
  const { showToast } = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setRevealed(false);
    setSaved(false);
    fetchSharedCard(cardId)
      .then((snap) => {
        if (cancelled) return;
        setState(snap ?? 'not-found');
      })
      .catch((err) => {
        console.error('Failed to load shared card', err);
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const save = () => {
    if (state === 'loading' || state === 'error' || state === 'not-found') return;
    const card = makeRecallCard({
      sourceType: 'shared',
      sourceTitle: state.sourceTitle,
      prompt: state.prompt,
      answer: state.answer,
      image: state.image,
      immediate: true,
    });
    onAdd([card]);
    setSaved(true);
    showToast('Added to your flashcards');
  };

  return (
    <div className="fixed inset-0 z-[180] bg-focus-bg dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <Link2 className="w-3.5 h-3.5 text-focus-primary" /> Shared flashcard
          </span>
          <button
            onClick={onDismiss}
            aria-label="Close"
            title="Close"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-focus-primary animate-spin" />
          </div>
        )}

        {(state === 'error' || state === 'not-found') && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px]">
              {state === 'not-found'
                ? "This shared card doesn't exist anymore."
                : "Couldn't load this shared card right now."}
            </p>
            <button onClick={onDismiss} className="py-2.5 px-5 bg-focus-primary text-white rounded-xl text-xs font-bold">
              Go to Study Hub
            </button>
          </div>
        )}

        {state !== 'loading' && state !== 'error' && state !== 'not-found' && (
          <>
            <div style={{ perspective: '1500px' }} className="flex-1 min-h-[320px]">
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
                  <div className="flex-1 overflow-y-auto p-6">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Question</p>
                    {state.image && (
                      <img
                        src={state.image}
                        className="max-h-28 w-auto mx-auto mb-3 rounded-lg object-contain border border-slate-100 dark:border-slate-800"
                      />
                    )}
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{state.prompt}</p>
                  </div>
                  <div className="shrink-0 p-6 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setRevealed(true)}
                      className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold"
                    >
                      Flip Card
                    </button>
                  </div>
                </div>

                {/* Back */}
                <div
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden"
                >
                  <div className="flex-1 overflow-y-auto p-6">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Answer</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed mb-3">{state.prompt}</p>
                    <div className="bg-focus-sage/10 border border-focus-sage/25 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-focus-sage-dark uppercase tracking-wide mb-1">Target answer</p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">{state.answer}</p>
                    </div>
                  </div>
                  <div className="shrink-0 p-6 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={save}
                      disabled={saved}
                      className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <PlusCircle className="w-4 h-4" /> {saved ? 'Added' : 'Save to my flashcards'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onDismiss}
              className="mt-4 w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-xs font-bold"
            >
              Continue to Study Hub
            </button>
          </>
        )}
      </div>
    </div>
  );
}
