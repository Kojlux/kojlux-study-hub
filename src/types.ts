export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface SummaryData {
  title: string;
  subject: string;
  mainIdea: string;
  keyTakeaways: string[];
  glossary: GlossaryItem[];
  comprehensiveSummary: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  type: 'multiple-choice' | 'short-answer';
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizData {
  title: string;
  subject: string;
  questions: QuizQuestion[];
}

export interface QuestionEvaluation {
  id: number;
  isCorrect: boolean;
  score: number;
  feedback: string;
  modelAnswer: string;
}

export interface EvaluationResult {
  questionEvaluations: QuestionEvaluation[];
  summary: {
    overallPercentage: number;
    passedCount: number;
    totalQuestions: number;
    generalFeedback: string;
    focusTopics: string[];
    tutorAdvice: string;
  };
}

export interface SVGShape {
  type: 'circle' | 'rect' | 'line' | 'arrow' | 'text';
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color: string;
  label?: string;
  text?: string;
  strokeWidth?: number;
}

export interface MathHighlight {
  expression: string;
  highlight?: string;
  note: string;
}

export interface VizStep {
  label: string;
  explanation: string;
  visualElements?: {
    shapes?: SVGShape[];
    mathHighlight?: MathHighlight;
  };
}

export interface GraphPoint {
  x: number;
  y: number;
  label?: string;
}

export interface GraphConfig {
  equation: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  points: GraphPoint[];
}

export interface VisualizationResponse {
  title: string;
  type: 'animation' | 'math' | 'graph';
  steps: VizStep[];
  graphConfig?: GraphConfig;
}

export interface HistoryItem {
  id: string;
  itemType: 'quiz' | 'summary' | 'visualization';
  title: string;
  subject: string;
  savedAt: string;
  
  // Specific study structures
  difficulty?: 'easy' | 'medium' | 'hard';
  quizType?: 'multiple-choice' | 'short-answer';
  questions?: QuizQuestion[];
  userAnswers?: Record<number, string>;
  evaluation?: EvaluationResult | null;
  
  summaryData?: SummaryData;
  detailLevel?: 'concise' | 'standard' | 'thorough';

  vizPrompt?: string;
  vizResponse?: VisualizationResponse;
}
