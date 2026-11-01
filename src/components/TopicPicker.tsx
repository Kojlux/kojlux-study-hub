import React, { useEffect, useRef } from 'react';
import { Type, FileText } from 'lucide-react';
import { Subject, SUBJECT_OPTIONS } from '../lib/subjects';

// ---------------------------------------------------------------------------
// Design tokens — one place for the whole look.
// Rules: theme-aware text, no outlines or divider lines, soft rounded shapes, and
// the purple accent (focus-primary) used only for what is selected, focused
// or the main action — the same language as the Quiz Builder / NoteCraft tab.
// Exported so NoteCraft and QuizBuilder share exactly the same styles.
// ---------------------------------------------------------------------------
export const ui = {
  h1: 'text-3xl font-black tracking-tighter text-slate-900 dark:text-slate-400',
  eyebrow: 'block text-[10px] font-bold tracking-[0.2em] text-slate-900 dark:text-slate-400 uppercase mb-3',
  // Sections are separated by whitespace only — no lines.
  frame: 'space-y-9',
  section: '',
  // Soft tinted tile for grouped content.
  tile: 'rounded-2xl bg-focus-primary/5 p-5 sm:p-6',
  // Upload area: a quiet purple-tinted surface, no outline.
  dropzone: 'rounded-2xl bg-focus-primary/5 px-6 py-9 text-center space-y-6',
  // Standalone secondary button.
  btn:
    'h-11 px-6 rounded-xl bg-focus-primary/5 text-slate-900 dark:text-slate-400 text-[11px] font-bold uppercase tracking-[0.15em] ' +
    'inline-flex items-center justify-center gap-2 transition-all duration-150 hover:bg-focus-primary/10 active:scale-[0.98]',
  // Side-by-side buttons use a white surface in light mode and a dark surface
  // in dark mode.
  btnGroup: 'grid grid-cols-2 gap-3',
  btnCell:
    'h-11 rounded-xl bg-white dark:bg-slate-800 text-black dark:text-slate-100 text-[11px] font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 ' +
    'shadow-[0_1px_3px_rgba(0,0,0,0.10)] transition-all duration-150 hover:shadow-md active:scale-[0.98]',
  // Main action. Add w-full (ctaFull) or flex-1 where it's used.
  cta:
    'h-14 rounded-xl bg-focus-primary text-white text-xs font-bold uppercase tracking-widest ' +
    'inline-flex items-center justify-center gap-2.5 shadow-lg shadow-focus-primary/25 ' +
    'transition-all duration-150 hover:bg-focus-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
  ctaFull:
    'w-full h-14 rounded-xl bg-focus-primary text-white text-xs font-bold uppercase tracking-widest ' +
    'inline-flex items-center justify-center gap-2.5 shadow-lg shadow-focus-primary/25 ' +
    'transition-all duration-150 hover:bg-focus-primary-dark active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
  link:
    'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-400 ' +
    'hover:text-focus-primary transition-colors duration-150',
  // Text inputs: soft tint at rest, theme-aware surface with a purple glow on focus.
  field:
    'w-full rounded-xl bg-focus-primary/5 text-slate-900 dark:text-slate-400 px-4 py-3.5 text-sm leading-relaxed ' +
    'placeholder:text-slate-500 dark:placeholder:text-slate-400 outline-none transition-all duration-150 ' +
    'focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-focus-primary/50 resize-none',
  // Same, for use on top of a tinted tile.
  fieldSolid:
    'w-full rounded-xl bg-white dark:bg-slate-800 text-black dark:text-slate-100 px-4 py-3.5 text-sm leading-relaxed shadow-[0_1px_3px_rgba(0,0,0,0.08)] ' +
    'placeholder:text-black/40 dark:placeholder:text-slate-400 outline-none transition-all duration-150 focus:ring-2 focus:ring-focus-primary/50 resize-none',
  slider:
    'flex-1 h-5 appearance-none bg-transparent cursor-pointer ' +
    '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-focus-primary/15 ' +
    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:-mt-1.5 ' +
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-focus-primary [&::-webkit-slider-thumb]:border-0 ' +
    '[&::-webkit-slider-thumb]:shadow-md ' +
    '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-focus-primary/15 ' +
    '[&::-moz-range-progress]:h-2 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-focus-primary ' +
    '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-focus-primary ' +
    '[&::-moz-range-thumb]:border-0',
} as const;

const SEG_BTN =
  'h-9 px-4 rounded-lg text-[10px] font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-1.5 ' +
  'transition-all duration-150';
const SEG_ON = 'bg-focus-primary text-white shadow-sm';
const SEG_OFF = 'text-slate-900 dark:text-slate-400 hover:bg-focus-primary/10';

// ---------------------------------------------------------------------------
// SegmentedTrack — equal-width options on a soft track. The selected option
// is filled purple with white text, matching the top Quiz Builder/NoteCraft tab.
// ---------------------------------------------------------------------------
export function SegmentedTrack<T extends string>({
  options,
  value,
  onChange,
  label,
  renderOption,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  renderOption?: (opt: T) => React.ReactNode;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 p-1 rounded-xl bg-focus-primary/5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          onClick={() => onChange(opt)}
          className={`${SEG_BTN} ${value === opt ? SEG_ON : SEG_OFF}`}
        >
          {renderOption ? renderOption(opt) : opt}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubjectChips — the subject track. Same stamped look as SegmentedTrack, but
// subjects have different label widths and can overflow narrow screens, so
// the row scrolls horizontally and keeps the selection in view. Used
// standalone in the Visualizer (a chat, where a "topic vs. notes" toggle
// doesn't apply) and embedded in TopicPicker below.
// ---------------------------------------------------------------------------
export function SubjectChips({
  subject,
  onChange,
}: {
  subject: Subject;
  onChange: (s: Subject) => void;
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const firstRun = useRef(true);

  useEffect(() => {
    // Keep the selected option in view, but never yank the page on first paint.
    if (!firstRun.current) {
      btnRefs.current[subject]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    firstRun.current = false;
  }, [subject]);

  return (
    <div role="radiogroup" aria-label="Subject" className="flex gap-1 p-1 overflow-x-auto rounded-xl bg-focus-primary/5 scrollbar-none">
      {SUBJECT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          ref={(el) => {
            btnRefs.current[opt.id] = el;
          }}
          type="button"
          role="radio"
          aria-checked={subject === opt.id}
          onClick={() => onChange(opt.id)}
          title={opt.hint}
          className={`${SEG_BTN} shrink-0 whitespace-nowrap ${subject === opt.id ? SEG_ON : SEG_OFF}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopicPicker — the dedicated topic/notes entry point for Quiz Builder and
// NoteCraft, replacing a single plain textarea + a length/punctuation
// guess (looksLikeTopicPhrase) about what the student meant. Instead the
// student explicitly picks:
//   - "Describe a topic": what to generate material ABOUT (an instruction) —
//     can be as long and detailed as needed, e.g. "the causes of World War
//     One, focusing on alliances and the assassination of Franz Ferdinand".
//   - "Paste notes": actual source material to build FROM (an input).
// This is what actually fixes long topic descriptions being "ignored" —
// previously anything over ~4 words/40 characters was silently treated as
// source material to summarize/quiz FROM rather than a description of what
// to generate, no matter how clearly it read as an instruction. Now the
// mode is explicit, so the caller (QuizBuilder/NoteCraft) can send an
// entirely different, correctly-phrased instruction to the AI for each case
// instead of guessing.
//
// Layout note: this renders its fields bare (no frame of its own). The parent
// screen places it inside a section of its frame.
// ---------------------------------------------------------------------------
interface TopicPickerProps {
  subject: Subject;
  onSubjectChange: (s: Subject) => void;
  mode: 'topic' | 'notes';
  onModeChange: (m: 'topic' | 'notes') => void;
  value: string;
  onValueChange: (v: string) => void;
  hasFile: boolean;
}

const MODE_IDS = ['notes', 'topic'] as const;
const MODE_META = {
  notes: { label: 'Paste notes', icon: FileText },
  topic: { label: 'Describe a topic', icon: Type },
} as const;

export default function TopicPicker({
  subject,
  onSubjectChange,
  mode,
  onModeChange,
  value,
  onValueChange,
  hasFile,
}: TopicPickerProps) {
  return (
    <div className="space-y-8">
      <div>
        <span className={ui.eyebrow}>Subject</span>
        <SubjectChips subject={subject} onChange={onSubjectChange} />
      </div>

      <div>
        <span className={ui.eyebrow}>{hasFile ? 'Focus (optional)' : 'Material'}</span>
        {!hasFile && (
          <div className="mb-4">
            <SegmentedTrack
              label="Input type"
              options={MODE_IDS}
              value={mode}
              onChange={onModeChange}
              renderOption={(id) => {
                const Icon = MODE_META[id].icon;
                return (
                  <>
                    <Icon className="w-3.5 h-3.5 shrink-0" /> {MODE_META[id].label}
                  </>
                );
              }}
            />
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={
            hasFile
              ? 'Optional: add extra instructions or focus areas…'
              : mode === 'topic'
              ? 'Describe what to generate — as much detail as you like, e.g. "the water cycle: evaporation, condensation, precipitation, and collection"'
              : 'Paste your notes or textbook text here…'
          }
          rows={5}
          className={ui.field}
        />
      </div>
    </div>
  );
}