import React, { useRef, useState } from 'react';
import {
  Upload, Sparkles, CheckCircle, XCircle, RefreshCw, Printer,
  ChevronRight, Trash, Layers,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { QuizData, QuizQuestion, EvaluationResult, HistoryItem } from '../types';
import { generateContentWithFallback, GEMINI_KEYS, parseJsonResponse } from '../lib/gemini';
import { makeRecallCard } from '../lib/spacedRepetition';
import { RecallCard } from '../types';

interface Props {
  gradeLevel: string;
  onSaveHistory: (item: HistoryItem) => void;
  onAddRecallCards: (cards: RecallCard[]) => void;
  onError: (msg: string) => void;
}

export default function QuizBuilder({ gradeLevel, onSaveHistory, onAddRecallCards, onError }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [quizType, setQuizType] = useState<'multiple-choice' | 'short-answer'>('multiple-choice');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetQuiz = () => {
    setQuizData(null);
    setUserAnswers({});
    setEvaluation(null);
  };

  const generateQuiz = async () => {
    if (!image && !textInput.trim()) {
      onError('Add a photo of your notes or paste some text first.');
      return;
    }
    setLoading(true);
    resetQuiz();
    try {
      const parts: any[] = [];
      if (image) {
        const [meta, data] = image.split(',');
        const mimeType = meta.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
        parts.push({ inlineData: { mimeType, data } });
      }
      const instructions = `You are an expert ${gradeLevel} teacher. Create a ${difficulty} difficulty quiz with exactly ${questionCount} ${quizType === 'multiple-choice' ? 'multiple-choice' : 'short-answer'} questions based on the study material provided (image and/or text below). ${
        textInput.trim() ? `Text material: """${textInput.trim()}"""` : ''
      }
Respond ONLY with strict JSON, no markdown fences, in this exact shape:
{"title": string, "questions": [{"type": "${quizType}", "question": string, ${
        quizType === 'multiple-choice' ? '"options": [string, string, string, string], ' : ''
      }"correctAnswer": string, "explanation": string}]}`;
      parts.push({ text: instructions });

      const response = await generateContentWithFallback(GEMINI_KEYS.quiz, {
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      });
      const parsed = parseJsonResponse<QuizData>(response.text);
      setQuizData(parsed);
    } catch (err) {
      console.error(err);
      onError('Could not generate a quiz from that material. Try a clearer photo or more text.');
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
          model: 'gemini-2.5-flash',
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
    pdf.setFontSize(16);
    pdf.text(quizData.title, 15, y);
    y += 10;
    pdf.setFontSize(11);
    quizData.questions.forEach((q, i) => {
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
    pdf.save(`${quizData.title.replace(/\s+/g, '_')}.pdf`);
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
        <div className="flex gap-2.5">
          <button onClick={resetQuiz} className="flex-1 py-3 bg-focus-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> New Quiz
          </button>
          <button onClick={exportPdf} className="py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold flex items-center gap-2">
            <Printer className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>
    );
  }

  // ---- Taking the quiz ----
  if (quizData) {
    const allAnswered = quizData.questions.every((_, i) => (userAnswers[i] || '').trim().length > 0);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900 dark:text-white">{quizData.title}</h2>
          <button onClick={resetQuiz} className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1">
            <Trash className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
        {quizData.questions.map((q, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">{i + 1}. {q.question}</p>
            {q.type === 'multiple-choice' && q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    onClick={() => setUserAnswers((p) => ({ ...p, [i]: opt }))}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition ${
                      userAnswers[i] === opt
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
                value={userAnswers[i] || ''}
                onChange={(e) => setUserAnswers((p) => ({ ...p, [i]: e.target.value }))}
                placeholder="Type your answer — try to explain it in your own words."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary resize-none"
                rows={2}
              />
            )}
          </div>
        ))}
        <button
          onClick={submitQuiz}
          disabled={!allAnswered || isEvaluating}
          className="w-full py-3.5 bg-focus-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isEvaluating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          {isEvaluating ? 'Grading…' : 'Submit Quiz'}
        </button>
      </div>
    );
  }

  // ---- Builder form ----
  return (
    <div className="space-y-5">
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center cursor-pointer hover:border-focus-primary transition bg-white dark:bg-slate-900"
      >
        {image ? (
          <img src={image} className="max-h-40 mx-auto rounded-lg object-contain" />
        ) : (
          <div className="space-y-2 text-slate-400">
            <Upload className="w-6 h-6 mx-auto" />
            <p className="text-xs font-semibold">Upload a photo of your notes or textbook page</p>
          </div>
        )}
        <input
          ref={fileInputRef}
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
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1.5">Questions: {questionCount}</span>
          <input type="range" min={3} max={10} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full accent-focus-primary" />
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
        onClick={generateQuiz}
        disabled={loading}
        className="w-full py-3.5 bg-focus-primary hover:bg-focus-primary-dark text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Building your quiz…' : 'Generate Quiz'}
      </button>
    </div>
  );
}
