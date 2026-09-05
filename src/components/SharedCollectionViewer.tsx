import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Link2, Loader2, PlusCircle, X } from 'lucide-react';
import { fetchSharedCollection } from '../lib/sharedCards';
import { makeRecallCard } from '../lib/spacedRepetition';
import { RecallCard, SharedCollectionSnapshot } from '../types';
import { useToast } from './Toast';

export default function SharedCollectionViewer({ collectionId, onAdd, onDismiss }: { collectionId: string; onAdd: (cards: RecallCard[]) => void; onDismiss: () => void }) {
  const { showToast } = useToast();
  const [state, setState] = useState<SharedCollectionSnapshot | 'loading' | 'error' | 'not-found'>('loading');
  const [saved, setSaved] = useState(false);
  useEffect(() => { let cancelled = false; fetchSharedCollection(collectionId).then((snapshot) => { if (!cancelled) setState(snapshot ?? 'not-found'); }).catch(() => { if (!cancelled) setState('error'); }); return () => { cancelled = true; }; }, [collectionId]);
  const save = () => {
    if (typeof state === 'string' || state.cards.length === 0) return;
    onAdd(state.cards.map((card) => makeRecallCard({ sourceType: 'shared', sourceTitle: card.sourceTitle, prompt: card.prompt, answer: card.answer, image: card.image, immediate: true })));
    setSaved(true); showToast(`${state.cards.length} flashcards added`);
  };
  return <div className="fixed inset-0 z-[180] bg-focus-bg dark:bg-slate-950 overflow-y-auto"><div className="max-w-md mx-auto min-h-screen p-5"><div className="flex items-center justify-between mb-5"><span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide"><Link2 className="w-3.5 h-3.5 text-focus-primary" /> Shared collection</span><button onClick={onDismiss} aria-label="Close" title="Close"><X className="w-4 h-4 text-slate-400" /></button></div>{state === 'loading' && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-focus-primary animate-spin" /></div>}{(state === 'error' || state === 'not-found') && <div className="flex flex-col items-center text-center gap-3 py-20"><AlertCircle className="w-8 h-8 text-rose-500" /><p className="text-xs text-slate-500">{state === 'not-found' ? "This shared collection doesn't exist anymore." : "Couldn't load this shared collection right now."}</p></div>}{typeof state !== 'string' && <><h1 className="text-xl font-black text-slate-900 dark:text-white mb-1">{state.name}</h1><p className="text-xs text-slate-500 mb-4">{state.cards.length} flashcard{state.cards.length === 1 ? '' : 's'}</p><div className="space-y-2 mb-5">{state.cards.map((card) => <div key={card.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{card.prompt}</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.answer}</p></div>)}</div><button onClick={save} disabled={saved || state.cards.length === 0} className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">{saved ? <Check className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}{saved ? 'Added' : 'Save all to my flashcards'}</button></>}<button onClick={onDismiss} className="mt-4 w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl text-xs font-bold">Continue to Study Hub</button></div></div>;
}