// Shared "subject" concept for the Topic Picker (Quiz Builder, Notes
// Summarizer, Visualizer) and the Subject-Aware Content Engine. Kept in one
// file so the chip list, icons, and per-subject prompt instructions can
// never drift between the three screens the way three separately-typed
// heuristics already had (see looksLikeTopicPhrase duplication).

export type Subject = 'general' | 'english' | 'science' | 'geography' | 'math';

export interface SubjectOption {
  id: Subject;
  label: string;
  // Short description shown as a chip subtitle / tooltip.
  hint: string;
}

export const SUBJECT_OPTIONS: SubjectOption[] = [
  { id: 'general', label: 'General', hint: 'Any topic, mixed format' },
  { id: 'english', label: 'English & Lit', hint: 'Reading passage + comprehension' },
  { id: 'science', label: 'Science & Bio', hint: 'Labeled diagram parts' },
  { id: 'geography', label: 'Geography', hint: 'Map regions & coordinates' },
  { id: 'math', label: 'Math & Data', hint: 'Charts, tables, datasets' },
];

// Appended to the AI instructions in Quiz Builder / Notes Summarizer /
// Visualizer so the SAME subject choice produces a consistently-shaped,
// lightweight JSON payload across all three tools. Deliberately short — a
// few sentences, not a restated schema — since the per-tool code already
// carries the full JSON shape; this just steers content, keeping token
// usage down.
export function subjectPromptHint(subject: Subject): string {
  switch (subject) {
    case 'english':
      return 'Subject focus: English/Literature. Prefer a short original reading passage (120-220 words) as source material when none was provided, and build comprehension-style content directly from it (theme, inference, vocabulary-in-context, structure) rather than generic trivia.';
    case 'science':
      return 'Subject focus: Science/Biology. Prefer content built around a labeled diagram of the system or process involved (e.g. a plant, cell, atom, or organ system) — identify concrete, nameable parts a diagram would show, not just descriptive prose.';
    case 'geography':
      return 'Subject focus: Geography. Prefer content built around real places with plausible approximate latitude/longitude — countries, cities, landmarks, or regions relevant to the topic — so it can be shown on a map, not just described.';
    case 'math':
      return 'Subject focus: Math/Data Science. Prefer content built around concrete numeric data (a small dataset, table, or function) that could be charted or tabulated, rather than purely verbal explanation.';
    case 'general':
    default:
      return '';
  }
}

// Fixed vocabulary of local, pre-built diagram node assets the Visualizer's
// "diagram" mode can reference by id. The AI is instructed to choose from
// this exact list (see VisualizerScreen.tsx) rather than invent new ids or
// emit raw SVG/markup — this is what keeps output to a lightweight JSON
// pointer instead of a generated image or inline graphic. Grouped loosely
// by domain; see components/DiagramAssets.tsx for the actual rendering.
export const DIAGRAM_NODE_IDS = [
  // Plant biology
  'plant-root', 'plant-stem', 'plant-leaf', 'plant-flower', 'plant-soil', 'plant-sun', 'plant-water',
  // Cell biology
  'cell-membrane', 'cell-nucleus', 'cell-mitochondria',
  // Chemistry / physics
  'atom-nucleus', 'atom-electron-orbit',
  // Human body
  'organ-heart', 'organ-lung', 'organ-brain',
  // Generic fallback shapes (still routed through the asset library, not raw SVG)
  'generic-circle', 'generic-box', 'generic-arrow', 'generic-label',
] as const;

export type DiagramNodeId = (typeof DIAGRAM_NODE_IDS)[number];
