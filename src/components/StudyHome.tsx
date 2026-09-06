import React, { useEffect, useState } from 'react';
import { Brain, FileText, Link2, Activity, Flame, ChevronRight, Clock, X, CheckCircle2, Printer, Award, LockKeyhole } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { HistoryItem, QuizData, SummaryData, VisualizationResponse } from '../types';

interface Props {
  username: string;
  streak: number;
  activityDays: string[];
  history: HistoryItem[];
  onNavigate: (tab: 'quiz' | 'community' | 'summarizer' | 'review') => void;
}

export default function StudyHome({ username, streak, activityDays, history, onNavigate }: Props) {
  const recent = history.slice(0, 4);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [celebration, setCelebration] = useState<number | null>(null);

  useEffect(() => {
    const shown = Number(localStorage.getItem('kojlux_last_badge_milestone') || 0);
    const earned = earnedMilestone(activityDays.length);
    if (earned > shown) {
      localStorage.setItem('kojlux_last_badge_milestone', String(earned));
      setCelebration(earned);
    }
  }, [activityDays.length]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Welcome back</p>
        <h1 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{username || 'Student'}</h1>
      </div>

      <button onClick={() => setShowProgress(true)} className="w-full text-left bg-focus-primary rounded-2xl p-4 text-white shadow-sm shadow-focus-primary/20">
        <Flame className="w-5 h-5 text-white/80" />
        <p className="text-2xl font-black mt-2">{streak}</p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Day streak</p>
        <p className="text-[10px] text-white/70 mt-2">Tap to view badges and progress</p>
      </button>

      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Study tools</p>
        <div className="grid grid-cols-3 gap-2.5">
          <ToolHex
            icon={FileText}
            label="Quiz Builder"
            colorClasses="bg-focus-primary/10 text-focus-primary"
            onClick={() => onNavigate('quiz')}
          />
          <ToolHex
            icon={Link2}
            label="Study materials"
            colorClasses="bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
            onClick={() => onNavigate('community')}
          />
          <ToolHex
            icon={Brain}
            label="Summarizer"
            colorClasses="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
            onClick={() => onNavigate('summarizer')}
          />
        </div>
      </div>

      {recent.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Recent</p>
          {recent.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              className="w-full flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 hover:border-focus-primary transition text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-focus-primary/10 flex items-center justify-center shrink-0">
                {h.type === 'quiz' ? <FileText className="w-4 h-4 text-focus-primary" /> : h.type === 'summary' ? <Brain className="w-4 h-4 text-focus-primary" /> : <Activity className="w-4 h-4 text-focus-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{h.title}</p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(h.createdAt).toLocaleDateString()}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {selected && <HistoryDetailModal item={selected} onClose={() => setSelected(null)} />}
      {showProgress && <BadgeProgressModal streak={streak} activityDays={activityDays} onClose={() => setShowProgress(false)} />}
      {celebration !== null && <BadgeCelebration milestone={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}

const BADGE_NAMES = ['First Spark', 'Five-Day Focus', 'Ten-Day Momentum', 'Fifteen-Day Scholar', 'Twenty-Day Mastery'];
function earnedMilestone(streak: number) {
  return streak >= 5 ? Math.floor(streak / 5) * 5 : streak >= 1 ? 1 : 0;
}
function milestoneList(streak: number) {
  const highest = Math.max(1, Math.ceil(Math.max(streak, 1) / 5) * 5);
  return [1, ...Array.from({ length: highest / 5 }, (_, i) => (i + 1) * 5)];
}
function badgeName(day: number) {
  return BADGE_NAMES[Math.min(Math.floor(day / 5), BADGE_NAMES.length - 1)] || `${day}-Day Creator`;
}
function BadgeProgressModal({ streak, activityDays, onClose }: { streak: number; activityDays: string[]; onClose: () => void }) {
  return <div className="fixed inset-0 z-[210] bg-slate-950/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 space-y-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Your progress</p><h2 className="text-xl font-black text-slate-900 dark:text-white">Creator streak</h2></div><button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800"><X className="w-4 h-4 mx-auto" /></button></div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Create a quiz, make a summary, or share study material each day to keep moving forward.</p>
      <div className="space-y-2">{milestoneList(activityDays.length).map((day) => { const earned = activityDays.length >= day; return <div key={day} className={`flex items-center gap-3 rounded-2xl p-3 border ${earned ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800'}`}><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${earned ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{earned ? <Award className="w-5 h-5" /> : <LockKeyhole className="w-4 h-4" />}</div><div className="flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{badgeName(day)}</p><p className="text-[10px] text-slate-400">Day {day} badge</p></div>{earned && <span className="text-[10px] font-bold text-amber-600">Earned</span>}</div>; })}</div>
      <p className="text-[10px] text-slate-400">{activityDays.length} active creation day{activityDays.length === 1 ? '' : 's'} recorded.</p>
    </div>
  </div>;
}
function BadgeCelebration({ milestone, onClose }: { milestone: number; onClose: () => void }) {
  return <div className="fixed inset-0 z-[220] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-5" onClick={onClose}><div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-7 text-center overflow-hidden" onClick={(e) => e.stopPropagation()}><div className="badge-fire"><Flame className="w-14 h-14 text-white mx-auto" /></div><Award className="w-10 h-10 text-amber-400 mx-auto -mt-2" /><p className="text-[11px] font-bold uppercase tracking-widest text-amber-500 mt-3">Badge unlocked</p><h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{badgeName(milestone)}</h2><p className="text-xs text-slate-500 mt-2">You reached day {milestone}. Keep creating to unlock the next one.</p><button onClick={onClose} className="mt-5 w-full rounded-xl bg-focus-primary py-3 text-xs font-bold text-white">Keep studying</button></div></div>;
}

function ToolHex({ icon: Icon, label, colorClasses, onClick }: { icon: any; label: string; colorClasses: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group w-full">
      <div
        className={`w-full aspect-square flex flex-col items-center justify-center gap-1.5 px-2 transition-transform duration-150 ease-out group-hover:-translate-y-1 group-active:translate-y-0 group-active:scale-[0.96] ${colorClasses}`}
        style={{ clipPath: 'polygon(50% 2%, 98% 26%, 98% 74%, 50% 98%, 2% 74%, 2% 26%)' }}
      >
        <Icon className="w-5 h-5" />
        <span className="text-[10px] font-bold leading-tight text-center">{label}</span>
      </div>
    </button>
  );
}

// Reopens a history entry read-only, since quizzes/summaries/diagrams don't
// have their own "view saved item" route yet — this shows what's actually
// stored for that entry so tapping Recent isn't a dead end. Opens full-screen
// (rather than a small centered modal) so there's room to actually read a
// quiz or summary, and so it can be printed straight from here.
// Draws a QuizData onto a jsPDF doc as a blank copy (question + blank
// answer lines), same layout QuizBuilder uses for its own export.
function drawQuizPdf(pdf: jsPDF, data: QuizData) {
  let y = 20;
  pdf.setFontSize(16);
  pdf.text(data.title, 15, y);
  y += 10;
  pdf.setFontSize(11);
  data.questions.forEach((q, i) => {
    if (y > 270) { pdf.addPage(); y = 20; }
    const lines = pdf.splitTextToSize(`${i + 1}. ${q.question}`, 180);
    pdf.text(lines, 15, y);
    y += lines.length * 6 + 2;
    if (q.type === 'multiple-choice' && q.options) {
      q.options.forEach((opt, oi) => {
        pdf.text(`   ${String.fromCharCode(65 + oi)}. ${opt}`, 15, y);
        y += 6;
      });
    } else {
      pdf.text('   Answer: _______________________________', 15, y);
      y += 6;
    }
    y += 4;
  });
}

// Draws a SummaryData onto a jsPDF doc — title, overview, key points, glossary.
function drawSummaryPdf(pdf: jsPDF, data: SummaryData) {
  let y = 20;
  const ensureSpace = (needed: number) => {
    if (y + needed > 280) { pdf.addPage(); y = 20; }
  };

  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(data.title, 180);
  pdf.text(titleLines, 15, y);
  y += titleLines.length * 8 + 4;

  pdf.setFontSize(11);
  const overviewLines = pdf.splitTextToSize(data.overview, 180);
  ensureSpace(overviewLines.length * 6);
  pdf.text(overviewLines, 15, y);
  y += overviewLines.length * 6 + 8;

  ensureSpace(10);
  pdf.setFontSize(13);
  pdf.text('Key Points', 15, y);
  y += 8;
  pdf.setFontSize(11);
  data.keyPoints.forEach((kp) => {
    const lines = pdf.splitTextToSize(`•  ${kp}`, 175);
    ensureSpace(lines.length * 6);
    pdf.text(lines, 15, y);
    y += lines.length * 6 + 2;
  });

  if (data.glossary?.length > 0) {
    y += 4;
    ensureSpace(10);
    pdf.setFontSize(13);
    pdf.text('Glossary', 15, y);
    y += 8;
    pdf.setFontSize(11);
    data.glossary.forEach((g) => {
      const lines = pdf.splitTextToSize(`${g.term}: ${g.definition}`, 175);
      ensureSpace(lines.length * 6);
      pdf.text(lines, 15, y);
      y += lines.length * 6 + 2;
    });
  }
}

function HistoryDetailModal({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  // Only quizzes and summaries are "printable" recents — a diagram is mostly
  // visual and doesn't translate to a print-friendly page the same way.
  const isPrintable = item.type === 'quiz' || item.type === 'summary';

  // Generates a real downloadable PDF instead of calling window.print() on
  // this modal — the modal is a fixed-position full-screen overlay, and
  // browser print on that layout was coming out as blank pages. jsPDF draws
  // the content straight onto PDF pages, so it prints correctly every time.
  const exportPdf = () => {
    const pdf = new jsPDF();
    if (item.type === 'quiz') drawQuizPdf(pdf, item.data as QuizData);
    else if (item.type === 'summary') drawSummaryPdf(pdf, item.data as SummaryData);
    else return;
    pdf.save(`${item.title.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-950 overflow-y-auto print:static print:inset-auto print:overflow-visible">
      <div className="max-w-md mx-auto min-h-screen px-5 pt-6 pb-10">
        <div className="flex items-center justify-between gap-3 mb-5 print:hidden">
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
          {isPrintable && (
            <button
              onClick={exportPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-focus-primary transition"
            >
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          )}
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {item.type === 'quiz' ? 'Quiz' : item.type === 'summary' ? 'Summary' : 'Diagram'}
          </p>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{item.title}</h2>
        </div>

        {item.type === 'quiz' && <QuizDetail data={item.data as QuizData} />}
        {item.type === 'summary' && <SummaryDetail data={item.data as SummaryData} />}
        {item.type === 'visualization' && <VisualizationDetail data={item.data as VisualizationResponse} />}
      </div>
    </div>
  );
}

function QuizDetail({ data }: { data: QuizData }) {
  return (
    <div className="space-y-3">
      {data.questions.map((q, i) => (
        <div key={i} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">{i + 1}. {q.question}</p>
          <p className="text-[11px] text-focus-sage-dark dark:text-focus-sage font-semibold flex items-start gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {q.correctAnswer}
          </p>
          {q.explanation && <p className="text-[11px] text-slate-400 mt-1 italic">{q.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

function SummaryDetail({ data }: { data: SummaryData }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{data.overview}</p>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Key points</p>
        {data.keyPoints.map((kp, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-focus-primary mt-1.5 shrink-0" />
            <span>{kp}</span>
          </div>
        ))}
      </div>
      {data.glossary?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Glossary</p>
          {data.glossary.map((g, i) => (
            <div key={i} className="text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100">{g.term}: </span>
              <span className="text-slate-500 dark:text-slate-400">{g.definition}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisualizationDetail({ data }: { data: VisualizationResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
        {data.type}{data.subject ? ` · ${data.subject}` : ''}
      </p>
      {data.steps.map((s, i) => (
        <div key={i} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{i + 1}. {s.label}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.explanation}</p>
        </div>
      ))}
    </div>
  );
}