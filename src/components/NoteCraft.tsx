import React, { useEffect, useRef, useState } from 'react';
import { Upload, Camera, Sparkles, RefreshCw, BookOpenCheck, ClipboardCheck, Printer, FileText } from 'lucide-react';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStore';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChangesWarning';
import { jsPDF } from 'jspdf';
import { SummaryData, HistoryItem, RecallCard, StudyFile } from '../types';
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
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onCreateQuizFromSummary: (summary: SummaryData) => void;
}

export default function NoteCraft({ gradeLevel, onSaveHistory, onAddRecallCards, onError, onCreateQuizFromSummary }: Props) {
  const [file, setFile] = useState<StudyFile | null>(null);
  const [textInput, setTextInput] = useState('');
  // See TopicPicker.tsx for why this replaced the old length/punctuation
  // guess about whether textInput was a topic or pasted notes.
  const [inputMode, setInputMode] = useState<'topic' | 'notes'>('notes');
  const [subject, setSubject] = useState<Subject>('general');
  const [detailLevel, setDetailLevel] = useState<'concise' | 'standard' | 'thorough'>('standard');
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Session-draft persistence (same pattern as QuizBuilder) ----
  // A generated summary used to live only in memory — a refresh mid-session
  // lost it all. This restores/mirrors it
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
    }>(DRAFT_KEY).then((draft) => {
      if (cancelled || !draft || !draft.summaryData) return;
      setFile(draft.file);
      setTextInput(draft.textInput);
      setInputMode(draft.inputMode);
      setSubject(draft.subject);
      setDetailLevel(draft.detailLevel);
      setSummaryData(draft.summaryData);
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
    saveDraft(DRAFT_KEY, { file, textInput, inputMode, subject, detailLevel, summaryData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryData]);

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
      // Structured fields below render subject-specific study aids — not the
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

          <button
            onClick={() => summaryData && onCreateQuizFromSummary(summaryData)}
            className="w-full flex items-center justify-between gap-3 bg-focus-primary/5 dark:bg-focus-primary/10 border border-focus-primary/20 rounded-2xl p-4 text-left print:hidden"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <ClipboardCheck className="w-4 h-4 text-focus-primary shrink-0" />
              <span>
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Test your knowledge</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Quiz yourself on this summary and check your understanding.</span>
              </span>
            </span>
            <span className="text-[11px] font-bold text-focus-primary shrink-0">Make a quiz</span>
          </button>
        </div>
      )}
    </div>
  );
}