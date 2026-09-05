import React, { useEffect, useRef, useState } from 'react';
import { Upload, Camera, Sparkles, RefreshCw, BookOpenCheck, Link2, ChevronDown, ArrowRight, Printer, FileText } from 'lucide-react';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStore';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChangesWarning';
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
import { Subject, subjectPromptHint, buildStructuredFieldsClause } from '../lib/subjects';
import TopicPicker from './TopicPicker';
import SubjectContentBlocks from './blocks/SubjectContentBlocks';
import { renderStructuredContentToPdf } from '../lib/pdfStructuredContent';
import { sanitizeForPdf } from '../lib/pdfTextSanitizer';

interface Props {
  gradeLevel: string;
  history: HistoryItem[];
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onGoToVisualizer: () => void;
}

export default function NoteCraft({ gradeLevel, history, onSaveHistory, onAddRecallCards, onError, onGoToVisualizer }: Props) {
  const [file, setFile] = useState<StudyFile | null>(null);
  const [textInput, setTextInput] = useState('');
  // See TopicPicker.tsx for why this replaced the old length/punctuation
  // guess about whether textInput was a topic or pasted notes.
  const [inputMode, setInputMode] = useState<'topic' | 'notes'>('notes');
  const [subject, setSubject] = useState<Subject>('general');
  const [detailLevel, setDetailLevel] = useState<'concise' | 'standard' | 'thorough'>('standard');
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const [linkerOpen, setLinkerOpen] = useState(false);
  const [linkerBusy, setLinkerBusy] = useState<string | null>(null); // id of diagram currently being linked
  const [linkedResults, setLinkedResults] = useState<Record<string, { prompt: string; answer: string }[]>>({});

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const visualizationHistory = history.filter((h) => h.type === 'visualization');

  // ---- Session-draft persistence (same pattern as QuizBuilder) ----
  // A generated summary + any Concept Linker results used to live only in
  // memory — a refresh mid-session lost it all. This restores/mirrors it
  // via IndexedDB so a refresh resumes instead of wiping the screen.
  const DRAFT_KEY = 'note_craft';
  const draftHydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDraft<{
      file: StudyFile | null;
      textInput: string;
      inputMode: 'topic' | 'notes';
      subject: Subject;
      detailLevel: 'concise' | 'standard' | 'thorough';
      summaryData: SummaryData | null;
      linkedResults: Record<string, { prompt: string; answer: string }[]>;
    }>(DRAFT_KEY).then((draft) => {
      if (cancelled || !draft || !draft.summaryData) return;
      setFile(draft.file);
      setTextInput(draft.textInput);
      setInputMode(draft.inputMode);
      setSubject(draft.subject);
      setDetailLevel(draft.detailLevel);
      setSummaryData(draft.summaryData);
      setLinkedResults(draft.linkedResults);
    }).finally(() => {
      draftHydrated.current = true;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftHydrated.current) return;
    if (!summaryData) {
      clearDraft(DRAFT_KEY);
      return;
    }
    saveDraft(DRAFT_KEY, { file, textInput, inputMode, subject, detailLevel, summaryData, linkedResults });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryData, linkedResults]);

  useUnsavedChangesWarning(Boolean(summaryData));

  // Starting over should discard the persisted draft too, not just the
  // in-memory state — otherwise the old summary would silently come back
  // on the next refresh.
  const resetNotes = () => {
    setSummaryData(null);
    setFile(null);
    setTextInput('');
    clearDraft(DRAFT_KEY);
  };

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

  const handleSummarizeClick = () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or describe a topic / paste notes first.');
      return;
    }
    summarize();
  };

  const summarize = async () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or describe a topic / paste notes first.');
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
      // Same explicit topic-vs-notes framing as QuizBuilder — see
      // TopicPicker.tsx and lib/subjects.ts for why. A long topic
      // description is sent verbatim as an instruction, never mistaken for
      // (and never silently reinterpreted as) source material.
      const materialClause = !textInput.trim()
        ? ''
        : file
        ? `Additional focus/instructions from the student: """${textInput.trim()}"""`
        : inputMode === 'topic'
        ? `Summarize this topic (this is an instruction of what to cover, not source text to quote): """${textInput.trim()}"""`
        : `Text material to summarize: """${textInput.trim()}"""`;

      const subjectClause = subjectPromptHint(subject);
      // Visualizer-linking fields: separate from Dynamic Forms below, these
      // exist purely so the Concept Linker / Visualizer can render an
      // interactive diagram/map/chart from a local asset library — not the
      // student-facing structured blocks. Each subject contributes at most
      // one of these.
      const extraField: { schema: string; rule: string } | null =
        subject === 'science'
          ? {
              schema: '"diagramNodes": [{"nodeId": string, "label": string}, ...]',
              rule:
                '"diagramNodes" lists 3-6 concrete, nameable parts of the system/process, with nodeId chosen ONLY from: plant-root, plant-stem, plant-leaf, plant-flower, plant-soil, plant-sun, plant-water, cell-membrane, cell-nucleus, cell-mitochondria, atom-nucleus, atom-electron-orbit, organ-heart, organ-lung, organ-brain, generic-circle, generic-box. Omit the field entirely if none genuinely fit.',
            }
          : subject === 'geography'
          ? {
              schema: '"regions": [{"id": string, "name": string, "lat": number, "lng": number, "note": string}, ...]',
              rule: '"regions" lists 2-6 real places relevant to the material with approximate real coordinates.',
            }
          : subject === 'math'
          ? {
              schema: '"dataset": {"chartType": "bar"|"line"|"scatter", "labels": [string,...], "series": [{"name": string, "values": [number,...]}]}',
              rule: '"dataset" is a small numeric dataset relevant to the material.',
            }
          : null;

      // Dynamic Forms: centralized in lib/subjects.ts so Quiz Builder and
      // NoteCraft always request the same student-facing structured blocks
      // (formulas, timelines, tables, images, etc.) for the same subject.
      const { schemaFields, rules } = buildStructuredFieldsClause(subject);

      const instructions = `You are helping a ${gradeLevel} student study. Summarize the study material (file and/or text below) at a "${detailLevel}" level of detail.
${materialClause}
${subjectClause}
Respond ONLY with strict JSON, no markdown fences: {"title": string, "subject": "${subject}", "overview": string, "keyPoints": [string, ...], "glossary": [{"term": string, "definition": string}, ...]${
        extraField ? `, ${extraField.schema}` : ''
      }${schemaFields}}
${extraField ? `${extraField.rule}\n` : ''}${rules}`;
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
    const titleLines = pdf.splitTextToSize(sanitizeForPdf(summaryData.title), 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8 + 4;

    pdf.setFontSize(11);
    if (summaryData.passage) {
      const passageLines = pdf.splitTextToSize(sanitizeForPdf(summaryData.passage), 180);
      ensureSpace(passageLines.length * 6);
      pdf.text(passageLines, 15, y);
      y += passageLines.length * 6 + 8;
    }
    y = renderStructuredContentToPdf(pdf, summaryData, y, summaryData.title);
    const overviewLines = pdf.splitTextToSize(sanitizeForPdf(summaryData.overview), 180);
    ensureSpace(overviewLines.length * 6);
    pdf.text(overviewLines, 15, y);
    y += overviewLines.length * 6 + 8;

    ensureSpace(10);
    pdf.setFontSize(13);
    pdf.text('Key Points', 15, y);
    y += 8;
    pdf.setFontSize(11);
    summaryData.keyPoints.forEach((kp) => {
      const lines = pdf.splitTextToSize(`•  ${sanitizeForPdf(kp)}`, 175);
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
        const lines = pdf.splitTextToSize(`${sanitizeForPdf(g.term)}: ${sanitizeForPdf(g.definition)}`, 175);
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

          <TopicPicker
            subject={subject}
            onSubjectChange={setSubject}
            mode={inputMode}
            onModeChange={setInputMode}
            value={textInput}
            onValueChange={setTextInput}
            hasFile={!!file}
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
            onClick={handleSummarizeClick}
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
              <button onClick={resetNotes} className="text-xs text-focus-primary font-bold flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> New
              </button>
            </div>
          </div>

          {/* Dynamic Forms: passage, formulas/solution steps, process flow,
              timeline, tables, and images — whichever are present. */}
          <SubjectContentBlocks data={summaryData} />

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{summaryData.overview}</p>
          </div>

          {summaryData.diagramNodes && summaryData.diagramNodes.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Diagram parts to know</p>
              <div className="flex flex-wrap gap-1.5">
                {summaryData.diagramNodes.map((n, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {n.label}
                  </span>
                ))}
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed pt-1">
                Ask the Visualizer to diagram "{summaryData.title}" to see these labeled interactively.
              </p>
            </div>
          )}

          {summaryData.regions && summaryData.regions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Places</p>
              {summaryData.regions.map((r, i) => (
                <div key={i} className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{r.name}</span>
                  {r.note ? <span className="text-slate-400"> — {r.note}</span> : null}
                </div>
              ))}
            </div>
          )}

          {summaryData.dataset && summaryData.dataset.series.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 overflow-x-auto">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Data</p>
              <table className="text-xs w-full min-w-[280px]">
                <thead>
                  <tr>
                    <th className="text-left text-slate-400 font-semibold pb-1"> </th>
                    {summaryData.dataset.labels.map((l, i) => (
                      <th key={i} className="text-left text-slate-400 font-semibold pb-1 px-2">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryData.dataset.series.map((s, i) => (
                    <tr key={i}>
                      <td className="font-bold text-slate-700 dark:text-slate-200 pr-2">{s.name}</td>
                      {s.values.map((v, vi) => (
                        <td key={vi} className="text-slate-600 dark:text-slate-300 px-2">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="md:grid md:grid-cols-2 md:gap-4 md:items-start space-y-4 md:space-y-0">
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
          </div>

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