import React from 'react';
import { Type, FileText } from 'lucide-react';
import { Subject, SUBJECT_OPTIONS } from '../lib/subjects';

// ---------------------------------------------------------------------------
// SubjectChips — a row of tappable subject chips. Used standalone in the
// Visualizer (a chat, where a "topic vs. notes" mode toggle doesn't apply)
// and embedded inside TopicPicker below for Quiz Builder / Notes Summarizer.
// ---------------------------------------------------------------------------
export function SubjectChips({
  subject,
  onChange,
}: {
  subject: Subject;
  onChange: (s: Subject) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-none">
      {SUBJECT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          title={opt.hint}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition whitespace-nowrap ${
            subject === opt.id
              ? 'bg-focus-primary text-white border-focus-primary'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopicPicker — the dedicated topic/notes entry point for Quiz Builder and
// Notes Summarizer, replacing a single plain textarea + a length/punctuation
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
// mode is explicit, so the caller (QuizBuilder/NotesSummarizer) can send an
// entirely different, correctly-phrased instruction to the AI for each case
// instead of guessing.
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
    <div className="space-y-2.5">
      <div>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block mb-1.5">
          Subject
        </span>
        <SubjectChips subject={subject} onChange={onSubjectChange} />
      </div>

      {!hasFile && (
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(
            [
              { id: 'topic' as const, label: 'Describe a topic', icon: Type },
              { id: 'notes' as const, label: 'Paste notes', icon: FileText },
            ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                mode === id
                  ? 'bg-white dark:bg-slate-700 text-focus-primary shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
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
        rows={4}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
      />
    </div>
  );
}
