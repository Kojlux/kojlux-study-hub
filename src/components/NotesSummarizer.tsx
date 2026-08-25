import React, { useRef, useState } from 'react';
import { Upload, Camera, Sparkles, RefreshCw, BookOpenCheck, Link2, ChevronDown, ArrowRight, Printer, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { SummaryData, HistoryItem, RecallCard, VisualizationResponse, StudyFile } from '../types';
import {
  generateContentWithFallback,
  GEMINI_KEYS,
  parseJsonResponse,
  classifyStudyFile,
  STUDY_FILE_ACCEPT,
} from '../lib/gemini';
import { makeRecallCard } from '../lib/spacedRepetition';

interface Props {
  gradeLevel: string;
  history: HistoryItem[];
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onGoToVisualizer: () => void;
}

export default function NotesSummarizer({ gradeLevel, history, onSaveHistory, onAddRecallCards, onError, onGoToVisualizer }: Props) {
  const [file, setFile] = useState<StudyFile | null>(null);
  const [textInput, setTextInput] = useState('');
  const [detailLevel, setDetailLevel] = useState<'concise' | 'standard' | 'thorough'>('standard');
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const [linkerOpen, setLinkerOpen] = useState(false);
  const [linkerBusy, setLinkerBusy] = useState<string | null>(null); // id of diagram currently being linked
  const [linkedResults, setLinkedResults] = useState<Record<string, { prompt: string; answer: string }[]>>({});

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const visualizationHistory = history.filter((h) => h.type === 'visualization');

  const handleFile = (selected: File) => {
    const kind = classifyStudyFile(selected);
    if (!kind) {
      onError("That file type isn't supported yet — try a photo, PDF, or video.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFile({ dataUrl: reader.result as string, mimeType: selected.type, kind, name: selected.name });
    reader.readAsDataURL(selected);
  };

  const summarize = async () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or paste some text first.');
      return;
    }
    setLoading(true);
    setSummaryData(null);
    setLinkedResults({});
    try {
      const parts: any[] = [];
      if (file) {
        // gemini-3.6-flash reads images, PDFs, and video all the same way —
        // no separate analysis pass, no second AI job.
        const [, data] = file.dataUrl.split(',');
        parts.push({ inlineData: { mimeType: file.mimeType, data } });
      }
      const instructions = `You are helping a ${gradeLevel} student study. Summarize the study material (file and/or text below) at a "${detailLevel}" level of detail. ${
        textInput.trim() ? `Text material: """${textInput.trim()}"""` : ''
      }
Respond ONLY with strict JSON, no markdown fences: {"title": string, "overview": string, "keyPoints": [string, ...], "glossary": [{"term": string, "definition": string}, ...]}`;
      parts.push({ text: instructions });

      const response = await generateContentWithFallback(GEMINI_KEYS.summarizer, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }],
      });
      const parsed = parseJsonResponse<SummaryData>(response.text);
      setSummaryData(parsed);

      onSaveHistory({
        id: `${Date.now()}`,
        type: 'summary',
        title: parsed.title,
        createdAt: new Date().toISOString(),
        data: parsed,
      });

      // Recall Coach: each key point becomes a short-answer style recall
      // prompt. Key points are often phrased "Term: definition" (e.g. "Nouns:
      // these are naming words") — if we test with the whole string, the
      // prompt ends up quoting the definition back at the student instead of
      // asking about the term. When a key point has that shape, test the
      // term and keep the full sentence as the target answer; otherwise fall
      // back to testing the whole key point as before.
      const cards = parsed.keyPoints.map((kp) => {
        const colonIdx = kp.indexOf(':');
        const looksLikeTermDefinition = colonIdx > 0 && colonIdx < 40;
        const term = looksLikeTermDefinition ? kp.slice(0, colonIdx).trim() : null;
        return makeRecallCard({
          sourceType: 'summary',
          sourceTitle: parsed.title,
          prompt: term ? `In your own words, explain: ${term}` : `In your own words, explain: ${kp}`,
          answer: kp,
          image: file?.kind === 'image' ? file.dataUrl : undefined,
        });
      });
      onAddRecallCards(cards);
    } catch (err) {
      console.error(err);
      onError('Could not summarize that material. Try a clearer file or more text.');
    } finally {
      setLoading(false);
    }
  };

  // Concept Linker: dual coding. Pairs this text summary with a diagram the
  // student already generated in the Visualizer, and asks Gemini to write
  // questions that force the student to connect the visual and the verbal —
  // e.g. "label this part of the diagram, then explain why it matters."
  const runConceptLinker = async (viz: HistoryItem) => {
    if (!summaryData) return;
    setLinkerBusy(viz.id);
    try {
      const vizData = viz.data as VisualizationResponse;
      const prompt = `A student has both a text summary and a visual diagram on related material. Write 3 short "dual-coding" recall questions that require connecting the diagram to the written explanation (e.g. asking the student to identify a labeled step in the diagram AND explain its significance from the summary). Keep each question to one or two sentences, and give a concise model answer for each.

Summary title: "${summaryData.title}"
Summary key points: ${summaryData.keyPoints.join('; ')}

Diagram title: "${vizData.title}" (type: ${vizData.type})
Diagram steps: ${vizData.steps.map((s, i) => `(${i + 1}) ${s.label} — ${s.explanation}`).join('; ')}

Respond ONLY with strict JSON: {"questions": [{"prompt": string, "answer": string}, ...]}`;

      const response = await generateContentWithFallback(GEMINI_KEYS.recallCoach, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const parsed = parseJsonResponse<{ questions: { prompt: string; answer: string }[] }>(response.text);
      const cards = parsed.questions.map((q) =>
        makeRecallCard({
          sourceType: 'concept-link',
          sourceTitle: `${summaryData.title} × ${vizData.title}`,
          prompt: q.prompt,
          answer: q.answer,
          image: file?.kind === 'image' ? file.dataUrl : undefined,
        })
      );
      onAddRecallCards(cards);
      setLinkedResults((prev) => ({ ...prev, [viz.id]: parsed.questions }));
    } catch (err) {
      console.error(err);
      onError('Could not link this summary to that diagram — try again.');
    } finally {
      setLinkerBusy(null);
    }
  };

  // Builds an actual downloadable PDF of the summary — window.print() on this
  // screen used to print blank pages because the app shell is a fixed,
  // scrollable mobile layout that doesn't reflow into a print stylesheet.
  // jsPDF draws the content directly onto PDF pages instead, so it always
  // comes out right regardless of what's on screen or scrolled off it.
  const exportPdf = () => {
    if (!summaryData) return;
    const pdf = new jsPDF();
    let y = 20;

    const ensureSpace = (needed: number) => {
      if (y + needed > 280) {
        pdf.addPage();
        y = 20;
      }
    };

    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(summaryData.title, 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8 + 4;

    pdf.setFontSize(11);
    const overviewLines = pdf.splitTextToSize(summaryData.overview, 180);
    ensureSpace(overviewLines.length * 6);
    pdf.text(overviewLines, 15, y);
    y += overviewLines.length * 6 + 8;

    ensureSpace(10);
    pdf.setFontSize(13);
    pdf.text('Key Points', 15, y);
    y += 8;
    pdf.setFontSize(11);
    summaryData.keyPoints.forEach((kp) => {
      const lines = pdf.splitTextToSize(`•  ${kp}`, 175);
      ensureSpace(lines.length * 6);
      pdf.text(lines, 15, y);
      y += lines.length * 6 + 2;
    });

    if (summaryData.glossary?.length > 0) {
      y += 4;
      ensureSpace(10);
      pdf.setFontSize(13);
      pdf.text('Glossary', 15, y);
      y += 8;
      pdf.setFontSize(11);
      summaryData.glossary.forEach((g) => {
        const lines = pdf.splitTextToSize(`${g.term}: ${g.definition}`, 175);
        ensureSpace(lines.length * 6);
        pdf.text(lines, 15, y);
        y += lines.length * 6 + 2;
      });
    }

    pdf.save(`${summaryData.title.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-5">
      {!summaryData && (
        <>
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center bg-white dark:bg-slate-900 space-y-3">
            {file ? (
              <div className="space-y-2">
                {file.kind === 'image' && <img src={file.dataUrl} className="max-h-40 mx-auto rounded-lg object-contain" />}
                {file.kind === 'pdf' && (
                  <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                    <FileText className="w-6 h-6 shrink-0" />
                    <span className="text-xs font-semibold truncate max-w-[220px]">{file.name}</span>
                  </div>
                )}
                {file.kind === 'video' && (
                  <div className="space-y-2">
                    <video src={file.dataUrl} controls className="max-h-40 mx-auto rounded-lg" />
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{file.name}</p>
                  </div>
                )}
                <button type="button" onClick={() => setFile(null)} className="text-[11px] font-bold text-slate-400 hover:text-rose-500">
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-slate-400">
                <Upload className="w-6 h-6 mx-auto" />
                <p className="text-xs font-semibold">Add a photo, PDF, or video of your notes or textbook page</p>
              </div>
            )}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-focus-primary transition"
              >
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-focus-primary transition"
              >
                <Camera className="w-3.5 h-3.5" /> Take Photo
              </button>
            </div>
            {/* Upload from files — image, PDF, or video; no capture attribute so mobile browsers offer the full picker, not just the camera */}
            <input
              ref={uploadInputRef}
              type="file"
              accept={STUDY_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {/* Take a new photo — capture="environment" opens the camera directly. Camera capture is still photo-only. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or paste notes / a topic here…"
            rows={4}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
          />

          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1.5">Detail level</span>
            <div className="flex gap-1.5">
              {(['concise', 'standard', 'thorough'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDetailLevel(d)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold capitalize border ${
                    detailLevel === d ? 'bg-focus-primary text-white border-focus-primary' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={summarize}
            disabled={loading}
            className="w-full py-3.5 bg-focus-primary hover:bg-focus-primary-dark text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Summarizing…' : 'Summarize'}
          </button>
        </>
      )}

      {summaryData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-slate-900 dark:text-white">{summaryData.title}</h2>
            <div className="flex items-center gap-3 shrink-0 print:hidden">
              <button
                onClick={exportPdf}
                className="text-xs text-slate-400 hover:text-focus-primary font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={() => { setSummaryData(null); setFile(null); setTextInput(''); }} className="text-xs text-focus-primary font-bold flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> New
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{summaryData.overview}</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Key points</p>
            {summaryData.keyPoints.map((kp, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-focus-primary mt-1.5 shrink-0" />
                <span>{kp}</span>
              </div>
            ))}
          </div>

          {summaryData.glossary?.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Glossary</p>
              {summaryData.glossary.map((g, i) => (
                <div key={i}>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{g.term}: </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{g.definition}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-focus-primary/5 dark:bg-focus-primary/10 border border-focus-primary/20 rounded-2xl p-4 flex items-center gap-2.5 print:hidden">
            <BookOpenCheck className="w-4.5 h-4.5 text-focus-primary shrink-0" />
            <p className="text-xs text-slate-600 dark:text-slate-300">Key points added to <span className="font-bold text-focus-primary">Review</span> for spaced repetition.</p>
          </div>

          {/* Concept Linker */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden print:hidden">
            <button
              onClick={() => setLinkerOpen((o) => !o)}
              className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Link2 className="w-4 h-4 text-focus-primary" /> Connect this to a diagram
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${linkerOpen ? 'rotate-180' : ''}`} />
            </button>
            {linkerOpen && (
              <div className="p-4 pt-0 space-y-3 bg-white dark:bg-slate-900">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Studying a picture and its explanation together sticks better than either alone. Pick a diagram
                  you've already built in <span className="font-semibold text-slate-500 dark:text-slate-400">Visualize</span>,
                  and this will write a few questions that ask you to point to a part of that diagram and explain it
                  using this summary. The questions get added to Review, just like everything else.
                </p>
                {visualizationHistory.length === 0 && (
                  <button
                    onClick={onGoToVisualizer}
                    className="w-full text-left px-3.5 py-3 rounded-xl bg-focus-primary/5 border border-focus-primary/20 text-xs font-bold text-focus-primary flex items-center justify-between"
                  >
                    Click here to go to the Visualizer screen
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                )}
                {visualizationHistory.map((v) => {
                  const vizData = v.data as VisualizationResponse;
                  const busy = linkerBusy === v.id;
                  const results = linkedResults[v.id];
                  return (
                    <div key={v.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <button
                        disabled={busy}
                        onClick={() => runConceptLinker(v)}
                        className="w-full text-left px-3.5 py-3 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-3 disabled:opacity-60"
                      >
                        <span>
                          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{v.title}</span>
                          <span className="block text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                            {vizData.type} diagram · {vizData.steps.length} steps
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-focus-primary shrink-0 flex items-center gap-1.5">
                          {busy && <RefreshCw className="w-3 h-3 animate-spin" />}
                          {busy ? 'Writing questions…' : results ? 'Regenerate' : 'Generate questions'}
                        </span>
                      </button>
                      {results && (
                        <div className="p-3.5 pt-3 space-y-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-[11px] font-bold text-focus-sage-dark dark:text-focus-sage">
                            {results.length} question{results.length === 1 ? '' : 's'} added to Review:
                          </p>
                          {results.map((q, i) => (
                            <div key={i} className="text-xs">
                              <p className="font-semibold text-slate-700 dark:text-slate-200">{q.prompt}</p>
                              <p className="text-slate-400 mt-0.5">Answer: {q.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}