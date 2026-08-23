import React, { useMemo } from 'react';
import { Brain, FileText, Activity, Flame, ChevronRight, Clock } from 'lucide-react';
import { RecallCard, HistoryItem } from '../types';
import { isDue } from '../lib/spacedRepetition';

interface Props {
  username: string;
  streak: number;
  cards: RecallCard[];
  history: HistoryItem[];
  onNavigate: (tab: 'quiz' | 'visualizer' | 'summarizer' | 'review') => void;
}

export default function StudyHome({ username, streak, cards, history, onNavigate }: Props) {
  const dueCount = useMemo(() => cards.filter(isDue).length, [cards]);
  const recent = history.slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Welcome back</p>
        <h1 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{username || 'Student'}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-focus-primary rounded-2xl p-4 text-white shadow-sm shadow-focus-primary/20">
          <Flame className="w-5 h-5 text-white/80" />
          <p className="text-2xl font-black mt-2">{streak}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Day streak</p>
        </div>
        <button
          onClick={() => onNavigate('review')}
          className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-left hover:border-focus-primary transition"
        >
          <Brain className="w-5 h-5 text-focus-primary" />
          <p className="text-2xl font-black mt-2 text-slate-900 dark:text-white">{dueCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due for review</p>
        </button>
      </div>

      {dueCount > 0 && (
        <button
          onClick={() => onNavigate('review')}
          className="w-full bg-focus-primary/10 dark:bg-focus-primary/15 border border-focus-primary/25 rounded-2xl p-4 flex items-center justify-between"
        >
          <span className="text-xs font-bold text-focus-primary">
            {dueCount} card{dueCount === 1 ? '' : 's'} ready — a few minutes now beats cramming later.
          </span>
          <ChevronRight className="w-4 h-4 text-focus-primary shrink-0" />
        </button>
      )}

      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Study tools</p>
        <QuickLaunch icon={FileText} label="Quiz Builder" desc="Turn notes into a quiz" onClick={() => onNavigate('quiz')} />
        <QuickLaunch icon={Activity} label="Concept Visualizer" desc="See it, don't just read it" onClick={() => onNavigate('visualizer')} />
        <QuickLaunch icon={Brain} label="Notes Summarizer" desc="Condense a chapter or photo" onClick={() => onNavigate('summarizer')} />
      </div>

      {recent.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Recent</p>
          {recent.map((h) => (
            <div key={h.id} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
              <div className="w-8 h-8 rounded-lg bg-focus-primary/10 flex items-center justify-center shrink-0">
                {h.type === 'quiz' ? <FileText className="w-4 h-4 text-focus-primary" /> : h.type === 'summary' ? <Brain className="w-4 h-4 text-focus-primary" /> : <Activity className="w-4 h-4 text-focus-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{h.title}</p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(h.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLaunch({ icon: Icon, label, desc, onClick }: { icon: any; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 hover:border-focus-primary transition text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-focus-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-focus-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-[11px] text-slate-400">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
}
