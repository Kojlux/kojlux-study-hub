import React from 'react';
import { Sigma } from 'lucide-react';
import { SolutionStep } from '../../types';
import { BlockMath } from './Latex';

// Math & Physics: renders `formulas` (clean LaTeX strings) and
// `solution_steps` (an ordered worked solution/proof) via KaTeX. Used by
// both Quiz Builder and NoteCraft through SubjectContentBlocks.
export default function MathBlock({
  formulas,
  solutionSteps,
}: {
  formulas?: string[];
  solutionSteps?: SolutionStep[];
}) {
  const hasFormulas = formulas && formulas.length > 0;
  const hasSteps = solutionSteps && solutionSteps.length > 0;
  if (!hasFormulas && !hasSteps) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <Sigma className="w-3.5 h-3.5" /> Formulas &amp; Working
      </p>

      {hasFormulas && (
        <div className="space-y-1.5">
          {formulas!.map((f, i) => (
            <BlockMath key={i} latex={f} />
          ))}
        </div>
      )}

      {hasSteps && (
        <ol className="space-y-3 list-decimal list-outside pl-4">
          {solutionSteps!.map((s, i) => (
            <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
              <span>{s.step}</span>
              {s.latex && <BlockMath latex={s.latex} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
