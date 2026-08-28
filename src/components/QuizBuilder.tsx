import React, { useRef, useState } from 'react';
import {
  Upload, Camera, Sparkles, CheckCircle, XCircle, RefreshCw, Printer,
  ChevronRight, Trash, Layers, FileText,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { QuizData, QuizQuestion, EvaluationResult, HistoryItem, StudyFile } from '../types';
import {
  generateContentWithFallback,
  GEMINI_KEYS,
  parseJsonResponse,
  classifyStudyFile,
  STUDY_FILE_ACCEPT,
} from '../lib/gemini';
import { makeRecallCard } from '../lib/spacedRepetition';
import { RecallCard } from '../types';

interface Props {
  gradeLevel: string;
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
}

// Distinguishes a bare topic name ("Algebra 1", "Photosynthesis") from
// actual pasted notes. Short, punctuation-free input is treated as "just a
// topic" and gets a confirmation step first, since generating a quiz from a
// one- or two-word topic usually means the student meant to describe what
// to quiz them on, not paste the material itself.
function looksLikeTopicPhrase(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  const hasSentencePunctuation = /[.!?;:,]/.test(trimmed);
  return words.length <= 4 && trimmed.length <= 40 && !hasSentencePunctuation;
}

export default function QuizBuilder({ gradeLevel, onSaveHistory, onAddRecallCards, onError }: Props) {
  const [file, setFile] = useState<StudyFile | null>(null);
  const [textInput, setTextInput] = useState('');
  // number | '' rather than always-a-number so the field can genuinely go
  // empty while typing (e.g. backspacing to retype) instead of snapping
  // back to its old value — that snapping was what made typing feel broken
  // and pushed people onto the up/down spinner arrows instead.
  const [questionCount, setQuestionCount] = useState<number | ''>(5);
  const [quizType, setQuizType] = useState<'multiple-choice' | 'short-answer'>('multiple-choice');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  // Snapshot of the source file's image (when it was an image) taken at
  // generation time. The upload form is hidden once a quiz exists, so `file`
  // itself can't change out from under a quiz in normal use — but every
  // question's recall card is built from this snapshot rather than the live
  // `file` state, so each quiz's cards always keep the photo they were
  // actually generated from, not whatever happens to be in the uploader
  // later. PDFs/videos aren't image data, so they never populate this.
  const [quizSourceImage, setQuizSourceImage] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);

  const [topicConfirmOpen, setTopicConfirmOpen] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

  const resetQuiz = () => {
    setQuizData(null);
    setQuizSourceImage(null);
    setUserAnswers({});
    setEvaluation(null);
    setCurrentQ(0);
  };

  // Gate in front of generateQuiz: catches a bare topic phrase (no file
  // attached, so there's nothing but that short phrase to work from) and
  // asks the student to confirm before spending a generation on it.
  const handleGenerateClick = () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or paste some text first.');
      return;
    }
    if (!file && looksLikeTopicPhrase(textInput)) {
      setTopicConfirmOpen(true);
      return;
    }
    generateQuiz();
  };

  const generateQuiz = async () => {
    if (!file && !textInput.trim()) {
      onError('Add a photo, PDF, video, or paste some text first.');
      return;
    }
    const count = questionCount === '' ? 0 : questionCount;
    if (count < 1) {
      onError("Choose at least 1 question — 0 won't generate a quiz.");
      return;
    }
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
      const instructions = `You are an expert ${gradeLevel} teacher. Create a ${difficulty} difficulty quiz with exactly ${count} ${quizType === 'multiple-choice' ? 'multiple-choice' : 'short-answer'} questions based on the study material provided (file and/or text below). ${
        textInput.trim() ? `Text material: """${textInput.trim()}"""` : ''
      }
Respond ONLY with strict JSON, no markdown fences, in this exact shape:
{"title": string, "questions": [{"type": "${quizType}", "question": string, ${
        quizType === 'multiple-choice' ? '"options": [string, string, string, string], ' : ''
      }"correctAnswer": string, "explanation": string}]}`;
      parts.push({ text: instructions });

      const response = await generateContentWithFallback(GEMINI_KEYS.quiz, {
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }],
      });
      const parsed = parseJsonResponse<QuizData>(response.text);
      setQuizData(parsed);
      setQuizSourceImage(file?.kind === 'image' ? file.dataUrl : null);
    } catch (err) {
      console.error(err);
      onError('Could not generate a quiz from that material. Try a clearer file or more text.');
    } finally {
      setLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quizData) return;
    setIsEvaluating(true);
    try {
      const mcqEvaluations = quizData.questions.map((q, i) =>
        q.type === 'multiple-choice'
          ? {
              questionIndex: i,
              isCorrect: (userAnswers[i] || '').trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
              feedback: q.explanation || '',
            }
          : null
      );

      const shortAnswerQs = quizData.questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.type === 'short-answer');

      let saEvaluations: any[] = [];
      if (shortAnswerQs.length > 0) {
        const prompt = `Grade these short-answer responses for a ${gradeLevel} student. For each, judge if the student's answer captures the correct idea (allow paraphrasing, don't require exact wording). Respond ONLY with strict JSON: {"evaluations": [{"questionIndex": number, "isCorrect": boolean, "feedback": string}]}\n\n${shortAnswerQs
          .map(
            ({ q, i }) =>
              `Q${i}: "${q.question}" | Correct answer: "${q.correctAnswer}" | Student answer: "${userAnswers[i] || '(blank)'}"`
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
          prompt: q.question,
          answer: q.correctAnswer,
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
    const writeWrapped = (text: string, indent: number, maxWidth: number, lineHeight = 6) => {
      const lines = pdf.splitTextToSize(text, maxWidth);
      ensureSpace(lines.length * lineHeight);
      pdf.text(lines, indent, y);
      y += lines.length * lineHeight;
    };

    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(quizData.title, 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8 + 2;
    pdf.setFontSize(11);

    quizData.questions.forEach((q, i) => {
      writeWrapped(`${i + 1}. ${q.question}`, 15, 180);
      y += 2;
      if (q.type === 'multiple-choice' && q.options) {
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
    const writeWrapped = (text: string, indent: number, maxWidth: number, lineHeight = 6) => {
      const lines = pdf.splitTextToSize(text, maxWidth);
      ensureSpace(lines.length * lineHeight);
      pdf.text(lines, indent, y);
      y += lines.length * lineHeight;
    };

    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(quizData.title, 180);
    pdf.text(titleLines, 15, y);
    y += titleLines.length * 8;
    pdf.setFontSize(11);
    y += 2;
    writeWrapped(`Score: ${evaluation.score}/${evaluation.totalQuestions}`, 15, 180);
    y += 4;

    quizData.questions.forEach((q, i) => {
      const ev = evaluation.evaluations.find((e) => e.questionIndex === i);
      writeWrapped(`${i + 1}. ${q.question}`, 15, 180);
      y += 2;

      if (q.type === 'multiple-choice' && q.options) {
        q.options.forEach((opt, oi) => {
          writeWrapped(`${String.fromCharCode(65 + oi)}. ${opt}`, 20, 170);
        });
      }

      writeWrapped(`Your answer: ${userAnswers[i] || '(blank)'}`, 20, 170);
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
      <div className="space-y-5">
        <div className="bg-focus-primary rounded-3xl p-6 text-center text-white shadow-lg shadow-focus-primary/20">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">Score</p>
          <p className="text-4xl font-black mt-1">{evaluation.score}/{evaluation.totalQuestions}</p>
          <p className="text-xs text-white/80 mt-2 leading-relaxed">{evaluation.overallFeedback}</p>
        </div>
        <div className="space-y-3">
          {quizData.questions.map((q, i) => {
            const ev = evaluation.evaluations.find((e) => e.questionIndex === i);
            return (
              <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
                <div className="flex items-start gap-2.5">
                  {ev?.isCorrect ? (
                    <CheckCircle className="w-4.5 h-4.5 text-focus-sage shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{q.question}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Your answer: {userAnswers[i] || '(blank)'}</p>
                    {!ev?.isCorrect && <p className="text-xs text-focus-sage-dark dark:text-focus-sage mt-1 font-semibold">Correct: {q.correctAnswer}</p>}
                    {(ev?.feedback || q.explanation) && (
                      <p className="text-xs text-slate-400 mt-1.5 italic">{ev?.feedback || q.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-2.5">
          <button onClick={resetQuiz} className="w-full py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> New Quiz
          </button>
          <div className="flex gap-2.5">
            <button onClick={exportPdf} className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> PDF
            </button>
            <button onClick={exportGradedPdf} className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> Print Graded Work
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
    const allAnswered = quizData.questions.every((_, i) => (userAnswers[i] || '').trim().length > 0);
    const isLast = currentQ === total - 1;
    const currentAnswered = (userAnswers[currentQ] || '').trim().length > 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white">{quizData.title}</h2>
          <button onClick={resetQuiz} className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1">
            <Trash className="w-3.5 h-3.5" /> Discard
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Question {currentQ + 1} of {total}
          </span>
          <button
            onClick={exportPdf}
            className="text-[11px] font-bold text-slate-400 hover:text-focus-primary flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" /> Print blank copy
          </button>
        </div>
        <div className="flex gap-1.5">
          {quizData.questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i === currentQ
                  ? 'bg-focus-primary'
                  : (userAnswers[i] || '').trim().length > 0
                  ? 'bg-focus-sage'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Current question only */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 min-h-[220px] flex flex-col">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">{currentQ + 1}. {q.question}</p>
          {q.type === 'multiple-choice' && q.options ? (
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => setUserAnswers((p) => ({ ...p, [currentQ]: opt }))}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition ${
                    userAnswers[currentQ] === opt
                      ? 'bg-focus-primary/10 border-focus-primary text-focus-primary'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={userAnswers[currentQ] || ''}
              onChange={(e) => setUserAnswers((p) => ({ ...p, [currentQ]: e.target.value }))}
              placeholder="Type your answer — try to explain it in your own words."
              className="w-full flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
              rows={4}
            />
          )}
        </div>

        {/* Nav controls — grading only happens on final Submit, never per-question */}
        <div className="flex gap-2.5">
          <button
            onClick={() => setCurrentQ((i) => Math.max(0, i - 1))}
            disabled={currentQ === 0}
            className="py-3 px-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold disabled:opacity-40"
          >
            Back
          </button>
          {isLast ? (
            <button
              onClick={submitQuiz}
              disabled={!allAnswered || isEvaluating}
              className="flex-1 py-3 bg-focus-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isEvaluating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {isEvaluating ? 'Grading…' : allAnswered ? 'Submit Quiz' : 'Answer all questions to submit'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentQ((i) => Math.min(total - 1, i + 1))}
              disabled={!currentAnswered}
              className="flex-1 py-3 bg-focus-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Builder form ----
  return (
    <div className="space-y-5">
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Questions: {questionCount}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              value={questionCount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { setQuestionCount(''); return; }
                const parsed = Number(raw);
                if (!Number.isNaN(parsed)) setQuestionCount(Math.round(parsed));
              }}
              onBlur={() => setQuestionCount((c) => Math.min(50, Math.max(0, c === '' ? 0 : c)))}
              aria-label="Question count"
              className="w-14 py-1 text-center text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <input
            type="range"
            min={3}
            max={10}
            value={questionCount === '' ? 3 : Math.min(10, Math.max(3, questionCount))}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-focus-primary"
          />
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1.5">Difficulty</span>
          <div className="flex gap-1.5">
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border ${
                  difficulty === d ? 'bg-focus-primary text-white border-focus-primary' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['multiple-choice', 'short-answer'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setQuizType(t)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${
              quizType === t ? 'bg-focus-primary text-white border-focus-primary' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> {t === 'multiple-choice' ? 'Multiple Choice' : 'Short Answer'}
          </button>
        ))}
      </div>

      <button
        onClick={handleGenerateClick}
        disabled={loading}
        className="w-full py-3.5 bg-focus-primary hover:bg-focus-primary-dark text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Building your quiz…' : 'Generate Quiz'}
      </button>

      {topicConfirmOpen && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => setTopicConfirmOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Confirm topic</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Did you mean to generate questions based on the topic "{textInput.trim()}"?
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setTopicConfirmOpen(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-2xl transition"
              >
                Go back
              </button>
              <button
                onClick={() => {
                  setTopicConfirmOpen(false);
                  generateQuiz();
                }}
                className="flex-1 py-3 bg-focus-primary hover:bg-focus-primary-dark text-white text-xs font-bold rounded-2xl transition"
              >
                Yes, generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}