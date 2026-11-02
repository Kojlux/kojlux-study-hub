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

const MATH_DELIMITERS = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
const SCRIPT_NOTATION = /([A-Za-zΑ-Ωα-ω0-9]+)\s*([\^_])\s*(?:\{([^{}]+)\}|\(([^()]+)\)|([A-Za-zΑ-Ωα-ω0-9+-]+))/g;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ';
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₙᵢ';
const SCRIPT_SOURCE = '0123456789+-()ni';

function mapScript(value: string, marker: '^' | '_'): string {
  const target = marker === '^' ? SUPERSCRIPT : SUBSCRIPT;
  return [...value].map((character) => {
    const index = SCRIPT_SOURCE.indexOf(character);
    return index >= 0 ? target[index] : character;
  }).join('');
}

export function formatMathNotationAsUnicode(text: string): string {
  return text
    .replace(/\\\(|\\\)|\\\[|\\\]|\$+/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:times|cdot)\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\pm\b/g, '±')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(SCRIPT_NOTATION, (_match, base: string, marker: '^' | '_', braced?: string, parenthesized?: string, plain?: string) =>
      `${base}${mapScript(braced ?? parenthesized ?? plain ?? '', marker)}`
    )
    .replace(/<=>/g, '⇔')
    .replace(/<->/g, '↔')
    .replace(/->/g, '→')
    .replace(/<-/g, '←')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/ \* /g, ' × ')
    .replace(/(\s)-(?=\s)/g, '$1−')
    .replace(/\^/g, '');
}

function renderPlainNotation(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SCRIPT_NOTATION)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(match[1]);
    parts.push(match[2] === '^'
      ? <sup key={`sup-${index}`}>{match[3] ?? match[4] ?? match[5]}</sup>
      : <sub key={`sub-${index}`}>{match[3] ?? match[4] ?? match[5]}</sub>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return parts.map((part, index) =>
    typeof part === 'string'
      ? part
          .replace(/<=>/g, '⇔')
          .replace(/<->/g, '↔')
          .replace(/->/g, '→')
          .replace(/<-/g, '←')
          .replace(/<=/g, '≤')
          .replace(/>=/g, '≥')
          .replace(/!=/g, '≠')
          .replace(/\\times\b/g, '×')
          .replace(/\\cdot\b/g, '·')
          .replace(/\\div\b/g, '÷')
          .replace(/\\pm\b/g, '±')
          .replace(/\\neq\b/g, '≠')
          .replace(/\\leq?\b/g, '≤')
          .replace(/\\geq?\b/g, '≥')
          .replace(/\\rightarrow\b/g, '→')
          .replace(/\\leftarrow\b/g, '←')
          .replace(/\\pi\b/g, 'π')
          .replace(/ \* /g, ' × ')
          .replace(/(\s)-(?=\s)/g, '$1−')
      : React.cloneElement(part as React.ReactElement, { key: `script-${index}` })
  );
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = text.split(MATH_DELIMITERS);
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        const isMath = segment.startsWith('$$') ||
          segment.startsWith('\\[') ||
          segment.startsWith('\\(') ||
          segment.startsWith('$');
        if (!isMath) {
          return <React.Fragment key={index}>{renderPlainNotation(segment)}</React.Fragment>;
        }
        const latex = segment.startsWith('$$')
          ? segment.slice(2, -2)
          : segment.startsWith('\\[')
            ? segment.slice(2, -2)
            : segment.startsWith('\\(')
              ? segment.slice(2, -2)
              : segment.slice(1, -1);
        return <InlineMath key={index} latex={latex} />;
      })}
    </span>
  );
}
