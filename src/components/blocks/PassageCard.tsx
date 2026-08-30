import React from 'react';
import { PassageType } from '../../types';

const LABELS: Record<PassageType, string> = {
  reading_passage: 'Reading Passage',
  context_story: 'Story',
  poem: 'Poem',
};

// English & Literature: a dedicated, scrollable passage card — kept
// isolated from the summary/questions per the spec. Replaces the identical
// passage JSX that used to be duplicated across QuizBuilder's two views and
// NoteCraft's results view.
export default function PassageCard({ passage, passageType }: { passage?: string; passageType?: PassageType }) {
  if (!passage) return null;
  const label = passageType ? LABELS[passageType] : 'Reading Passage';

  return (
    <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/60 rounded-2xl overflow-hidden">
      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide px-4 pt-4 pb-1.5">
        {label}
      </p>
      <div className="max-h-64 overflow-y-auto px-4 pb-4">
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{passage}</p>
      </div>
    </div>
  );
}
