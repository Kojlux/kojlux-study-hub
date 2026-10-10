import { CheckCircle2, Printer, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { HistoryItem, QuizData, SummaryData, VisualizationResponse } from '../../types';

// ---------------------------------------------------------------------------
// History detail modal (unchanged behavior — print/export + read-only views)
// ---------------------------------------------------------------------------

function drawQuizPdf(pdf: jsPDF, data: QuizData) {
  let y = 20;
  pdf.setFontSize(16);
  pdf.text(data.title, 15, y);
  y += 10;
  pdf.setFontSize(11);
  data.questions.forEach((q, i) => {
    if (y > 270) {
      pdf.addPage();
      y = 20;
    }
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

function drawSummaryPdf(pdf: jsPDF, data: SummaryData) {
  let y = 20;
  const ensureSpace = (needed: number) => {
    if (y + needed > 280) {
      pdf.addPage();
      y = 20;
    }
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

export function HistoryDetailModal({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const isPrintable = item.type === 'quiz' || item.type === 'summary';

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