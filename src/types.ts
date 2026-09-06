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

// ---------------------------------------------------------------------------
// Dynamic Forms — Subject-Aware structured content, shared across Quiz
// Builder and NoteCraft. Each of these fields is OPTIONAL and only ever
// populated when it's actually relevant (see lib/subjects.ts
// buildStructuredFieldsClause, which is what tells the AI when to include
// each one). `StructuredContent` is the shared shape both QuizData and
// SummaryData extend, so a single rendering component
// (components/blocks/SubjectContentBlocks.tsx) can render either one
// without the two screens maintaining separate, drifting block lists.
// ---------------------------------------------------------------------------

// A generic spreadsheet-shaped table: used both for "any subject, data-heavy
// content" (the `table` field) and for Geography/History's country/region
// quick-reference (`factSheetTable`) — same shape, different field name so
// a response can carry both independently without colliding.
export interface DataTable {
  headers: string[];
  rows: (string | number)[][];
}

// Math & Physics: one step of a worked solution or proof. `latex` is
// optional since not every step of a proof needs its own displayed
// expression — some are prose ("therefore, by substitution...").
export interface SolutionStep {
  step: string;
  latex?: string;
}

// Science & Biology: one stage of a process/cycle (water cycle,
// photosynthesis, mitosis, etc.), in order.
export interface ProcessFlowStep {
  step: string;
  description: string;
}

// Science & Biology: the independent/dependent (and optionally controlled)
// variables of an experiment or investigation.
export interface ExperimentVariables {
  independent: string;
  dependent: string;
  controlled?: string[];
}

// Geography & History: one dated event on a timeline, with why it matters.
export interface TimelineEvent {
  date: string;
  event: string;
  significance: string;
}

// English & Literature: what kind of text `passage` actually is, so the UI
// can label it correctly instead of always saying "Reading Passage" even
// when the AI produced a poem or a short story.
export type PassageType = 'reading_passage' | 'context_story' | 'poem';

export interface StructuredContent {
  // English & Literature: a short original passage/story/poem the content
  // is drawn from, kept completely separate from the summary or questions.
  passage?: string;
  passageType?: PassageType;
  // Math & Physics
  formulas?: string[]; // clean LaTeX strings, never text shorthand
  solutionSteps?: SolutionStep[];
  // Science & Biology
  processFlow?: ProcessFlowStep[];
  variables?: ExperimentVariables;
  chemicalEquations?: string[];
  // Geography & History
  timeline?: TimelineEvent[];
  factSheetTable?: DataTable;
  // Any subject, data-heavy content
  table?: DataTable;
  // Both pages: search terms for pulling in relevant educational images
  imageQueries?: string[];
}

export interface QuizData extends StructuredContent {
  title: string;
  subject?: Subject;
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

export interface SummaryData extends StructuredContent {
  title: string;
  subject?: Subject;
  overview: string;
  keyPoints: string[];
  glossary: GlossaryItem[];
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
  // 'shared': created locally from a SharedCardSnapshot a student saved out
  // of a deep-linked flashcard someone else sent them (see
  // lib/sharedCards.ts / components/SharedCardViewer.tsx). Distinguished
  // from 'manual' so the library/history UI can show where it really came
  // from instead of implying the student typed it themselves.
  sourceType: 'quiz' | 'summary' | 'concept-link' | 'manual' | 'shared';
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

// ---------------------------------------------------------------------------
// Notification Center — every notification (review-ready, exam reminders,
// quiz-resume nudges) is recorded here, not just fired as a browser
// Notification, so students who miss or block the OS notification still
// have a place to see what happened. See lib/notificationCenter.ts and
// components/NotificationCenter.tsx.
// ---------------------------------------------------------------------------

export type NotificationType = 'review_ready' | 'exam_reminder' | 'quiz_resume' | 'general';

// Mirrors BottomNav's NavTab union without importing it — types.ts stays a
// leaf module with no component imports. Keep in sync with
// components/BottomNav.tsx if a tab is ever added/renamed.
export type NotificationTargetTab = 'home' | 'quiz' | 'community' | 'review' | 'profile';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string; // ISO date
  read: boolean;
  // Which tab tapping this notification should switch to, if any.
  targetTab?: NotificationTargetTab;
  // Collapses repeat notifications of the same kind (e.g. re-checking the
  // same due exam on the next poll) into a single unread entry instead of
  // stacking duplicates — same idea as the browser Notification `tag` in
  // lib/notifications.ts. A new notification with a tag that already has an
  // *unread* match is dropped; once the student reads it, the next one with
  // that tag is added fresh.
  dedupeTag?: string;
}

// ---------------------------------------------------------------------------
// Lightweight Flashcard Sharing & External Link Hub (Review Screen)
// ---------------------------------------------------------------------------

// The publicly-readable snapshot a `/card/:id` deep link resolves to (see
// lib/sharedCards.ts). Deliberately NOT a RecallCard — no schedule, ease
// factor, reps, or collectionId, since that's private study data a link
// recipient has no business seeing. Lives in a top-level `sharedCards`
// collection (not scoped under the sender's uid) so it's readable by anyone
// with the link, without opening up the sender's private recallCards data.
export interface SharedCardSnapshot {
  id: string;
  prompt: string;
  answer: string;
  sourceTitle: string;
  image?: string;
  sharedAt: string; // ISO date
}

export interface SharedCollectionCard {
  id: string;
  prompt: string;
  answer: string;
  sourceTitle: string;
  image?: string;
}

export interface SharedCollectionSnapshot {
  id: string;
  name: string;
  cards: SharedCollectionCard[];
  sharedAt: string;
}

// 'link' = an external URL the poster is pointing at (nothing stored but
// the URL string). 'file' = something the poster uploaded directly, stored
// in Firebase Storage. Older docs written before file uploads existed have
// no `kind` field at all — treat a missing `kind` as 'link' everywhere this
// type is read (see normalizeMaterial in lib/communityLinks.ts).
export type MaterialKind = 'link' | 'file';

// A community-submitted piece of study material — the Materials page.
// Lives in a single global Firestore collection `communityLinks` — NOT
// scoped per user — since these are meant to be shared across every
// student using the app.
//
// For kind 'link': `url` is the external site the poster is sharing, and
// tapping a result hands it straight to window.open() — no file is ever
// uploaded to or proxied through Firebase for these.
//
// For kind 'file': the actual bytes are uploaded to Firebase Storage (see
// uploadCommunityFile in lib/communityLinks.ts), and `url` is that file's
// Storage download URL. Those uploads are made with a `contentDisposition:
// attachment` header, so tapping a result still just calls window.open() —
// the browser downloads the file straight to the student's device instead
// of previewing it inline, the same "you have to save it to open it"
// experience as an image or PDF someone sends you on a phone. Uploaded
// files are capped at MATERIAL_MAX_FILE_SIZE_BYTES (constants.ts) and are
// auto-deleted after MATERIAL_FILE_EXPIRY_DAYS to keep Storage usage low —
// see `expiresAt` below and MATERIALS_SETUP.md for how that's enforced.
export interface CommunityLink {
  id: string;
  kind?: MaterialKind;
  title: string;
  titleLower: string; // normalized copy of title, search only
  url: string;
  // Optional free-text topic label, e.g. "Algebra 1" — kept from the
  // original link-only version of this feature, but no longer part of
  // search (see gradeLevel/titleLower below, which are).
  subjectTag?: string;
  subjectTagLower?: string;
  gradeLevel: string; // one of GRADE_LEVEL_OPTIONS, constants.ts
  gradeLevelLower: string; // normalized copy of gradeLevel, search only
  description: string; // poster's <=50-word summary of what the material is/covers
  submittedBy: string; // uid of the student who shared it, or 'guest'
  createdAt: string; // ISO date
  // Epoch-ms copy of createdAt. Firestore/Storage security rules can't
  // parse an ISO string into a timestamp to do date math, so this field
  // exists purely so the auto-delete window can be enforced/queried
  // without a Cloud Function — see MATERIALS_SETUP.md.
  createdAtMillis: number;
  // File-only fields (present when kind === 'file').
  fileName?: string;
  fileType?: string; // MIME type
  fileSizeBytes?: number;
  // Storage object path, needed to delete the file itself once it expires
  // — deleting the Firestore doc alone would leave the bytes orphaned in
  // Storage forever.
  storagePath?: string;
  // ISO date the file is due for auto-deletion; undefined for kind 'link'
  // since links never expire (there's nothing of ours to delete).
  expiresAt?: string;
  // Epoch-ms copy of expiresAt — same reasoning as createdAtMillis: the
  // Storage/Firestore security rules that grant "anyone can delete this
  // once it's expired" permission need to do real date math, and rules
  // can't reliably parse an ISO string into a timestamp to compare against
  // request.time.
  expiresAtMillis?: number;
}