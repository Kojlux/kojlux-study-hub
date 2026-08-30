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

// Subject-Aware Content Engine: which of the picker's subjects this
// item was generated for. Drives which of the optional structured fields
// below (passage/diagramNodes/regions/dataset) is populated, if any —
// 'general' items populate none of them and behave exactly as before.
export type Subject = 'general' | 'english' | 'science' | 'geography' | 'math';

// Geography: a real-world place with an approximate coordinate, meant for
// local map rendering (see components/MapWidget in VisualizerScreen) —
// never a rendered map image, just the lightweight coordinate data.
export interface MapRegion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
}

// Math/Data Science: a small numeric dataset shaped for local chart
// rendering (Recharts/Chart.js) rather than an AI-generated chart image.
export interface NumericDataset {
  chartType: 'bar' | 'line' | 'scatter';
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface QuizData {
  title: string;
  subject?: Subject;
  // English & Literature: a short original reading passage the questions
  // are drawn from, shown to the student above the questions.
  passage?: string;
  questions: QuizQuestion[];
}

// A study-material file the user attached to a quiz/summary request, staged
// client-side before it's sent to Gemini. `kind` determines whether the main
// quiz/summarizer/visualizer model can read it directly (image, pdf) or
// needs a first pass through Recall Coach first (video) — see
// isDirectlyReadable / describeFileWithRecallCoach in lib/gemini.ts.
export type StudyFileKind = 'image' | 'pdf' | 'video';

export interface StudyFile {
  dataUrl: string;
  mimeType: string;
  kind: StudyFileKind;
  name: string;
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
  subject?: Subject;
  overview: string;
  keyPoints: string[];
  glossary: GlossaryItem[];
  // English & Literature: short original passage the summary is based on.
  passage?: string;
  // Science & Biology: named, diagram-able parts of the system/process
  // being summarized (e.g. plant anatomy) — ids drawn from the same fixed
  // vocabulary the Visualizer's diagram nodes use (see lib/subjects.ts),
  // so the same local asset library can render them for an interactive
  // labeling task.
  diagramNodes?: { nodeId: string; label: string }[];
  // Geography: real places relevant to the material, for map display.
  regions?: MapRegion[];
  // Math & Data Science: a small numeric dataset relevant to the material.
  dataset?: NumericDataset;
}

// A single node in the spaced-repetition queue. Generated automatically from
// quiz questions and summary key points ("Recall Coach"). Scheduling uses a
// simplified SM-2 style algorithm (ease factor + growing interval in days).
export interface RecallCard {
  id: string;
  sourceType: 'quiz' | 'summary' | 'concept-link' | 'manual';
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
  // Whether this card has been kept in the student's permanent saved-cards
  // library (separate from the spaced-repetition schedule above, which
  // every card still goes through regardless of `saved`). Hand-typed cards
  // (sourceType 'manual') are saved automatically the moment they're made;
  // AI-generated cards (quiz/summary/concept-link) start unsaved and only
  // get `saved: true` once the student taps the Save button on the card.
  saved?: boolean;
  // Which Collection (see below) this card has been filed into, if any.
  // A saved card doesn't have to belong to a collection — collections are
  // just an optional way to group saved cards from the same subject/topic
  // together so they can be browsed or displayed as a set later.
  collectionId?: string;
}

// A student-named folder of saved RecallCards, e.g. "Bio Midterm" or
// "Spanish Vocab" — lets cards from the same subject be grouped together
// and later browsed or displayed as a set (see collectionId on RecallCard).
export interface Collection {
  id: string;
  name: string;
  createdAt: string; // ISO date
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

// A student-entered exam/test saved from the Study Calendar. `date` is a
// plain "YYYY-MM-DD" calendar day with no time component — an exam is a day,
// not an instant, so it's stored and compared that way everywhere (see
// lib/examReminders.ts) to avoid timezone-shift bugs a full ISO datetime
// would invite here.
export interface ExamEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  // Free-text subject/category, e.g. "Algebra II" — separate from `color`,
  // which is just a visual tag the student picks so exams are easy to
  // tell apart at a glance on the calendar grid.
  subject?: string;
  color: string; // key into EXAM_COLORS, components/CalendarScreen.tsx
  notes?: string;
  // Optional link to an existing quiz/summary in history, so a saved exam
  // can point straight at material the student already generated for it.
  linkedHistoryId?: string;
  createdAt: string; // ISO date
  // Set once the 1-day-before study reminder has actually fired, so the
  // periodic check in App.tsx never sends it twice for the same exam.
  reminderSent?: boolean;
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

// A single shape/element within an animation or diagram step. `type: "node"`
// is the Subject-Aware / realistic-graphics case: rather than the AI
// describing a plain circle/rect, it points at a pre-built local asset by
// id (see lib/subjects.ts DIAGRAM_NODE_IDS and components/DiagramAssets.tsx)
// using the SAME lightweight coordinate fields (x/y/width/height/label/
// color) every other shape already uses — no raw SVG or markup ever comes
// from the model, only this small JSON pointer.
export interface VisualizationShape {
  type: 'circle' | 'rect' | 'line' | 'arrow' | 'text' | 'node';
  cx?: number; cy?: number; r?: number;
  x?: number; y?: number; width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  color?: string; label?: string; text?: string; strokeWidth?: number;
  // Required when type is "node" — one of DIAGRAM_NODE_IDS.
  nodeId?: string;
}

export interface VisualizationStep {
  label: string;
  explanation: string;
  visualElements?: { shapes?: VisualizationShape[]; mathHighlight?: MathHighlight };
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
  // 'diagram' = realistic node-based diagram (Subject-Aware Science/Bio);
  // 'map' = geography regions/coordinates; 'dataset' = a math/data chart.
  // The original 'animation' type still works exactly as before (plain
  // shapes) — 'diagram' is the same rendering path with `node` shapes.
  type: 'graph' | 'math' | 'animation' | 'diagram' | 'map' | 'dataset';
  subject?: string;
  steps: VisualizationStep[];
  graphConfig?: VisualizationGraphConfig;
  // Populated when type is "map".
  regions?: MapRegion[];
  // Populated when type is "dataset".
  dataset?: NumericDataset;
}