import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Trash2,
  CalendarDays,
  Link2,
} from 'lucide-react';
import { ExamEvent, HistoryItem } from '../types';
import { parseDateOnly, formatDateOnly, daysUntil, makeExamEvent } from '../lib/examReminders';

// Visual "category" tags a student can pick per exam — decoupled from the
// free-text Subject field, so color stays a quick at-a-glance signal on the
// calendar grid rather than something that has to match the subject name.
export const EXAM_COLORS: { key: string; dot: string; ring: string; bg: string }[] = [
  { key: 'primary', dot: 'bg-focus-primary', ring: 'ring-focus-primary', bg: 'bg-focus-primary/10' },
  { key: 'rose', dot: 'bg-rose-500', ring: 'ring-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  { key: 'amber', dot: 'bg-amber-500', ring: 'ring-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { key: 'sky', dot: 'bg-sky-500', ring: 'ring-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' },
  { key: 'emerald', dot: 'bg-emerald-500', ring: 'ring-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { key: 'violet', dot: 'bg-violet-500', ring: 'ring-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
];

export function examColor(colorKey: string) {
  return EXAM_COLORS.find((c) => c.key === colorKey) ?? EXAM_COLORS[0];
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Always 42 cells (6 full weeks) so the grid height never jumps between
// months — some months only need 5 rows, but a stable layout beats a page
// that resizes under the student's thumb every time they page forward.
function buildMonthGrid(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  // Build each cell by adding days onto gridStart itself (not by re-applying
  // the *current* month/year to gridStart's day-of-month number). The old
  // version did `new Date(year, month, gridStart.getDate() + i)`, but once
  // gridStart rolled back into the previous month (true for almost every
  // month — only ones starting on a Sunday avoid it), gridStart.getDate()
  // is a day number that belongs to that previous month, not `month`. Re­
  // combining it with `month` silently produced the wrong calendar date for
  // every cell from that point on — so taps landed on a different day than
  // the one displayed, and exams looked like they were on the wrong date.
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

interface Props {
  exams: ExamEvent[];
  history: HistoryItem[];
  onAddExam: (exam: ExamEvent) => void;
  onUpdateExam: (exam: ExamEvent) => void;
  onDeleteExam: (id: string) => void;
  // Set from ProfileScreen's "Upcoming Exams" list when the student taps an
  // entry there, so Calendar opens straight to that day instead of always
  // landing on today.
  initialDate?: string | null;
}

export default function CalendarScreen({ exams, history, onAddExam, onUpdateExam, onDeleteExam, initialDate }: Props) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => (initialDate ? parseDateOnly(initialDate) : today));
  const [selectedDate, setSelectedDate] = useState<string>(() => initialDate || formatDateOnly(today));
  const [sheetExam, setSheetExam] = useState<ExamEvent | 'new' | null>(null);

  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamEvent[]>();
    for (const exam of exams) {
      const list = map.get(exam.date) ?? [];
      list.push(exam);
      map.set(exam.date, list);
    }
    return map;
  }, [exams]);

  const gridDays = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const todayStr = formatDateOnly(today);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedExams = examsByDate.get(selectedDate) ?? [];

  const goToMonth = (delta: number) => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const selectDay = (day: Date) => {
    const key = formatDateOnly(day);
    setSelectedDate(key);
    if (day.getMonth() !== viewDate.getMonth()) setViewDate(new Date(day.getFullYear(), day.getMonth(), 1));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => goToMonth(-1)}
          className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
        <button
          onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="text-sm font-black text-slate-900 dark:text-white"
        >
          {monthLabel}
        </button>
        <button
          onClick={() => goToMonth(1)}
          className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      <div>
        <div className="grid grid-cols-7 mb-1.5">
          {WEEKDAY_LABELS.map((w, i) => (
            <p key={i} className="text-center text-[10px] font-bold text-slate-400 uppercase">
              {w}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((day, i) => {
            const key = formatDateOnly(day);
            const inMonth = day.getMonth() === viewDate.getMonth();
            const isToday = key === todayStr;
            const isSelected = key === selectedDate;
            const dayExams = examsByDate.get(key) ?? [];
            return (
              <button
                key={i}
                onClick={() => selectDay(day)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition ${
                  isSelected
                    ? 'bg-focus-primary text-white'
                    : isToday
                    ? 'bg-focus-primary/10 text-focus-primary'
                    : inMonth
                    ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'text-slate-300 dark:text-slate-700'
                }`}
              >
                <span className="text-xs font-bold">{day.getDate()}</span>
                {dayExams.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    {dayExams.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : examColor(e.color).dot}`}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            {parseDateOnly(selectedDate).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <button onClick={() => setSheetExam('new')} className="flex items-center gap-1 text-[11px] font-bold text-focus-primary">
            <Plus className="w-3.5 h-3.5" /> Add Exam
          </button>
        </div>

        {selectedExams.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center">
            <CalendarDays className="w-5 h-5 text-slate-300 dark:text-slate-700 mx-auto mb-1.5" />
            <p className="text-[11px] text-slate-400">No exams on this day yet.</p>
          </div>
        ) : (
          selectedExams.map((exam) => {
            const linked = exam.linkedHistoryId ? history.find((h) => h.id === exam.linkedHistoryId) : undefined;
            return (
              <button
                key={exam.id}
                onClick={() => setSheetExam(exam)}
                className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-3"
              >
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${examColor(exam.color).dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{exam.title}</p>
                  {exam.subject && <p className="text-[11px] text-slate-400">{exam.subject}</p>}
                  {exam.notes && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{exam.notes}</p>}
                  {linked && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-focus-primary bg-focus-primary/10 rounded-full px-2 py-0.5">
                      <Link2 className="w-2.5 h-2.5" /> {linked.title}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {sheetExam && (
        <ExamSheet
          exam={sheetExam === 'new' ? null : sheetExam}
          defaultDate={selectedDate}
          history={history}
          onClose={() => setSheetExam(null)}
          onSave={(exam) => {
            if (sheetExam === 'new') onAddExam(exam);
            else onUpdateExam(exam);
            setSheetExam(null);
          }}
          onDelete={
            sheetExam !== 'new'
              ? () => {
                  onDeleteExam(sheetExam.id);
                  setSheetExam(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ExamSheet({
  exam,
  defaultDate,
  history,
  onClose,
  onSave,
  onDelete,
}: {
  exam: ExamEvent | null;
  defaultDate: string;
  history: HistoryItem[];
  onClose: () => void;
  onSave: (exam: ExamEvent) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? defaultDate);
  const [subject, setSubject] = useState(exam?.subject ?? '');
  const [color, setColor] = useState(exam?.color ?? EXAM_COLORS[0].key);
  const [notes, setNotes] = useState(exam?.notes ?? '');
  const [linkedHistoryId, setLinkedHistoryId] = useState(exam?.linkedHistoryId ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Only quizzes and summaries are meaningful "study materials" to link —
  // a saved diagram doesn't really work as something to "study for" an exam
  // the same way, so it's left out of the picker.
  const linkable = history.filter((h) => h.type === 'quiz' || h.type === 'summary');

  const canSave = title.trim().length > 0 && date.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    if (exam) {
      onSave({
        ...exam,
        title: title.trim(),
        date,
        subject: subject.trim() || undefined,
        color,
        notes: notes.trim() || undefined,
        linkedHistoryId: linkedHistoryId || undefined,
        // Moving an exam to a new date (or editing it before the old
        // reminder fired) means the old reminder instant may no longer
        // apply — re-arm it so the 1-day-before check re-evaluates against
        // whatever the date is now.
        reminderSent: exam.date === date ? exam.reminderSent : false,
      });
    } else {
      onSave(
        makeExamEvent({
          title: title.trim(),
          date,
          subject: subject.trim() || undefined,
          color,
          notes: notes.trim() || undefined,
          linkedHistoryId: linkedHistoryId || undefined,
        })
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-md mx-auto min-h-screen px-5 pt-6 pb-10 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{exam ? 'Edit Exam' : 'New Exam'}</p>
          <div className="w-9" />
        </div>

        <div className="space-y-5 flex-1">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Math Midterm"
              className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-focus-primary"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-focus-primary"
            />
            <p className="text-[10px] text-slate-400 mt-1">We'll remind you to study the evening before.</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Subject (optional)</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Algebra II"
              className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-focus-primary"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Color tag</label>
            <div className="flex gap-2.5 mt-1.5">
              {EXAM_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  aria-label={c.key}
                  className={`w-8 h-8 rounded-full ${c.dot} ${color === c.key ? `ring-2 ring-offset-2 dark:ring-offset-slate-950 ${c.ring}` : ''}`}
                />
              ))}
            </div>
          </div>

          {linkable.length > 0 && (
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Link study material (optional)</label>
              <select
                value={linkedHistoryId}
                onChange={(e) => setLinkedHistoryId(e.target.value)}
                className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-focus-primary"
              >
                <option value="">None</option>
                {linkable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.type === 'quiz' ? '📝 ' : '📄 '}
                    {h.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Chapters 4–6, bring a calculator"
              rows={3}
              className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
            />
          </div>
        </div>

        <div className="pt-5 space-y-2.5">
          {confirmingDelete ? (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-400 text-center">Delete this exam? This can't be undone.</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white">
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="w-full py-3.5 rounded-2xl bg-focus-primary text-white text-sm font-bold disabled:opacity-40 transition"
              >
                Save Exam
              </button>
              {onDelete && (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Exam
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}