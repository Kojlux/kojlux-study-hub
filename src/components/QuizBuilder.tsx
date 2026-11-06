import React, { useEffect, useRef, useState } from 'react';
import {
  Upload, Camera, Sparkles, CheckCircle, XCircle, RefreshCw, Printer,
  ChevronRight, FileText, Pause,
} from 'lucide-react';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStore';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChangesWarning';
import { jsPDF } from 'jspdf';
import { QuizData, QuizQuestion, EvaluationResult, HistoryItem, StudyFile } from '../types';
import {
  generateContentWithFallback,
  GEMINI_KEYS,
  parseKojluxResponse,
  parseJsonResponse,
  classifyStudyFile,
  STUDY_FILE_ACCEPT,
} from '../lib/gemini';
import {
  getKojluxResponseSchema,
  KOJLUX_MATH_NOTATION_INSTRUCTIONS,
  KOJLUX_QUIZ_COMPONENT_INSTRUCTIONS,
} from '../../shared/kojluxSchema';
import { makeRecallCard } from '../lib/spacedRepetition';
import { RecallCard } from '../types';
import { Subject, subjectPromptHint } from '../lib/subjects';
import TopicPicker, { SegmentedTrack, ui } from './TopicPicker';
import EducationalComponents from './blocks/EducationalComponents';
import { MathText } from './blocks/Latex';
import { renderStructuredContentToPdf } from '../lib/pdfStructuredContent';
import { sanitizeForPdf } from '../lib/pdfTextSanitizer';

function formatQuestionVisual(question: QuizQuestion): string[] {
  const visual = question.visual;
  if (!visual) return [];
  switch (visual.type) {
    case 'FORMULA_DISPLAY':
      return [
        `Visual: ${visual.title}`,
        visual.rawLatex,
        ...visual.variables.map((variable) =>
          `${variable.symbol}: ${variable.meaning}${variable.unit ? ` (${variable.unit})` : ''}`
        ),
      ];
    case 'AREA_MODEL': {
      const cells = new Map(visual.gridCells.map((cell) => [`${cell.row}:${cell.col}`, cell.value]));
      return [
        `Visual: Area model — ${visual.explanation}`,
        `Columns: ${visual.topLabels.join(' | ')}`,
        ...visual.leftLabels.map((label, row) =>
          `${label} | ${visual.topLabels.map((_, col) => cells.get(`${row}:${col}`) ?? '').join(' | ')}`
        ),
      ];
    }
    case 'COORDINATE_GEOMETRY':
      return [
        `Visual: ${visual.graphType.toLowerCase()} graph of ${visual.equation}`,
        ...visual.keyPoints.map((point) =>
          `${point.label} (${point.x}, ${point.y}) — ${point.mathematicalSignificance}`
        ),
      ];
    case 'PROCESS_FLOW':
      return [
        `Visual: ${visual.processName}`,
        ...visual.steps.map((step) =>
          `${step.stepNumber}. ${step.title}: ${step.mechanism}${step.trigger ? ` (trigger: ${step.trigger})` : ''}`
        ),
      ];
    case 'HISTORICAL_TIMELINE':
      return [
        `Visual: ${visual.eraOrPeriod}`,
        ...visual.events.map((event) => `${event.dateOrEra}: ${event.title} — ${event.significance}`),
      ];
    case 'COMPARATIVE_TABLE':
      return [
        `Visual: ${visual.caption}`,
        visual.headers.join(' | '),
        ...visual.rows.map((row) => row.join(' | ')),
      ];
  }
}

function getMultipartAnswers(question: QuizQuestion, answer: string | undefined): Record<number, string> {
  if (!question.parts?.length || !answer) return {};
  try {
    const parsed: unknown = JSON.parse(answer);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const storedAnswers = parsed as Record<string, unknown>;
    const answers: Record<number, string> = {};
    for (const { partNumber } of question.parts) {
      const value = storedAnswers[partNumber];
      answers[partNumber] = typeof value === 'string' ? value : '';
    }
    return answers;
  } catch {
    return {};
  }
}

function isQuestionAnswered(question: QuizQuestion, answer: string | undefined): boolean {
  if (!question.parts?.length) return Boolean(answer?.trim());
  const answers = getMultipartAnswers(question, answer);
  return question.parts.every((part) => Boolean(answers[part.partNumber]?.trim()));
}

function formatStudentAnswer(question: QuizQuestion, answer: string | undefined): string {
  if (!question.parts?.length) return answer || '(blank)';
  const answers = getMultipartAnswers(question, answer);
  return question.parts
    .map((part) => `Part ${part.partNumber}: ${answers[part.partNumber] || '(blank)'}`)
    .join(' | ');
}

function isMultipartAnswerCorrect(question: QuizQuestion, answer: string | undefined): boolean {
  if (!question.parts?.length) {
    return (answer || '').trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
  }
  const answers = getMultipartAnswers(question, answer);
  return question.parts.every((part) =>
    (answers[part.partNumber] || '').trim().toLowerCase() === part.correctAnswer.trim().toLowerCase()
  );
}

interface Props {
  gradeLevel: string;
  scopeId: string;
  resumeDraftId: string | null;
  summarySource?: string | null;
  onSummarySourceConsumed?: () => void;
  onResumeConsumed: () => void;
  onFocusModeChange: (focused: boolean) => void;
  onPauseQuiz: (id: string, title: string) => void;
  onSubmitQuiz: (id: string) => void;
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
}

interface QuizDraft {
  file: StudyFile | null;
  textInput: string;
  inputMode: 'topic' | 'notes';
  subject: Subject;
  questionCount: number | '';
  quizType: 'multiple-choice' | 'short-answer';
  difficulty: 'easy' | 'medium' | 'hard';
  quizData: QuizData | null;
  quizSourceImage: string | null;
  userAnswers: Record<number, string>;
  evaluation: EvaluationResult | null;
  currentQ: number;
  workId?: string;
  pausedAt?: string;
  lastReminderAt?: string;
}

// Max-width only: the app shell already supplies side padding.
const WRAP = 'mx-auto w-full max-w-2xl';

export default function QuizBuilder({
  gradeLevel,
  scopeId,
  resumeDraftId,
  summarySource,
  onSummarySourceConsumed,
  onResumeConsumed,
  onFocusModeChange,
  onPauseQuiz,
  onSubmitQuiz,
  onSaveHistory,
  onAddRecallCards,
  onError,
}: Props) {
  const [file, setFile] = useState<StudyFile | null>(null);
  const [textInput, setTextInput] = useState('');
  // Explicit topic-vs-notes choice from the TopicPicker (see TopicPicker.tsx
  // for why this replaced a length/punctuation guess: a long, detailed
  // topic description was previously indistinguishable from long pasted
  // notes, so it got treated as raw source material to comprehend rather
  // than an instruction of what to generate — effectively "ignored" no
  // matter how much detail the student gave it). Defaults to 'topic' since
  // that's the more common first action; a file attachment hides this
  // toggle entirely (see TopicPicker's hasFile prop) since the file is
  // always the source material once one's attached.
  const [inputMode, setInputMode] = useState<'topic' | 'notes'>('notes');
  const [subject, setSubject] = useState<Subject>('general');
  // number | '' rather than always-a-number so the field can genuinely go
  // empty while typing (e.g. backspacing to retype) instead of snapping
  // back to its old value — that snapping was what made typing feel broken
  // and pushed people onto the up/down spinner arrows instead.
  const [questionCount, setQuestionCount] = useState<number | ''>(5);
  const [quizType, setQuizType] = useState<'multiple-choice' | 'short-answer'>('multiple-choice');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  // Snapshot of the source file's image (when it was an image) taken at
  // generation time. The upload form is hidden once a quiz exists, so `file`
  // itself can't change out from under a quiz in normal use — but every
  // question's recall card is built from this snapshot rather than the live
  // `file` state, so each quiz's cards always keep the photo they were
  // actually generated from, not whatever happens to be in the uploader
  // later. PDFs/videos aren't image data, so they never populate this.
  const [quizSourceImage, setQuizSourceImage] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [checkedParts, setCheckedParts] = useState<Record<string, boolean>>({});
  const [visiblePartHints, setVisiblePartHints] = useState<Record<string, boolean>>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Session-draft persistence ----
  // A generated quiz (and the student's in-progress answers) used to live
  // only in the useState calls above — a refresh, tab crash, or mobile
  // low-memory force-reload wiped it back to a blank "new quiz" screen with
  // no warning. This mirrors it into IndexedDB (see lib/draftStore.ts) as it
  // changes, and restores it on mount, so a refresh mid-quiz resumes exactly
  // where the student left off instead of discarding their work.
  const DRAFT_KEY = `quiz_builder_${scopeId}`;
  const pausedDraftKey = (id: string) => `quiz_paused_${scopeId}_${id}`;
  const draftHydrated = useRef(false);

  useEffect(() => {
    if (draftHydrated.current && !resumeDraftId) return;
    let cancelled = false;
    const load = resumeDraftId
      ? loadDraft<QuizDraft>(pausedDraftKey(resumeDraftId)).then((draft) =>
          draft ?? loadDraft<QuizDraft>(DRAFT_KEY)
        )
      : loadDraft<QuizDraft>(DRAFT_KEY);
    load.then(async (draft) => {
      if (cancelled || !draft || !draft.quizData) {
        if (resumeDraftId) {
          onError('That paused quiz could not be found. It may have been deleted.');
          onFocusModeChange(false);
          onResumeConsumed();
        }
        return;
      }
      setFile(draft.file);
      setTextInput(draft.textInput);
      setInputMode(draft.inputMode);
      setSubject(draft.subject);
      setQuestionCount(
        typeof draft.questionCount === 'number'
          ? Math.min(15, Math.max(3, Math.round(draft.questionCount)))
          : ''
      );
      setQuizType(draft.quizType);
      setDifficulty(draft.difficulty);
      setQuizData(draft.quizData);
      setWorkId(draft.workId ?? (resumeDraftId || `${Date.now()}`));
      setQuizSourceImage(draft.quizSourceImage);
      setUserAnswers(draft.userAnswers);
      setCheckedParts({});
      setVisiblePartHints({});
      setEvaluation(draft.evaluation);
      setCurrentQ(draft.currentQ);
      if (resumeDraftId) {
        await clearDraft(pausedDraftKey(resumeDraftId));
        onFocusModeChange(true);
        onResumeConsumed();
      } else if (!draft.evaluation) {
        onFocusModeChange(true);
      }
    }).finally(() => {
      if (cancelled) return;
      draftHydrated.current = true;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, resumeDraftId]);

  useEffect(() => {
    if (!draftHydrated.current) return; // don't stomp the draft with blank initial state before hydration runs
    if (!quizData || evaluation) {
      clearDraft(DRAFT_KEY);
      return;
    }
    saveDraft(DRAFT_KEY, {
      file, textInput, inputMode, subject, questionCount, quizType, difficulty,
      quizData, quizSourceImage, userAnswers, evaluation, currentQ, workId,
    });
    // Only re-save when something about the actual session changes — typing
    // in unrelated future fields shouldn't thrash IndexedDB.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY, quizData, quizSourceImage, userAnswers, evaluation, currentQ, workId]);

  // Warns on refresh/close while a quiz is in progress and not yet
  // submitted — see lib/useUnsavedChangesWarning.ts for what this can and
  // can't actually guarantee (short version: the draft above is the real
  // safety net; this is just a nudge against accidental closes).
  useUnsavedChangesWarning(Boolean(quizData) && !evaluation);

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

  const finishQuiz = () => {
    // A quiz becomes a recent item when the student leaves it, even if they
    // choose New before submitting answers. Submitted quizzes are already in
    // history, so only save unfinished sessions here.
    if (quizData && !evaluation) {
      onSaveHistory({
        id: `${Date.now()}`,
        type: 'quiz',
        title: quizData.title,
        createdAt: new Date().toISOString(),
        data: quizData,
      });
    }
  };

  const resetQuiz = () => {
    finishQuiz();
    setQuizData(null);
    setQuizSourceImage(null);
    setUserAnswers({});
    setCheckedParts({});
    setVisiblePartHints({});
    setEvaluation(null);
    setCurrentQ(0);
    clearDraft(DRAFT_KEY);
  };

  const handleGenerateClick = () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or describe a topic / paste notes first.');
      return;
    }
    generateQuiz();
  };

  const generateQuiz = async (sourceOverride?: string) => {
    const sourceText = sourceOverride ?? textInput;
    if (!file && !sourceText.trim()) {
      onError('Add a photo, PDF, video, or describe a topic / paste notes first.');
      return;
    }
    const count = questionCount === '' ? 0 : questionCount;
    if (count < 1) {
      onError("Choose at least 1 question — 0 won't generate a quiz.");
      return;
    }
    if (count > 15) {
      onError('Choose no more than 15 questions.');
      return;
    }
    const nextWorkId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setWorkId(nextWorkId);
    onFocusModeChange(true);
    setLoading(true);
    resetQuiz();
    try {
      const parts: any[] = [];
      if (file) {
        // gemini-3.6-flash reads images, PDFs, and video all the same way —
        // no separate analysis pass, no second AI job.
        const [, data] = file.dataUrl.split(',');
        parts.push({ inlineData: { mimeType: file.mimeType, data } });
      }
      // The mode picked in TopicPicker decides how textInput is framed for
      // the model: as an INSTRUCTION of what to generate (topic), or as
      // literal SOURCE MATERIAL to draw questions from (notes) — same as a
      // file would be. Previously this was guessed from length/punctuation,
      // which meant a longer, more detailed topic description quietly got
      // treated as source text instead of an instruction. Explicit mode
      // means a long topic description is never truncated, reinterpreted,
      // or ignored — it's always sent as exactly what it is.
      const materialClause = !sourceText.trim()
        ? ''
        : file
        ? `Additional focus/instructions from the student: """${sourceText.trim()}"""`
        : inputMode === 'topic'
        ? `Generate the quiz about this topic (this is an instruction of what to cover, not source text to quote): """${sourceText.trim()}"""`
        : `Text material to base the quiz on: """${sourceText.trim()}"""`;

      const subjectClause = subjectPromptHint(subject);

      const instructions = `You are an expert ${gradeLevel} teacher. Create a ${difficulty} difficulty quiz with exactly ${count} ${quizType === 'multiple-choice' ? 'multiple-choice' : 'short-answer'} questions based on the study material provided (file and/or text below).
${materialClause}
${subjectClause}
${KOJLUX_QUIZ_COMPONENT_INSTRUCTIONS}
${KOJLUX_MATH_NOTATION_INSTRUCTIONS}
Set metadata.subject to "${subject}" and metadata.topic to a concise topic derived from the request. Set metadata.generatedAt to this ISO timestamp: ${new Date().toISOString()}. Set metadata.orchestratorReasoning to a short rationale if a visual is included, otherwise an empty string.
Respond ONLY with strict JSON, no markdown fences, in this exact shape:
{"title": string, "subject": "${subject}", "questions": [{"type": "${quizType}", "question": string (for multipart questions, use shared context only, not another question), ${
        quizType === 'multiple-choice' ? '"options": [string, string, string, string], ' : ''
      }"correctAnswer": string, "explanation": string, "parts"?: [{"partNumber": number, "questionText": string, "type": "${quizType}", ${
        quizType === 'multiple-choice' ? '"options": [string, string, string, string], ' : ''
      }"correctAnswer": string, "explanation": string, "hints"?: [string], "remediationIfWrong"?: string}], "visual"?: one relevant supported visual block}], "metadata": {"generatedAt": "ISO timestamp", "subject": string, "topic": string, "orchestratorReasoning": string}, "dynamicComponents": []}`;
      parts.push({ text: instructions });

      const response = await generateContentWithFallback(GEMINI_KEYS.quiz, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: getKojluxResponseSchema('quiz'),
        },
      }, {
        mode: 'quiz',
        subject,
        topic: sourceText.trim() || subject,
      });
      const parsed = parseKojluxResponse<QuizData>(response.text, 'quiz');
      if (parsed.questions.length !== count) {
        throw new Error(`The quiz contained ${parsed.questions.length} questions instead of the requested ${count}.`);
      }
      const visualCount = parsed.questions.filter((question) => question.visual).length;
      const requiredVisualCount = Math.floor(count / 5) * 2;
      if (count < 5 && visualCount > 0) {
        throw new Error('Quizzes with fewer than five questions must not include visuals.');
      }
      if (visualCount < requiredVisualCount) {
        throw new Error(`The quiz needs at least ${requiredVisualCount} visuals, but only ${visualCount} were generated.`);
      }
      setQuizData(parsed);
      setQuizSourceImage(file?.kind === 'image' ? file.dataUrl : null);
    } catch (err) {
      console.error(err);
      onFocusModeChange(false);
      onError('Could not generate a quiz from that material. Try a clearer file or more text.');
    } finally {
      setLoading(false);
    }
  };

  const pauseQuiz = async () => {
    if (!quizData || !workId || isPausing || isEvaluating) return;
    setIsPausing(true);
    const pausedAt = new Date().toISOString();
    try {
      const key = pausedDraftKey(workId);
      await saveDraft(key, {
        file,
        textInput,
        inputMode,
        subject,
        questionCount,
        quizType,
        difficulty,
        quizData,
        quizSourceImage,
        userAnswers,
        evaluation: null,
        currentQ,
        workId,
        pausedAt,
        lastReminderAt: pausedAt,
      });
      if (!(await loadDraft(key))) {
        onError('Your quiz could not be saved. Please keep this workspace open and try again.');
        return;
      }
      await clearDraft(DRAFT_KEY);
      onPauseQuiz(workId, quizData.title);
    } finally {
      setIsPausing(false);
    }
  };

  useEffect(() => {
    if (!summarySource) return;
    setTextInput(summarySource);
    setInputMode('notes');
    generateQuiz(summarySource);
    onSummarySourceConsumed?.();
    // The source is consumed once when NoteCraft hands it to this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarySource]);

  const submitQuiz = async () => {
    if (!quizData) return;
    setIsEvaluating(true);
    try {
      const mcqEvaluations = quizData.questions.map((q, i) =>
        q.type === 'multiple-choice'
          ? {
              questionIndex: i,
              isCorrect: isMultipartAnswerCorrect(q, userAnswers[i]),
              feedback: q.explanation || '',
            }
          : null
      );

      const shortAnswerQs = quizData.questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.type === 'short-answer');

      let saEvaluations: any[] = [];
      if (shortAnswerQs.length > 0) {
        const prompt = `Grade these short-answer responses for a ${gradeLevel} student. For each, judge if the student's answer captures the correct idea (allow paraphrasing, don't require exact wording).\n${KOJLUX_MATH_NOTATION_INSTRUCTIONS}\nRespond ONLY with strict JSON: {"evaluations": [{"questionIndex": number, "isCorrect": boolean, "feedback": string}]}\n\n${shortAnswerQs
          .map(
            ({ q, i }) => {
              const questionText = q.parts?.length
                ? `${q.question}\n${q.parts.map((part) => `Part ${part.partNumber}: ${part.questionText}`).join('\n')}`
                : q.question;
              const correctAnswer = q.parts?.length
                ? q.parts.map((part) => `Part ${part.partNumber}: ${part.correctAnswer}`).join('; ')
                : q.correctAnswer;
              return `Q${i}: "${questionText}" | Correct answer: "${correctAnswer}" | Student answer: "${formatStudentAnswer(q, userAnswers[i])}"`;
            }
          )
          .join('\n')}`;
        const response = await generateContentWithFallback(GEMINI_KEYS.quiz, {
          model: 'gemini-3.6-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const parsed = parseJsonResponse<{ evaluations: any[] }>(response.text);
        saEvaluations = parsed.evaluations;
      }

      const allEvaluations = quizData.questions.map((_, i) => {
        const mcq = mcqEvaluations[i];
        if (mcq) return mcq;
        return saEvaluations.find((e) => e.questionIndex === i) || { questionIndex: i, isCorrect: false, feedback: '' };
      });

      const score = allEvaluations.filter((e) => e.isCorrect).length;
      const result: EvaluationResult = {
        score,
        totalQuestions: quizData.questions.length,
        evaluations: allEvaluations,
        overallFeedback:
          score === quizData.questions.length
            ? 'Perfect score — every one of these will still come back around in Review, spaced out over time, to lock it in.'
            : 'Nice work. The ones you missed have been queued in Review so you see them again before you forget.',
      };
      setEvaluation(result);
      onFocusModeChange(false);
      if (workId) onSubmitQuiz(workId);
      await clearDraft(DRAFT_KEY);

      onSaveHistory({
        id: `${Date.now()}`,
        type: 'quiz',
        title: quizData.title,
        createdAt: new Date().toISOString(),
        data: quizData,
      });

      // Recall Coach: every question — right or wrong — becomes a spaced
      // repetition card. Missed questions are what retrieval practice is
      // actually for, so they're queued exactly the same as the ones aced.
      const cards = quizData.questions.map((q) =>
        makeRecallCard({
          sourceType: 'quiz',
          sourceTitle: quizData.title,
          prompt: q.parts?.length
            ? `${q.question} ${q.parts.map((part) => `Part ${part.partNumber}: ${part.questionText}`).join(' ')}`
            : q.question,
          answer: q.parts?.length
            ? q.parts.map((part) => `Part ${part.partNumber}: ${part.correctAnswer}`).join('; ')
            : q.correctAnswer,
          image: quizSourceImage ?? undefined,
        })
      );
      onAddRecallCards(cards);
    } catch (err) {
      console.error(err);
      onError('Grading failed — please try submitting again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center bg-focus-bg text-slate-900 dark:text-slate-100 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-6">
          <RefreshCw className="w-7 h-7 text-focus-primary animate-spin" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-focus-primary">Building your study session</p>
        <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight">Creating your quiz</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">Your focused workspace will be ready in a moment.</p>
      </div>
    );
  }

  const exportPdf = () => {
    if (!quizData) return;
    const pdf = new jsPDF();
    let y = 20;

    // Long question blocks, option labels, and other text items must wrap
    // dynamically and cleanly push to the next page rather than overflow
    // the side or bottom margin — so every line is measured with
    // splitTextToSize and space is checked before each individual line is
    // drawn, not just once per question.
    const ensureSpace = (needed: number) => {
      if (y + needed > 280) {
        pdf.addPage();
        y = 20;
      }
    };
    // Every string drawn by this function funnels through here, so this is
    // the one choke point that keeps jsPDF from ever seeing raw AI/user
    // text unsanitized (see lib/pdfTextSanitizer.ts).
    const writeWrapped = (text: string, indent: number, maxWidth: number, lineHeight = 6) => {
      const lines = pdf.splitTextToSize(sanitizeForPdf(text), maxWidth);
      ensureSpace(lines.length * lineHeight);
      pdf.text(lines, indent, y);
      y += lines.length * lineHeight;
    };

    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(sanitizeForPdf(quizData.title), 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8 + 2;
    pdf.setFontSize(11);

    if (quizData.passage) {
      writeWrapped('Reading Passage', 15, 180);
      y += 1;
      writeWrapped(quizData.passage, 15, 180);
      y += 4;
    }
    y = renderStructuredContentToPdf(pdf, quizData, y, quizData.title);

    quizData.questions.forEach((q, i) => {
      formatQuestionVisual(q).forEach((line) => writeWrapped(line, 20, 170));
      writeWrapped(`${i + 1}. ${q.question}`, 15, 180);
      y += 2;
      if (q.parts?.length) {
        q.parts.forEach((part) => {
          writeWrapped(`Part ${part.partNumber}: ${part.questionText}`, 20, 170);
          if (part.type === 'multiple-choice' && part.options) {
            part.options.forEach((option, index) => writeWrapped(`${String.fromCharCode(65 + index)}. ${option}`, 25, 165));
          } else {
            writeWrapped('Answer: _______________________________', 25, 165);
          }
        });
      } else if (q.type === 'multiple-choice' && q.options) {
        q.options.forEach((opt, oi) => {
          writeWrapped(`${String.fromCharCode(65 + oi)}. ${opt}`, 20, 170);
        });
      } else {
        writeWrapped('Answer: _______________________________', 20, 170);
      }
      y += 4;
    });
    pdf.save(`${quizData.title.replace(/\s+/g, '_')}.pdf`);
  };

  // Same layout as exportPdf, but for after grading: includes the student's
  // own answers, a correct/incorrect mark, the right answer when they missed
  // it, and any feedback — so this is a printable record of how they did,
  // not just a blank copy of the quiz.
  const exportGradedPdf = () => {
    if (!quizData || !evaluation) return;
    const pdf = new jsPDF();
    let y = 20;

    const ensureSpace = (needed: number) => {
      if (y + needed > 280) {
        pdf.addPage();
        y = 20;
      }
    };
    // Every line — question, option, answer, result, feedback — is wrapped
    // and space-checked individually so nothing gets clipped at the side of
    // the page or cut off at a page break; a block that doesn't fit pushes
    // cleanly to the next page instead.
    // Same reasoning as exportPdf above — one choke point for every line
    // this function draws, including the student's own typed answers.
    const writeWrapped = (text: string, indent: number, maxWidth: number, lineHeight = 6) => {
      const lines = pdf.splitTextToSize(sanitizeForPdf(text), maxWidth);
      ensureSpace(lines.length * lineHeight);
      pdf.text(lines, indent, y);
      y += lines.length * lineHeight;
    };

    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(sanitizeForPdf(quizData.title), 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8;
    pdf.setFontSize(11);
    y += 2;
    writeWrapped(`Score: ${evaluation.score}/${evaluation.totalQuestions}`, 15, 180);
    y += 4;

    if (quizData.passage) {
      writeWrapped('Reading Passage', 15, 180);
      y += 1;
      writeWrapped(quizData.passage, 15, 180);
      y += 4;
    }
    y = renderStructuredContentToPdf(pdf, quizData, y, quizData.title);

    quizData.questions.forEach((q, i) => {
      const ev = evaluation.evaluations.find((e) => e.questionIndex === i);
      formatQuestionVisual(q).forEach((line) => writeWrapped(line, 20, 170));
      writeWrapped(`${i + 1}. ${q.question}`, 15, 180);
      y += 2;

      if (q.parts?.length) {
        q.parts.forEach((part) => {
          writeWrapped(`Part ${part.partNumber}: ${part.questionText}`, 20, 170);
          if (part.type === 'multiple-choice' && part.options) {
            part.options.forEach((option, index) => writeWrapped(`${String.fromCharCode(65 + index)}. ${option}`, 25, 165));
          }
        });
      } else if (q.type === 'multiple-choice' && q.options) {
        q.options.forEach((opt, oi) => {
          writeWrapped(`${String.fromCharCode(65 + oi)}. ${opt}`, 20, 170);
        });
      }

      writeWrapped(`Your answer: ${formatStudentAnswer(q, userAnswers[i])}`, 20, 170);
      writeWrapped(`Result: ${ev?.isCorrect ? 'Correct' : 'Incorrect'}`, 20, 170);

      if (!ev?.isCorrect) {
        writeWrapped(`Correct answer: ${q.correctAnswer}`, 20, 170);
      }

      const feedbackText = ev?.feedback || q.explanation;
      if (feedbackText) {
        writeWrapped(`Feedback: ${feedbackText}`, 20, 170);
      }
      y += 4;
    });
    pdf.save(`${quizData.title.replace(/\s+/g, '_')}_graded.pdf`);
  };

  // ---- Results view ----
  if (quizData && evaluation) {
    return (
      <div className={`${WRAP} space-y-6`}>
        <div className="rounded-2xl bg-focus-primary text-white p-6 sm:p-8 shadow-lg shadow-focus-primary/25">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Score</p>
          <p className="text-6xl font-black tracking-tighter mt-2 tabular-nums">{evaluation.score}/{evaluation.totalQuestions}</p>
          <MathText text={evaluation.overallFeedback ?? ''} className="mt-4 block text-sm text-white leading-relaxed" />
        </div>
        <div className="space-y-3">
          {quizData.questions.map((q, i) => {
            const ev = evaluation.evaluations.find((e) => e.questionIndex === i);
            return (
              <div key={i} className={ui.tile}>
                <div className="flex items-start gap-3">
                  {ev?.isCorrect ? (
                    <CheckCircle className="w-5 h-5 text-focus-primary shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-900 dark:text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <MathText text={q.question} className="block text-sm font-bold text-slate-900 dark:text-slate-400" />
                    {q.visual && <EducationalComponents components={[q.visual]} />}
                    {q.parts?.map((part) => (
                      <p key={part.partNumber} className="mt-2 text-xs text-slate-900 dark:text-slate-400">
                        <span className="font-bold">Part {part.partNumber}: </span>
                        <MathText text={getMultipartAnswers(q, userAnswers[i])[part.partNumber] || '(blank)'} />
                      </p>
                    ))}
                    {!q.parts?.length && <p className="text-xs text-slate-900 dark:text-slate-400 mt-2">Your answer: <MathText text={formatStudentAnswer(q, userAnswers[i])} /></p>}
                    {!ev?.isCorrect && (
                      q.parts?.length ? q.parts.map((part) => (
                        <p key={part.partNumber} className="mt-1 text-xs font-bold text-slate-900 dark:text-slate-400">
                          Correct part {part.partNumber}: <MathText text={part.correctAnswer} />
                        </p>
                      )) : <p className="text-xs text-slate-900 dark:text-slate-400 mt-1 font-bold">Correct: <MathText text={q.correctAnswer} /></p>
                    )}
                    {(ev?.feedback || q.explanation) && (
                      <MathText text={ev?.feedback || q.explanation || ''} className="mt-2 block text-xs italic leading-relaxed text-slate-900 dark:text-slate-400" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-4">
          <button onClick={resetQuiz} className={ui.ctaFull}>
            <RefreshCw className="w-4 h-4 shrink-0" /> <span className="leading-none">New quiz</span>
          </button>
          <div className={ui.btnGroup}>
            <button onClick={exportPdf} className={ui.btnCell}>
              <Printer className="w-4 h-4 shrink-0" /> PDF
            </button>
            <button onClick={exportGradedPdf} className={ui.btnCell}>
              <Printer className="w-4 h-4 shrink-0" /> Print graded work
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Taking the quiz, one question at a time ----
  if (quizData) {
    const total = quizData.questions.length;
    const q = quizData.questions[currentQ];
    const allAnswered = quizData.questions.every((question, i) => isQuestionAnswered(question, userAnswers[i]));
    const isLast = currentQ === total - 1;
    const currentAnswered = isQuestionAnswered(q, userAnswers[currentQ]);

    return (
      <div className={`${WRAP} space-y-6`}>
        <div className="flex items-start justify-between gap-4">
          <MathText text={quizData.title} className={ui.h1} />
          <button
            onClick={() => void pauseQuiz()}
            disabled={isEvaluating || isPausing}
            aria-label="Pause and exit quiz"
            title="Pause and exit"
            className="fixed top-4 right-4 z-20 w-12 h-12 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-100 disabled:opacity-50"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-900 dark:text-slate-400 uppercase tabular-nums">
              Question {currentQ + 1} of {total}
            </span>
            <span className="text-[10px] font-medium text-slate-400">Your progress is saved automatically</span>
          </div>
          <div className="flex gap-1">
            {quizData.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentQ(i)}
                aria-label={`Go to question ${i + 1}`}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-150 ${
                  i === currentQ
                    ? 'bg-focus-primary'
                    : isQuestionAnswered(quizData.questions[i], userAnswers[i])
                    ? 'bg-focus-primary/60'
                    : 'bg-focus-primary/15'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Current question only */}
        <div className="rounded-2xl bg-focus-primary/5 p-5 sm:p-6 min-h-[220px] flex flex-col">
          {q.visual && <EducationalComponents components={[q.visual]} />}
          <MathText text={`${currentQ + 1}. ${q.question}`} className="mb-5 block text-base font-bold leading-snug text-slate-900 dark:text-slate-400" />
          {q.parts?.length ? (
            <div className="space-y-5">
              {q.parts.map((part) => {
                const partAnswers = getMultipartAnswers(q, userAnswers[currentQ]);
                const answer = partAnswers[part.partNumber] ?? '';
                const partKey = `${currentQ}:${part.partNumber}`;
                const checkedCorrectly = checkedParts[partKey];
                return (
                  <fieldset key={part.partNumber} className="rounded-xl border border-focus-primary/15 bg-white/70 p-4 dark:bg-slate-900/70">
                    <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                      Part {part.partNumber}
                    </legend>
                    <MathText text={part.questionText} className="mb-3 block text-sm font-medium text-slate-800 dark:text-slate-200" />
                    {part.type === 'multiple-choice' && part.options ? (
                      <div className="space-y-2">
                        {part.options.map((option, optionIndex) => (
                          <button
                            key={optionIndex}
                            type="button"
                            onClick={() => {
                              setUserAnswers((previous) => ({
                                ...previous,
                                [currentQ]: JSON.stringify({
                                  ...getMultipartAnswers(q, previous[currentQ]),
                                  [part.partNumber]: option,
                                }),
                              }));
                              setCheckedParts((previous) => {
                                const next = { ...previous };
                                delete next[partKey];
                                return next;
                              });
                            }}
                            className={`w-full rounded-xl px-4 py-3 text-left text-sm ${
                              answer === option
                                ? 'bg-focus-primary font-bold text-white'
                                : 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                            }`}
                          >
                            <MathText text={option} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={answer}
                        onChange={(event) => setUserAnswers((previous) => ({
                          ...previous,
                          [currentQ]: JSON.stringify({
                            ...getMultipartAnswers(q, previous[currentQ]),
                            [part.partNumber]: event.target.value,
                          }),
                        }))}
                        placeholder="Type your answer in your own words."
                        className={`${ui.fieldSolid} w-full`}
                        rows={3}
                      />
                    )}
                    {part.hints && part.hints.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={!answer.trim()}
                          onClick={() => setCheckedParts((previous) => ({
                            ...previous,
                            [partKey]: answer.trim().toLowerCase() === part.correctAnswer.trim().toLowerCase(),
                          }))}
                          className="rounded-lg bg-focus-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Check answer
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisiblePartHints((previous) => ({
                            ...previous,
                            [partKey]: !previous[partKey],
                          }))}
                          className="text-xs font-semibold text-focus-primary"
                        >
                          {visiblePartHints[partKey] ? 'Hide hint' : 'Show hint'}
                        </button>
                        {checkedCorrectly !== undefined && (
                          <p className={`w-full text-sm ${checkedCorrectly ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {checkedCorrectly ? 'That’s right.' : part.remediationIfWrong}
                          </p>
                        )}
                        {visiblePartHints[partKey] && (
                          <MathText text={part.hints.join(' ')} className="w-full text-sm text-slate-600 dark:text-slate-300" />
                        )}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
          ) : q.type === 'multiple-choice' && q.options ? (
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => setUserAnswers((p) => ({ ...p, [currentQ]: opt }))}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-150 ${
                    userAnswers[currentQ] === opt
                      ? 'bg-focus-primary text-white font-bold'
                      : 'bg-white dark:bg-slate-800 text-black dark:text-slate-100 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-md'
                  }`}
                >
                  <MathText text={opt} />
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={userAnswers[currentQ] || ''}
              onChange={(e) => setUserAnswers((p) => ({ ...p, [currentQ]: e.target.value }))}
              placeholder="Type your answer — try to explain it in your own words."
              className={`${ui.fieldSolid} flex-1`}
              rows={4}
            />
          )}
        </div>

        {/* Nav controls — grading only happens on final Submit, never per-question */}
        <div className="flex gap-4">
          <button
            onClick={() => setCurrentQ((i) => Math.max(0, i - 1))}
            disabled={currentQ === 0}
            className={`${ui.btn} h-14 px-8 disabled:opacity-40`}
          >
            Back
          </button>
          {isLast ? (
            <button
              onClick={submitQuiz}
              disabled={!allAnswered || isEvaluating}
              className={`${ui.cta} flex-1`}
            >
              {isEvaluating ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <span className="leading-none">{isEvaluating ? 'Grading…' : allAnswered ? 'Submit quiz' : 'Answer all questions to submit'}</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentQ((i) => Math.min(total - 1, i + 1))}
              disabled={!currentAnswered}
              className={`${ui.cta} flex-1`}
            >
              <span className="leading-none">Next</span> <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Builder form ----
  return (
    <div className={`${WRAP} space-y-6`}>
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

        <section className={`${ui.section} space-y-8`}>
          <div>
            <span className={ui.eyebrow}>Questions</span>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={3}
                max={15}
                value={questionCount === '' ? 5 : Math.min(15, Math.max(3, questionCount))}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                aria-label="Question count slider"
                className={ui.slider}
              />
              <input
                type="number"
                inputMode="numeric"
                min={3}
                max={15}
                value={questionCount}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === '') { setQuestionCount(''); return; }
                  const parsed = Number(raw);
                  if (!Number.isNaN(parsed)) setQuestionCount(Math.min(15, Math.max(3, Math.round(parsed))));
                }}
                onBlur={() => setQuestionCount((c) => Math.min(15, Math.max(3, c === '' ? 3 : c)))}
                aria-label="Question count"
                className="w-14 h-10 shrink-0 text-center text-sm font-bold tabular-nums rounded-xl bg-focus-primary/10 text-focus-primary outline-none transition-all duration-150 focus:ring-2 focus:ring-focus-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <span className={ui.eyebrow}>Difficulty</span>
              <SegmentedTrack
                label="Difficulty"
                options={['easy', 'medium', 'hard'] as const}
                value={difficulty}
                onChange={setDifficulty}
              />
            </div>
            <div>
              <span className={ui.eyebrow}>Format</span>
              <SegmentedTrack
                label="Quiz format"
                options={['multiple-choice', 'short-answer'] as const}
                value={quizType}
                onChange={setQuizType}
                renderOption={(t) => (t === 'multiple-choice' ? 'Multiple choice' : 'Short answer')}
              />
            </div>
          </div>
        </section>
      </div>

      <button onClick={handleGenerateClick} disabled={loading} className={ui.ctaFull}>
        {loading ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0" />}
        <span className="leading-none">{loading ? 'Building your quiz…' : 'Generate quiz'}</span>
      </button>
    </div>
  );
}