// ---------------------------------------------------------------------------
// Shared types for Kojlux Study Hub
// ---------------------------------------------------------------------------

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface QuizQuestion {
  type: 'multiple-choice' | 'short-answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface QuizData {
  title: string;
  questions: QuizQuestion[];
}

export interface QuestionEvaluation {
  questionIndex: number;
  isCorrect: boolean;
  feedback: string;
}

export interface EvaluationResult {
  score: number;
  totalQuestions: number;
  evaluations: QuestionEvaluation[];
  overallFeedback?: string;
}

export interface SummaryData {
  title: string;
  overview: string;
  keyPoints: string[];
  glossary: GlossaryItem[];
}

// A single node in the spaced-repetition queue. Generated automatically from
// quiz questions and summary key points ("Recall Coach"). Scheduling uses a
// simplified SM-2 style algorithm (ease factor + growing interval in days).
export interface RecallCard {
  id: string;
  sourceType: 'quiz' | 'summary' | 'concept-link';
  sourceTitle: string;
  prompt: string;
  answer: string;
  createdAt: string; // ISO date
  dueAt: string; // ISO date
  intervalDays: number;
  easeFactor: number;
  reps: number;
  lastResult?: 'again' | 'hard' | 'good' | 'easy';
  // Optional photo the source quiz/summary was built from (data URL). Lets
  // the review flashcard show the original page instead of a bare question.
  image?: string;
}

// One entry in "My Study Space" history — a completed quiz, summary, or
// visualization the student can reopen later.
export interface HistoryItem {
  id: string;
  type: 'quiz' | 'summary' | 'visualization';
  title: string;
  createdAt: string; // ISO date
  data: QuizData | SummaryData | VisualizationResponse;
  sourcePrompt?: string;
}

// Visualization contract expected by VisualizerScreen.tsx
export interface VisualizationPoint {
  x: number;
  y: number;
  label?: string;
}

export interface MathHighlight {
  expression: string;
  highlight?: string;
  note?: string;
}

export interface VisualizationStep {
  label: string;
  explanation: string;
  visualElements?: { shapes?: any[]; mathHighlight?: MathHighlight };
  svg?: string;
}

export interface VisualizationGraphConfig {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  points: VisualizationPoint[];
  equation?: string;
}

export interface VisualizationResponse {
  title: string;
  type: 'graph' | 'math' | 'animation';
  subject?: string;
  steps: VisualizationStep[];
  graphConfig?: VisualizationGraphConfig;
}