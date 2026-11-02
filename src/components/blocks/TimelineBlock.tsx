import React from 'react';
import { CalendarClock } from 'lucide-react';
import { TimelineEvent } from '../../types';
import { MathText } from './Latex';

// Geography & History: a vertical graphic timeline for `timeline` events.
export default function TimelineBlock({ timeline }: { timeline?: TimelineEvent[] }) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-3.5">
        <CalendarClock className="w-3.5 h-3.5" /> Timeline
      </p>
      <div className="relative pl-4 space-y-4 before:absolute before:left-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
        {timeline.map((t, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-focus-primary ring-4 ring-white dark:ring-slate-900" />
            <MathText text={t.date} className="block text-[11px] font-bold text-focus-primary" />
            <MathText text={t.event} className="block text-xs font-bold text-slate-800 dark:text-slate-100" />
            <MathText text={t.significance} className="block text-xs text-slate-500 dark:text-slate-400" />
          </div>
        ))}
      </div>
    </div>
  );
}
