import React from 'react';
import { Workflow, FlaskConical } from 'lucide-react';
import { ProcessFlowStep, ExperimentVariables } from '../../types';

// Science & Biology: renders `process_flow` (an ordered cycle/process),
// `variables` (independent/dependent/controlled), and `chemical_equations`.
// Any subset may be present — each section renders independently.
export default function ProcessFlowBlock({
  processFlow,
  variables,
  chemicalEquations,
}: {
  processFlow?: ProcessFlowStep[];
  variables?: ExperimentVariables;
  chemicalEquations?: string[];
}) {
  const hasFlow = processFlow && processFlow.length > 0;
  const hasEquations = chemicalEquations && chemicalEquations.length > 0;
  if (!hasFlow && !variables && !hasEquations) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-4">
      {hasFlow && (
        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
            <Workflow className="w-3.5 h-3.5" /> Process
          </p>
          <div className="space-y-2.5">
            {processFlow!.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-focus-primary/10 text-focus-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{s.step}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variables && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Independent</p>
            <p className="text-slate-700 dark:text-slate-200 font-semibold">{variables.independent}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Dependent</p>
            <p className="text-slate-700 dark:text-slate-200 font-semibold">{variables.dependent}</p>
          </div>
          {variables.controlled && variables.controlled.length > 0 && (
            <div className="col-span-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Controlled</p>
              <p className="text-slate-700 dark:text-slate-200">{variables.controlled.join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {hasEquations && (
        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
            <FlaskConical className="w-3.5 h-3.5" /> Equations
          </p>
          <div className="space-y-1">
            {chemicalEquations!.map((eq, i) => (
              <p
                key={i}
                className="text-xs font-mono text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5 overflow-x-auto"
              >
                {eq}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
