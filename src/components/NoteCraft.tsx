import React, { useEffect, useRef, useState } from 'react';
import { Upload, Camera, Sparkles, RefreshCw, BookOpenCheck, ClipboardCheck, Printer, FileText, CircleStop } from 'lucide-react';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStore';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChangesWarning';
import { jsPDF } from 'jspdf';
import { SummaryData, HistoryItem, RecallCard, StudyFile } from '../types';
import {
  generateContentWithFallback,
  GEMINI_KEYS,
  parseKojluxResponse,
  classifyStudyFile,
  STUDY_FILE_ACCEPT,
} from '../lib/gemini';
import {
  getKojluxResponseSchema,
  KOJLUX_COMPONENT_INSTRUCTIONS,
  KOJLUX_MATH_NOTATION_INSTRUCTIONS,
} from '../../shared/kojluxSchema';
import { makeRecallCard } from '../lib/spacedRepetition';
import { Subject, subjectPromptHint, buildStructuredFieldsClause } from '../lib/subjects';
import TopicPicker, { SegmentedTrack, ui } from './TopicPicker';
import SubjectContentBlocks from './blocks/SubjectContentBlocks';
import EducationalComponents from './blocks/EducationalComponents';
import { MathText } from './blocks/Latex';
import { renderStructuredContentToPdf } from '../lib/pdfStructuredContent';
import { sanitizeForPdf } from '../lib/pdfTextSanitizer';

interface Props {
  gradeLevel: string;
  scopeId: string;
  isFocusMode: boolean;
  onFocusModeChange: (focused: boolean) => void;
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
  onCreateQuizFromSummary: (summary: SummaryData) => void;
}

export default function NoteCraft({
  gradeLevel,
  scopeId,
  isFocusMode,
  onFocusModeChange,
  onSaveHistory,
  onAddRecallCards,
  onError,
  onCreateQuizFromSummary,
}: Props) {
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
  const DRAFT_KEY = `note_craft_${scopeId}`;
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
      onFocusModeChange(true);
    }).finally(() => {
      draftHydrated.current = true;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);

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
    onFocusModeChange(false);
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
    onFocusModeChange(true);
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
              schema: '"diagramNodes": [{"label": string}, ...]',
              rule: '"diagramNodes" lists 3-6 short labels for concrete, nameable parts of the system or process. Omit if none genuinely fit.',
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
Keep the overview and key points concise and clear; use only slightly more detail for hard or thorough requests.
${materialClause}
${subjectClause}
${KOJLUX_COMPONENT_INSTRUCTIONS}
${KOJLUX_MATH_NOTATION_INSTRUCTIONS}
${new Date().toISOString()}. Set metadata.subject to "${subject}" and metadata.topic to a concise topic derived from the source material.
Respond ONLY with strict JSON, no markdown fences: {"title": string, "subject": "${subject}", "overview": string, "keyPoints": [string, ...], "glossary": [{"term": string, "definition": string}, ...], "metadata": {"generatedAt": "ISO timestamp", "subject": string, "topic": string, "orchestratorReasoning": string}, "dynamicComponents": [educational component objects]${
        extraField ? `, ${extraField.schema}` : ''
      }${schemaFields}}
${extraField ? `${extraField.rule}\n` : ''}${rules}`;
      parts.push({ text: instructions });

      const response = await generateContentWithFallback(GEMINI_KEYS.summarizer, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: getKojluxResponseSchema('notes'),
        },
      }, {
        mode: 'notes',
        subject,
        topic: textInput.trim() || subject,
      });
      const parsed = parseKojluxResponse<SummaryData>(response.text, 'notes');
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
      onFocusModeChange(false);
      onError('Could not summarize that material. Try a clearer file or more text.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center bg-focus-bg text-slate-900 dark:text-slate-100 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-6">
          <RefreshCw className="w-7 h-7 text-focus-primary animate-spin" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-focus-primary">Building your study session</p>
        <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight">Crafting your notes</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">Your focused workspace will be ready in a moment.</p>
      </div>
    );
  }

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
    <div className={`mx-auto w-full max-w-2xl ${isFocusMode ? 'min-h-[100svh] px-5 pt-10 pb-28' : ''}`}>
      {!summaryData && (
        <div className="space-y-6">
          <div className={ui.frame}>
            <section className={ui.section}>
              <span className={ui.eyebrow}>Source</span>
              <div className={ui.dropzone}>
                {file ? (
                  <div className="space-y-3">
                    {file.kind === 'image' && <img src={file.dataUrl} className="max-h-40 mx-auto rounded-xl object-contain" />}
                    {file.kind === 'pdf' && (
                      <div className="flex items-center justify-center gap-2 text-slate-900 dark:text-slate-400">
                        <FileText className="w-6 h-6 shrink-0" />
                        <span className="text-xs font-bold truncate max-w-[220px]">{file.name}</span>
                      </div>
                    )}
                    {file.kind === 'video' && (
                      <div className="space-y-2">
                        <video src={file.dataUrl} controls className="max-h-40 mx-auto rounded-xl" />
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-400 truncate">{file.name}</p>
                      </div>
                    )}
                    <button type="button" onClick={() => setFile(null)} className={ui.link}>
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-7 h-7 mx-auto text-slate-900 dark:text-slate-400" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-400 leading-relaxed">Add a photo, PDF, or video of your notes or textbook page</p>
                  </div>
                )}
                <div className={ui.btnGroup}>
                  <button type="button" onClick={() => uploadInputRef.current?.click()} className={ui.btnCell}>
                    <Upload className="w-3.5 h-3.5" /> Upload file
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className={ui.btnCell}>
                    <Camera className="w-3.5 h-3.5" /> Take photo
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
            </section>

            <section className={ui.section}>
              <TopicPicker
                subject={subject}
                onSubjectChange={setSubject}
                mode={inputMode}
                onModeChange={setInputMode}
                value={textInput}
                onValueChange={setTextInput}
                hasFile={!!file}
              />
            </section>

            <section className={ui.section}>
              <span className={ui.eyebrow}>Detail level</span>
              <SegmentedTrack
                label="Detail level"
                options={['concise', 'standard', 'thorough'] as const}
                value={detailLevel}
                onChange={setDetailLevel}
              />
            </section>
          </div>

          <button onClick={handleSummarizeClick} disabled={loading} className={ui.ctaFull}>
            {loading ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0" />}
            <span className="leading-none">{loading ? 'Summarizing…' : 'Summarize'}</span>
          </button>
        </div>
      )}

      {summaryData && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className={ui.h1}>{summaryData.title}</h2>
          {!isFocusMode && (
            <div className="flex items-center gap-5 shrink-0 pt-2 print:hidden">
              <button onClick={exportPdf} className={ui.link}>
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={resetNotes} className={ui.link}>
                <RefreshCw className="w-3.5 h-3.5" /> New
              </button>
            </div>
          )}
          </div>

          {/* Dynamic Forms: passage, formulas/solution steps, process flow,
              timeline, tables, and images — whichever are present. */}
          <SubjectContentBlocks data={summaryData} />
          <EducationalComponents components={summaryData.dynamicComponents ?? []} />

          <div className="space-y-3">
            <section className={ui.tile}>
              <span className={ui.eyebrow}>Overview</span>
              <MathText text={summaryData.overview} className="block text-sm text-slate-900 dark:text-slate-400 leading-relaxed" />
            </section>

            {summaryData.diagramNodes && summaryData.diagramNodes.length > 0 && (
              <section className={ui.tile}>
                <span className={ui.eyebrow}>Diagram parts to know</span>
                <div className="flex flex-wrap gap-2">
                  {summaryData.diagramNodes.map((n, i) => (
                    <span key={i} className="inline-flex items-center h-8 px-3 rounded-lg bg-focus-primary/10 text-focus-primary text-[10px] font-bold uppercase tracking-[0.15em]">
                      <MathText text={n.label} />
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-900 dark:text-slate-400 leading-relaxed mt-4">
                  Use these labels to review the main parts of the system.
                </p>
              </section>
            )}

            {summaryData.regions && summaryData.regions.length > 0 && (
              <section className={ui.tile}>
                <span className={ui.eyebrow}>Places</span>
                <div className="space-y-2">
                  {summaryData.regions.map((r, i) => (
                    <div key={i} className="text-sm text-slate-900 dark:text-slate-400">
                      <MathText text={r.name} className="font-bold" />
                      {r.note ? <span> — <MathText text={r.note} /></span> : null}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {summaryData.dataset && summaryData.dataset.series.length > 0 && (
              <section className={`${ui.tile} overflow-x-auto`}>
                <span className={ui.eyebrow}>Data</span>
                <table className="text-xs w-full min-w-[280px] border-collapse text-slate-900 dark:text-slate-400">
                  <thead>
                    <tr>
                      <th className="border-b border-focus-primary/15 px-3 py-2"> </th>
                      {summaryData.dataset.labels.map((l, i) => (
                        <th key={i} className="border-b border-focus-primary/15 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]"><MathText text={l} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.dataset.series.map((s, i) => (
                      <tr key={i}>
                        <td className="border-b border-focus-primary/15 px-3 py-2 font-bold"><MathText text={s.name} /></td>
                        {s.values.map((v, vi) => (
                          <td key={vi} className="border-b border-focus-primary/15 px-3 py-2 tabular-nums">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className={ui.tile}>
              <span className={ui.eyebrow}>Key points</span>
              <div className="space-y-3">
                {summaryData.keyPoints.map((kp, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm text-slate-900 dark:text-slate-400 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-focus-primary mt-2 shrink-0" />
                    <MathText text={kp} />
                  </div>
                ))}
              </div>
            </section>

            {summaryData.glossary?.length > 0 && (
              <section className={ui.tile}>
                <span className={ui.eyebrow}>Glossary</span>
                <div className="space-y-3">
                  {summaryData.glossary.map((g, i) => (
                    <div key={i} className="text-sm text-slate-900 dark:text-slate-400 leading-relaxed">
                      <MathText text={`${g.term}: `} className="font-bold" />
                      <MathText text={g.definition} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {!isFocusMode && <div className="rounded-2xl bg-focus-primary/5 p-5 flex items-center gap-3 print:hidden">
            <BookOpenCheck className="w-5 h-5 text-focus-primary shrink-0" />
            <p className="text-xs text-slate-900 dark:text-slate-400">Key points added to <span className="font-bold">Review</span> for spaced repetition.</p>
          </div>}

          <button
            onClick={() => summaryData && onCreateQuizFromSummary(summaryData)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-focus-primary/5 p-5 text-left transition-colors duration-150 hover:bg-focus-primary/10 print:hidden"
          >
            <span className="flex items-center gap-3 min-w-0">
              <ClipboardCheck className="w-5 h-5 text-focus-primary shrink-0" />
              <span>
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-400">Create a quiz from these notes</span>
                <span className="block text-xs text-slate-900 dark:text-slate-400 mt-0.5">
                  {isFocusMode ? 'End this session and generate a quiz from your summary.' : 'Generate a quiz using this summary.'}
                </span>
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-focus-primary shrink-0">Create quiz</span>
          </button>
        </div>
      )}
      {isFocusMode && summaryData && (
        <button
          onClick={resetNotes}
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-focus-primary px-5 py-3.5 text-sm font-bold text-white shadow-xl shadow-focus-primary/30"
        >
          <CircleStop className="w-4 h-4" /> End
        </button>
      )}
    </div>
  );
}