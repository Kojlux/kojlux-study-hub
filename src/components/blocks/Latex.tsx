import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Wrapped in try/catch: a malformed LaTeX string from the model should
// degrade to plain text instead of throwing and blanking the whole screen.
function renderLatex(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode, strict: false });
  } catch {
    return expr;
  }
}

export function BlockMath({ latex }: { latex: string }) {
  const html = useMemo(() => renderLatex(latex, true), [latex]);
  // overflow-x-auto: long expressions (matrices, long fractions) scroll
  // horizontally on narrow screens instead of overflowing/clipping.
  return <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function InlineMath({ latex }: { latex: string }) {
  const html = useMemo(() => renderLatex(latex, false), [latex]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
