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
  { id: 'science', label: 'Science & Bio', hint: 'Process flows, variables, diagram parts' },
  { id: 'geography', label: 'Geography & History', hint: 'Timelines, fact sheets, map regions' },
  { id: 'math', label: 'Math & Physics', hint: 'LaTeX formulas, worked solutions, datasets' },
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

// ---------------------------------------------------------------------------
// Dynamic Forms — the single source of truth for which extra structured
// JSON fields get requested for a given subject. Both QuizBuilder.tsx and
// NoteCraft.tsx call buildStructuredFieldsClause() instead of each keeping
// their own ternary chain of subject -> schema fragment, which is what let
// the two screens drift apart before (see QuizBuilder's old isEnglish-only
// special case vs. NoteCraft's separate extraField chain). Adding or tuning
// a field now only ever happens here.
//
// Each StructuredField pairs the literal JSON schema fragment (spliced into
// the "Respond ONLY with strict JSON..." line) with a one-line rule that
// tells the model exactly when to include vs. omit it — kept as prose
// instructions rather than crammed into the schema line itself, so the
// shape stays readable at a glance.
// ---------------------------------------------------------------------------
export interface StructuredField {
  schema: string;
  rule: string;
}

// Cross-cutting fields available to ANY subject — Task spec calls these out
// as applying regardless of the selected subject pill.
function universalStructuredFields(): StructuredField[] {
  return [
    {
      schema: '"table": {"headers": [string, ...], "rows": [[string, ...], ...]}',
      rule:
        'Include "table" ONLY when the material is naturally tabular or data-heavy (comparisons, statistics, spreadsheet-like data) — every row array must have the same length as "headers". Omit entirely if nothing warrants a table.',
    },
    {
      schema: '"imageQueries": [string, ...]',
      rule:
        'Include "imageQueries" with 1-4 short, specific image search terms for concrete visual subjects mentioned by name (people, places, artifacts, organisms, artworks). Every query must stand on its own with NO pronouns ("he", "his", "it") and NO bare descriptors ("physical appearance", "the leader") — always spell out the full proper name plus a disambiguating detail, e.g. "Muammar Gaddafi 1970s portrait" rather than "his physical appearance". Omit if nothing genuinely benefits from an image.',
    },
  ];
}

function subjectStructuredFields(subject: Subject): StructuredField[] {
  switch (subject) {
    case 'math':
      return [
        {
          schema: '"formulas": [string, ...]',
          rule:
            '"formulas" holds every formula/equation involved as a clean LaTeX string (e.g. "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"). NEVER use plain-text shorthand like x^2, sqrt(x), or 1/2 — always proper LaTeX commands (\\\\frac, \\\\sqrt, ^{}, _{}). Omit if the content has no formulas.',
        },
        {
          schema: '"solutionSteps": [{"step": string, "latex": string}, ...]',
          rule:
            '"solutionSteps" breaks a worked problem or proof into ordered steps, each with a short plain-English description and, where applicable, the LaTeX for that step. Omit for purely conceptual, non-computational content.',
        },
      ];
    case 'science':
      return [
        {
          schema: '"processFlow": [{"step": string, "description": string}, ...]',
          rule:
            '"processFlow" lists the ordered stages of a biological or physical process/cycle (e.g. water cycle, photosynthesis, mitosis). Omit if the content isn\'t about a process or cycle.',
        },
        {
          schema: '"variables": {"independent": string, "dependent": string, "controlled": [string, ...]}',
          rule:
            '"variables" names the independent and dependent variables (and controlled variables, if relevant) — ONLY for experiment/investigation content. Omit otherwise.',
        },
        {
          schema: '"chemicalEquations": [string, ...]',
          rule:
            '"chemicalEquations" holds any balanced chemical equations as plain formula strings (e.g. "6CO2 + 6H2O -> C6H12O6 + 6O2"). Omit if none apply.',
        },
      ];
    case 'geography':
      return [
        {
          schema: '"timeline": [{"date": string, "event": string, "significance": string}, ...]',
          rule:
            '"timeline" lists 3-8 chronological events relevant to the material, each with a date/era, a short description of what happened, and why it matters. Omit for content with no historical/chronological angle.',
        },
        {
          schema: '"factSheetTable": {"headers": [string, ...], "rows": [[string, ...], ...]}',
          rule:
            '"factSheetTable" is a quick-reference table for a specific named country/region — e.g. headers like ["Capital", "Population", "Coordinates"] with one data row. Omit if the material isn\'t about a specific named place.',
        },
      ];
    case 'english':
      return [
        {
          schema: '"passage": string, "passageType": "reading_passage" | "context_story" | "poem"',
          rule:
            '"passage" is a short original text (120-220 words, or a complete short poem) that the content is drawn from — kept completely separate from the summary/overview or question text. Set "passageType" to whichever of "reading_passage", "context_story", or "poem" best fits. Always include both fields for this subject.',
        },
      ];
    case 'general':
    default:
      return [];
  }
}

// Returns a ready-to-splice JSON schema fragment (leading-comma-prefixed, so
// it can be appended directly inside an existing `{...}` shape) plus the
// prose rules explaining when to fill each field in. Callers append
// `schemaFields` right before the closing `}` of their JSON shape line, and
// append `rules` as its own paragraph afterward.
export function buildStructuredFieldsClause(subject: Subject): { schemaFields: string; rules: string } {
  const fields = [...subjectStructuredFields(subject), ...universalStructuredFields()];
  if (fields.length === 0) return { schemaFields: '', rules: '' };
  return {
    schemaFields: fields.map((f) => `, ${f.schema}`).join(''),
    rules: fields.map((f) => f.rule).join('\n'),
  };
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