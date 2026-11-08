import { Type } from '@google/genai';
import type { Schema } from '@google/genai';

const str: Schema = { type: Type.STRING };
const num: Schema = { type: Type.NUMBER };
const integer: Schema = { type: Type.INTEGER };
const strings: Schema = { type: Type.ARRAY, items: str };
const array = (items: Schema): Schema => ({ type: Type.ARRAY, items });
const object = (properties: Record<string, Schema>, required: string[]): Schema => ({
  type: Type.OBJECT,
  properties,
  required,
});
const enumString = (values: string[]): Schema => ({
  type: Type.STRING,
  format: 'enum',
  enum: values,
});
const union = (schemas: Schema[]): Schema => ({ anyOf: schemas });

const MAX_ANSWERABLE_QUESTION_WORDS = 25;
const MAX_NOTES_SCHEMA_ADDONS = 3;
const NOTES_OPTIONAL_FIELD_KEYS = [
  'diagramNodes',
  'regions',
  'dataset',
  'formulas',
  'solutionSteps',
  'processFlow',
  'variables',
  'chemicalEquations',
  'timeline',
  'factSheetTable',
  'table',
  'imageQueries',
  'passage',
] as const;
const MAX_QUIZ_QUESTIONS = 15;
const VISUALS_REQUIRED_PER_FIVE_QUESTIONS = 2;
const MAX_TABLE_CELL_WORDS = 8;
const MAX_TABLE_HEADER_WORDS = 5;
const MAX_TABLE_CAPTION_WORDS = 10;
const answerableQuestionText: Schema = {
  type: Type.STRING,
  description: 'The answerable question only; use 25 words or fewer.',
};
const compactTableHeader: Schema = {
  type: Type.STRING,
  description: 'A concise chart or table header of 5 words or fewer.',
};
const compactTableCell: Schema = {
  type: Type.STRING,
  description: 'Concise text of 8 words or fewer for one chart or table cell.',
};

const simulationSchema = object({
  type: enumString(['INTERACTIVE_SIMULATION']),
  title: str,
  conceptObjective: str,
  sandboxVariables: array(object({
    name: str,
    defaultValue: union([str, num]),
    valueType: enumString(['number', 'boolean', 'string']),
    minRange: num,
    maxRange: num,
    step: num,
  }, ['name', 'defaultValue', 'valueType'])),
  stateTransitions: array(object({
    ifVariable: str,
    condition: enumString(['equals', 'greater_than', 'less_than']),
    targetValue: union([str, num]),
    resultingVisualStateDescription: str,
  }, ['ifVariable', 'condition', 'targetValue', 'resultingVisualStateDescription'])),
  initialRenderMarkdown: str,
}, ['type', 'title', 'conceptObjective', 'sandboxVariables', 'stateTransitions', 'initialRenderMarkdown']);

const diagnosticSchema = object({
  type: enumString(['DIAGNOSTIC_QUESTION_LOOP']),
  contextAnchorId: str,
  probingPrompt: answerableQuestionText,
  questionType: enumString(['MULTIPLE_CHOICE', 'TEXT_INPUT', 'BOOLEAN_TOGGLE']),
  options: strings,
  expectedAnswerPattern: str,
  hints: strings,
  targetedRemediationExplanation: str,
}, ['type', 'contextAnchorId', 'probingPrompt', 'questionType', 'expectedAnswerPattern', 'hints', 'targetedRemediationExplanation']);

const dragAndDropSchema = object({
  type: enumString(['DRAG_AND_DROP']),
  instruction: str,
  draggableItems: strings,
  dropZones: array(object({
    id: str,
    targetDescription: str,
    correctItemValue: str,
  }, ['id', 'targetDescription', 'correctItemValue'])),
}, ['type', 'instruction', 'draggableItems', 'dropZones']);

const multiPartQuestionSchema = object({
  type: enumString(['MULTI_PART_QUESTION']),
  sharedContextMarkdown: str,
  parts: array(object({
    partNumber: integer,
    questionText: answerableQuestionText,
    questionType: enumString(['MULTIPLE_CHOICE', 'SHORT_TEXT']),
    options: strings,
    correctAnswer: str,
    remediationIfWrong: str,
    unlocksPartNumber: integer,
  }, ['partNumber', 'questionText', 'questionType', 'correctAnswer', 'remediationIfWrong'])),
}, ['type', 'sharedContextMarkdown', 'parts']);

const areaModelSchema = object({
  type: enumString(['AREA_MODEL']),
  explanation: str,
  topLabels: strings,
  leftLabels: strings,
  gridCells: array(object({ row: integer, col: integer, value: str, derivation: str }, ['row', 'col', 'value', 'derivation'])),
}, ['type', 'explanation', 'topLabels', 'leftLabels', 'gridCells']);

const coordinateGeometrySchema = object({
  type: enumString(['COORDINATE_GEOMETRY']),
  equation: str,
  graphType: enumString(['LINEAR', 'QUADRATIC', 'TRIGONOMETRIC', 'EXPONENTIAL', 'POLYNOMIAL']),
  keyPoints: array(object({
    x: num, y: num, label: str, mathematicalSignificance: str,
  }, ['x', 'y', 'label', 'mathematicalSignificance'])),
  bounds: object({ xMin: num, xMax: num, yMin: num, yMax: num }, ['xMin', 'xMax', 'yMin', 'yMax']),
}, ['type', 'equation', 'graphType', 'keyPoints', 'bounds']);

const formulaSchema = object({
  type: enumString(['FORMULA_DISPLAY']),
  title: str,
  rawLatex: str,
  variables: array(object({ symbol: str, meaning: str, unit: str }, ['symbol', 'meaning'])),
}, ['type', 'title', 'rawLatex', 'variables']);

const processFlowSchema = object({
  type: enumString(['PROCESS_FLOW']),
  processName: str,
  steps: array(object({ stepNumber: integer, title: str, mechanism: str, trigger: str }, ['stepNumber', 'title', 'mechanism'])),
}, ['type', 'processName', 'steps']);

const timelineSchema = object({
  type: enumString(['HISTORICAL_TIMELINE']),
  eraOrPeriod: str,
  events: array(object({ dateOrEra: str, title: str, significance: str }, ['dateOrEra', 'title', 'significance'])),
}, ['type', 'eraOrPeriod', 'events']);

const comparativeTableSchema = object({
  type: enumString(['COMPARATIVE_TABLE']),
  caption: {
    type: Type.STRING,
    description: 'A concise caption of 10 words or fewer.',
  },
  headers: array(compactTableHeader),
  rows: array(array(compactTableCell)),
}, ['type', 'caption', 'headers', 'rows']);

const componentSchemas: Schema[] = [
  simulationSchema,
  diagnosticSchema,
  dragAndDropSchema,
  multiPartQuestionSchema,
  areaModelSchema,
  coordinateGeometrySchema,
  formulaSchema,
  processFlowSchema,
  timelineSchema,
  object({
    type: enumString(['READING_PASSAGE']),
    passageText: str,
    contextOrAuthor: str,
    literaryDevices: array(object({ device: str, exampleText: str, effect: str }, ['device', 'exampleText', 'effect'])),
  }, ['type', 'passageText', 'literaryDevices']),
  comparativeTableSchema,
  object({
    type: enumString(['CONCEPT_HIERARCHY']),
    rootConcept: str,
    subConcepts: array(object({ name: str, definition: str, parentName: str }, ['name', 'definition', 'parentName'])),
  }, ['type', 'rootConcept', 'subConcepts']),
  object({
    type: enumString(['CODING_SANDBOX']),
    language: str,
    initialCode: str,
    expectedOutput: str,
    testCases: array(object({ input: str, output: str }, ['input', 'output'])),
  }, ['type', 'language', 'initialCode', 'expectedOutput', 'testCases']),
  object({
    type: enumString(['LAB_EXPERIMENT']),
    title: str,
    materialsNeeded: strings,
    safetyPrecautions: strings,
    procedureSteps: strings,
    expectedObservation: str,
  }, ['type', 'title', 'materialsNeeded', 'safetyPrecautions', 'procedureSteps', 'expectedObservation']),
  object({
    type: enumString(['FLASHCARD_DECK']),
    cards: array(object({ front: str, back: str, hint: str }, ['front', 'back'])),
  }, ['type', 'cards']),
];

const metadataSchema = object({
  generatedAt: {
    type: Type.STRING,
    format: 'date-time',
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$',
  },
  estimatedExamDate: { type: Type.STRING, format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  subject: str,
  topic: str,
  orchestratorReasoning: str,
}, ['generatedAt', 'subject', 'topic', 'orchestratorReasoning']);

const tableSchema = object({
  headers: array(compactTableHeader),
  rows: array(array(union([compactTableCell, num]))),
}, ['headers', 'rows']);
const legacyStructuredProperties: Record<string, Schema> = {
  passage: str,
  passageType: enumString(['reading_passage', 'context_story', 'poem']),
  formulas: strings,
  solutionSteps: array(object({ step: str, latex: str }, ['step'])),
  processFlow: array(object({ step: str, description: str }, ['step', 'description'])),
  variables: object({ independent: str, dependent: str, controlled: strings }, ['independent', 'dependent']),
  chemicalEquations: strings,
  timeline: array(object({ date: str, event: str, significance: str }, ['date', 'event', 'significance'])),
  factSheetTable: tableSchema,
  table: tableSchema,
  imageQueries: strings,
};

const quizQuestionSchema = object({
  type: enumString(['multiple-choice', 'short-answer']),
  question: answerableQuestionText,
  options: strings,
  parts: array(object({
    partNumber: integer,
    questionText: answerableQuestionText,
    type: enumString(['multiple-choice', 'short-answer']),
    options: strings,
    hints: strings,
    remediationIfWrong: str,
    correctAnswer: str,
    explanation: str,
  }, ['partNumber', 'questionText', 'type', 'correctAnswer'])),
  correctAnswer: str,
  explanation: str,
  visual: union([
    areaModelSchema,
    coordinateGeometrySchema,
    formulaSchema,
    processFlowSchema,
    timelineSchema,
    comparativeTableSchema,
  ]),
}, ['type', 'question', 'correctAnswer']);

const quizProperties: Record<string, Schema> = {
  title: str,
  subject: enumString(['general', 'english', 'science', 'geography', 'math']),
  questions: array(quizQuestionSchema),
  metadata: metadataSchema,
  dynamicComponents: array(dragAndDropSchema),
};

const notesProperties: Record<string, Schema> = {
  title: str,
  subject: enumString(['general', 'english', 'science', 'geography', 'math']),
  overview: str,
  keyPoints: strings,
  glossary: array(object({ term: str, definition: str }, ['term', 'definition'])),
  diagramNodes: array(object({ label: str }, ['label'])),
  regions: array(object({
    id: str, name: str, lat: num, lng: num, note: str,
  }, ['id', 'name', 'lat', 'lng'])),
  dataset: object({
    chartType: enumString(['bar', 'line', 'scatter']),
    labels: array(compactTableHeader),
    series: array(object({ name: compactTableHeader, values: array(num) }, ['name', 'values'])),
  }, ['chartType', 'labels', 'series']),
  metadata: metadataSchema,
  dynamicComponents: array(union(componentSchemas.filter((schema) => schema !== diagnosticSchema))),
  ...legacyStructuredProperties,
};

export type KojluxGenerationMode = 'quiz' | 'notes';

const COMPONENT_TYPES = new Set([
  'INTERACTIVE_SIMULATION',
  'DIAGNOSTIC_QUESTION_LOOP',
  'DRAG_AND_DROP',
  'MULTI_PART_QUESTION',
  'AREA_MODEL',
  'COORDINATE_GEOMETRY',
  'FORMULA_DISPLAY',
  'PROCESS_FLOW',
  'HISTORICAL_TIMELINE',
  'READING_PASSAGE',
  'COMPARATIVE_TABLE',
  'CONCEPT_HIERARCHY',
  'CODING_SANDBOX',
  'LAB_EXPERIMENT',
  'FLASHCARD_DECK',
]);

function isStrictIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    Number(hourText) < 24 &&
    Number(minuteText) < 60 &&
    Number(secondText) < 60 &&
    (!offsetHourText || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) < 60));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isWithinWordLimit(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && wordCount(value) <= limit;
}

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

export function normalizeKojluxPayload(value: unknown, mode: KojluxGenerationMode): unknown {
  if (!isRecord(value)) return value;
  const payload = value;
  if (mode === 'quiz') {
    if (!Array.isArray(payload.questions)) return value;
    let changed = false;
    const questions = payload.questions.map((question) => {
      if (!isRecord(question) || !Array.isArray(question.parts)) return question;
      const parts = question.parts;
      const validParts = parts.filter((part, index): part is Record<string, unknown> =>
        isRecord(part) &&
        part.partNumber === index + 1 &&
        isWithinWordLimit(part.questionText, MAX_ANSWERABLE_QUESTION_WORDS) &&
        part.type === question.type &&
        ['multiple-choice', 'short-answer'].includes(String(part.type)) &&
        typeof part.correctAnswer === 'string' &&
        (part.type !== 'multiple-choice' ||
          (isStringArray(part.options) && part.options.includes(part.correctAnswer))) &&
        (
          (part.hints === undefined && part.remediationIfWrong === undefined) ||
          (part.type === 'multiple-choice' &&
            isStringArray(part.hints) &&
            part.hints.length > 0 &&
            typeof part.remediationIfWrong === 'string')
        )
      );
      const totalPartWords = parts.reduce((total, part) =>
        total + (isRecord(part) && typeof part.questionText === 'string' ? wordCount(part.questionText) : 0), 0);
      if (parts.length >= 2 && validParts.length === parts.length &&
          totalPartWords <= MAX_ANSWERABLE_QUESTION_WORDS) {
        return question;
      }

      changed = true;
      const firstPart = validParts[0];
      if (!firstPart) {
        const standardQuestion = { ...question };
        delete standardQuestion.parts;
        return standardQuestion;
      }
      const {
        questionText,
        correctAnswer,
        options,
        hints,
        remediationIfWrong,
      } = firstPart;
      const normalizedQuestion: Record<string, unknown> = {
        ...question,
        question: questionText,
        correctAnswer,
      };
      delete normalizedQuestion.parts;
      if (options !== undefined) normalizedQuestion.options = options;
      if (hints !== undefined) normalizedQuestion.hints = hints;
      if (remediationIfWrong !== undefined) normalizedQuestion.remediationIfWrong = remediationIfWrong;
      return normalizedQuestion;
    });
    return changed ? { ...payload, questions } : value;
  }

  const components = payload.dynamicComponents;
  const retainedSourceComponents = Array.isArray(components)
    ? components.filter((component) =>
      isRecord(component) &&
      COMPONENT_TYPES.has(typeof component.type === 'string' ? component.type : '') &&
      component.type !== 'DIAGNOSTIC_QUESTION_LOOP'
    )
    : components;

  const optionalCount = NOTES_OPTIONAL_FIELD_KEYS.filter((key) => hasContent(payload[key])).length +
    (!hasContent(payload.passage) && hasContent(payload.passageType) ? 1 : 0);
  const componentCount = Array.isArray(retainedSourceComponents) ? retainedSourceComponents.length : 0;
  const unsupportedComponentsRemoved = Array.isArray(components) &&
    retainedSourceComponents.length !== components.length;
  if (optionalCount + componentCount <= MAX_NOTES_SCHEMA_ADDONS) {
    return unsupportedComponentsRemoved
      ? { ...payload, dynamicComponents: retainedSourceComponents }
      : value;
  }

  const subject =
    (typeof payload.subject === 'string' && payload.subject) ||
    (isRecord(payload.metadata) && typeof payload.metadata.subject === 'string' ? payload.metadata.subject : 'general');
  const subjectPriority: Record<string, string[]> = {
    science: ['diagramNodes', 'processFlow', 'dynamicComponents', 'variables', 'chemicalEquations', 'imageQueries', 'table'],
    geography: ['regions', 'timeline', 'factSheetTable', 'dynamicComponents', 'imageQueries', 'table'],
    math: ['formulas', 'solutionSteps', 'dataset', 'dynamicComponents', 'table', 'imageQueries'],
    english: ['passage', 'dynamicComponents', 'imageQueries', 'table'],
    general: ['dynamicComponents', 'table', 'imageQueries', 'passage'],
  };
  const priority = subjectPriority[subject] ?? subjectPriority.general;
  const orderedKeys = [...priority, ...NOTES_OPTIONAL_FIELD_KEYS, 'dynamicComponents'];
  const seen = new Set<string>();
  const candidates: Array<{ key: string; index?: number }> = [];

  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === 'dynamicComponents') {
      if (Array.isArray(retainedSourceComponents)) {
        retainedSourceComponents.forEach((_, index) => candidates.push({ key, index }));
      }
    } else if (key === 'passage') {
      if (hasContent(payload.passage) || hasContent(payload.passageType)) candidates.push({ key });
    } else if ((NOTES_OPTIONAL_FIELD_KEYS as readonly string[]).includes(key) && hasContent(payload[key])) {
      candidates.push({ key });
    }
  }

  const retained = candidates.slice(0, MAX_NOTES_SCHEMA_ADDONS);
  const normalized: Record<string, unknown> = { ...payload };
  const retainedComponents: unknown[] = [];
  NOTES_OPTIONAL_FIELD_KEYS.forEach((key) => delete normalized[key]);
  if (Object.prototype.hasOwnProperty.call(payload, 'passageType')) delete normalized.passageType;
  if (Array.isArray(retainedSourceComponents)) normalized.dynamicComponents = retainedComponents;

  for (const candidate of retained) {
    if (candidate.key === 'dynamicComponents') {
      if (Array.isArray(retainedSourceComponents) && candidate.index !== undefined) {
        retainedComponents.push(retainedSourceComponents[candidate.index]);
      }
    } else if (candidate.key === 'passage') {
      if (Object.prototype.hasOwnProperty.call(payload, 'passage')) normalized.passage = payload.passage;
      if (Object.prototype.hasOwnProperty.call(payload, 'passageType')) normalized.passageType = payload.passageType;
    } else {
      normalized[candidate.key] = payload[candidate.key];
    }
  }
  return normalized;
}

function isCompactDataTable(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const headers = value.headers;
  const rows = value.rows;
  if (!isStringArray(headers) || !Array.isArray(rows)) {
    return false;
  }
  return headers.every((header) => wordCount(header) <= MAX_TABLE_HEADER_WORDS) &&
    rows.every((row) =>
      Array.isArray(row) &&
      row.length === headers.length &&
      row.every((cell) =>
        typeof cell === 'number' ||
        (typeof cell === 'string' && wordCount(cell) <= MAX_TABLE_CELL_WORDS)
      )
    );
}

function isCompactDataset(value: unknown): boolean {
  return isRecord(value) &&
    isStringArray(value.labels) &&
    value.labels.every((label) => wordCount(label) <= MAX_TABLE_HEADER_WORDS) &&
    Array.isArray(value.series) &&
    value.series.every((series) =>
      isRecord(series) &&
      typeof series.name === 'string' &&
      wordCount(series.name) <= MAX_TABLE_HEADER_WORDS
    );
}

function isQuizQuestionVisual(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'FORMULA_DISPLAY':
      return typeof value.title === 'string' &&
        typeof value.rawLatex === 'string' &&
        Array.isArray(value.variables) &&
        value.variables.every((item) => isRecord(item) &&
          typeof item.symbol === 'string' &&
          typeof item.meaning === 'string' &&
          (item.unit === undefined || typeof item.unit === 'string'));
    case 'AREA_MODEL':
      return typeof value.explanation === 'string' &&
        isStringArray(value.topLabels) &&
        isStringArray(value.leftLabels) &&
        Array.isArray(value.gridCells) &&
        value.gridCells.every((cell) => isRecord(cell) &&
          Number.isInteger(cell.row) &&
          Number.isInteger(cell.col) &&
          typeof cell.value === 'string' &&
          typeof cell.derivation === 'string');
    case 'COORDINATE_GEOMETRY':
      return typeof value.equation === 'string' &&
        ['LINEAR', 'QUADRATIC', 'TRIGONOMETRIC', 'EXPONENTIAL', 'POLYNOMIAL'].includes(String(value.graphType)) &&
        Array.isArray(value.keyPoints) &&
        value.keyPoints.every((point) => isRecord(point) &&
          typeof point.x === 'number' &&
          typeof point.y === 'number' &&
          typeof point.label === 'string' &&
          typeof point.mathematicalSignificance === 'string') &&
        isRecord(value.bounds) &&
        typeof value.bounds.xMin === 'number' &&
        typeof value.bounds.xMax === 'number' &&
        value.bounds.xMin < value.bounds.xMax &&
        typeof value.bounds.yMin === 'number' &&
        typeof value.bounds.yMax === 'number' &&
        value.bounds.yMin < value.bounds.yMax;
    case 'PROCESS_FLOW':
      return typeof value.processName === 'string' &&
        Array.isArray(value.steps) &&
        value.steps.every((step) => isRecord(step) &&
          Number.isInteger(step.stepNumber) &&
          typeof step.title === 'string' &&
          typeof step.mechanism === 'string' &&
          (step.trigger === undefined || typeof step.trigger === 'string'));
    case 'HISTORICAL_TIMELINE':
      return typeof value.eraOrPeriod === 'string' &&
        Array.isArray(value.events) &&
        value.events.every((event) => isRecord(event) &&
          typeof event.dateOrEra === 'string' &&
          typeof event.title === 'string' &&
          typeof event.significance === 'string');
    case 'COMPARATIVE_TABLE': {
      if (
        typeof value.caption !== 'string' ||
        !isStringArray(value.headers) ||
        !Array.isArray(value.rows)
      ) {
        return false;
      }
      const headers = value.headers;
      return wordCount(value.caption) <= MAX_TABLE_CAPTION_WORDS &&
        headers.every((header) => wordCount(header) <= MAX_TABLE_HEADER_WORDS) &&
        value.rows.every((row) =>
          isStringArray(row) &&
          row.length === headers.length &&
          row.every((cell) => wordCount(cell) <= MAX_TABLE_CELL_WORDS)
        );
    }
    default:
      return false;
  }
}

export function validateKojluxPayload(value: unknown, mode: KojluxGenerationMode): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Kojlux response must be a JSON object.');
  }
  const payload = value as Record<string, unknown>;
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Kojlux response is missing metadata.');
  }
  const meta = metadata as Record<string, unknown>;
  if (
    typeof meta.generatedAt !== 'string' ||
    !isStrictIsoTimestamp(meta.generatedAt)
  ) {
    throw new Error('metadata.generatedAt must be a strict ISO timestamp.');
  }
  if (
    typeof meta.subject !== 'string' ||
    typeof meta.topic !== 'string' ||
    typeof meta.orchestratorReasoning !== 'string'
  ) {
    throw new Error('Kojlux metadata must include subject, topic, and orchestratorReasoning strings.');
  }
  if (
    meta.estimatedExamDate !== undefined &&
    (typeof meta.estimatedExamDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(meta.estimatedExamDate) ||
      !Number.isFinite(Date.parse(`${meta.estimatedExamDate}T00:00:00Z`)) ||
      new Date(`${meta.estimatedExamDate}T00:00:00Z`).toISOString().slice(0, 10) !== meta.estimatedExamDate)
  ) {
    throw new Error('metadata.estimatedExamDate must be a valid YYYY-MM-DD date.');
  }
  if (!Array.isArray(payload.dynamicComponents) || payload.dynamicComponents.some((component) =>
    !component || typeof component !== 'object' || !COMPONENT_TYPES.has((component as { type?: string }).type ?? '')
  )) {
    throw new Error('Kojlux dynamicComponents must contain only registered educational component types.');
  }
  if (
    mode === 'quiz' &&
    payload.dynamicComponents.length !== 0
  ) {
    throw new Error('Quiz responses must not include standalone dynamic components.');
  }
  if (mode === 'quiz') {
    if (!Array.isArray(payload.questions)) {
      throw new Error('Quiz questions must be an array.');
    }
    if (payload.questions.length < 1 || payload.questions.length > MAX_QUIZ_QUESTIONS) {
      throw new Error(`Quiz responses must contain between 1 and ${MAX_QUIZ_QUESTIONS} questions.`);
    }
    let visualCount = 0;
    for (const question of payload.questions) {
      if (!isRecord(question)) {
        throw new Error('Each quiz question must be an object.');
      }
      if (Array.isArray(question.parts)) {
        if (
          question.parts.length < 2 ||
          question.parts.some((part, index) =>
            !isRecord(part) || part.partNumber !== index + 1
          ) ||
          question.parts.some((part) =>
            !isRecord(part) ||
            !isWithinWordLimit(part.questionText, MAX_ANSWERABLE_QUESTION_WORDS) ||
            !['multiple-choice', 'short-answer'].includes(String(part.type)) ||
            part.type !== question.type ||
            typeof part.correctAnswer !== 'string' ||
            (part.type === 'multiple-choice' &&
              (!Array.isArray(part.options) ||
                !part.options.every((option) => typeof option === 'string') ||
                !part.options.includes(part.correctAnswer))) ||
            ((part.hints !== undefined || part.remediationIfWrong !== undefined) &&
              (part.type !== 'multiple-choice' ||
                !Array.isArray(part.hints) ||
                !part.hints.length ||
                !part.hints.every((hint) => typeof hint === 'string') ||
                typeof part.remediationIfWrong !== 'string'))
          )
        ) {
          throw new Error('Multipart quiz questions need at least two valid answerable parts.');
        }
        const totalPartWords = question.parts.reduce((total, part) =>
          total + (isRecord(part) && typeof part.questionText === 'string' ? wordCount(part.questionText) : 0), 0);
        if (totalPartWords > MAX_ANSWERABLE_QUESTION_WORDS) {
          throw new Error('All answerable parts of one quiz question must total 25 words or fewer.');
        }
      } else if (!isWithinWordLimit(question.question, MAX_ANSWERABLE_QUESTION_WORDS)) {
        throw new Error('Each answerable quiz question must be 25 words or fewer.');
      }
      if (question.visual !== undefined) {
        visualCount += 1;
        if (!isQuizQuestionVisual(question.visual)) {
          throw new Error('Quiz question visuals must use a supported, valid type with concise table text.');
        }
      }
    }
    if (payload.questions.length < 5 && visualCount > 0) {
      throw new Error('Quizzes with fewer than five questions must not include visuals.');
    }
    const requiredVisualCount = Math.floor(payload.questions.length / 5) * VISUALS_REQUIRED_PER_FIVE_QUESTIONS;
    if (visualCount < requiredVisualCount) {
      throw new Error(`Quiz responses must include at least ${requiredVisualCount} visuals for ${payload.questions.length} questions.`);
    }
  } else {
    if ((payload.dynamicComponents as Array<Record<string, unknown>>).some(
      (component) => component.type === 'DIAGNOSTIC_QUESTION_LOOP'
    )) {
      throw new Error('Notecraft must teach the material and must not include quiz-style diagnostic questions.');
    }
    const optionalFieldCount = NOTES_OPTIONAL_FIELD_KEYS.filter((key) => hasContent(payload[key])).length +
      (!hasContent(payload.passage) && hasContent(payload.passageType) ? 1 : 0);
    if (optionalFieldCount + payload.dynamicComponents.length > MAX_NOTES_SCHEMA_ADDONS) {
      throw new Error('Notecraft responses may include at most three optional schema-based study aids.');
    }
    if (
      (payload.table !== undefined && !isCompactDataTable(payload.table)) ||
      (payload.factSheetTable !== undefined && !isCompactDataTable(payload.factSheetTable))
    ) {
      throw new Error('Table headers must be 5 words or fewer and text cells 8 words or fewer, with matching row lengths.');
    }
    if (payload.dataset !== undefined && !isCompactDataset(payload.dataset)) {
      throw new Error('Chart labels and series names must be 5 words or fewer.');
    }
  }
  for (const component of payload.dynamicComponents as Array<Record<string, unknown>>) {
    if (component.type === 'MULTI_PART_QUESTION') {
      if (
        !Array.isArray(component.parts) ||
        component.parts.length < 2 ||
        component.parts.some((part) =>
          !isRecord(part) || !isWithinWordLimit(part.questionText, MAX_ANSWERABLE_QUESTION_WORDS)
        )
      ) {
        throw new Error('MULTI_PART_QUESTION parts must include answerable question text.');
      }
      const questionWords = (component.parts as Array<Record<string, unknown>>)
        .reduce((total, part) => total + wordCount(part.questionText as string), 0);
      if (questionWords > MAX_ANSWERABLE_QUESTION_WORDS) {
        throw new Error('All answerable parts of one multipart question must total 25 words or fewer.');
      }
    }
    if (
      component.type === 'DIAGNOSTIC_QUESTION_LOOP' &&
      !isWithinWordLimit(component.probingPrompt, MAX_ANSWERABLE_QUESTION_WORDS)
    ) {
      throw new Error('Each answerable question prompt must be 25 words or fewer.');
    }
    if (
      component.type === 'COMPARATIVE_TABLE' &&
      !isQuizQuestionVisual(component)
    ) {
      throw new Error('Comparative table text must use concise captions, headers, and cells.');
    }
    if (component.type === 'DRAG_AND_DROP') {
      if (
        typeof component.instruction !== 'string' ||
        !Array.isArray(component.draggableItems) ||
        !component.draggableItems.every((item) => typeof item === 'string') ||
        !Array.isArray(component.dropZones) ||
        !component.dropZones.every((zone) =>
          !!zone &&
          typeof zone === 'object' &&
          typeof (zone as Record<string, unknown>).id === 'string' &&
          typeof (zone as Record<string, unknown>).targetDescription === 'string' &&
          typeof (zone as Record<string, unknown>).correctItemValue === 'string'
        )
      ) {
        throw new Error('DRAG_AND_DROP is missing required items or drop-zone fields.');
      }
      const items = component.draggableItems as string[];
      const zones = component.dropZones as Array<Record<string, unknown>>;
      if (
        new Set(zones.map((zone) => zone.id)).size !== zones.length ||
        zones.some((zone) => !items.includes(zone.correctItemValue as string))
      ) {
        throw new Error('DRAG_AND_DROP zones need unique ids and valid correct items.');
      }
    }
    if (component.type === 'MULTI_PART_QUESTION') {
      const parts = component.parts;
      const validParts = Array.isArray(parts) && parts.every((part, index) => {
        if (!part || typeof part !== 'object') return false;
        const item = part as Record<string, unknown>;
        return item.partNumber === index + 1 &&
          isWithinWordLimit(item.questionText, MAX_ANSWERABLE_QUESTION_WORDS) &&
          (item.questionType === 'MULTIPLE_CHOICE' || item.questionType === 'SHORT_TEXT') &&
          (item.questionType !== 'MULTIPLE_CHOICE' ||
            (Array.isArray(item.options) && item.options.every((option) => typeof option === 'string'))) &&
          typeof item.correctAnswer === 'string' &&
          typeof item.remediationIfWrong === 'string' &&
          (item.unlocksPartNumber === undefined ||
            (typeof item.unlocksPartNumber === 'number' && item.unlocksPartNumber > item.partNumber));
      });
      if (
        typeof component.sharedContextMarkdown !== 'string' ||
        (parts as Array<Record<string, unknown>>).length < 2 ||
        !validParts ||
        (parts as Array<Record<string, unknown>>).some((part) =>
          typeof part.unlocksPartNumber === 'number' &&
          !(parts as Array<Record<string, unknown>>).some((candidate) => candidate.partNumber === part.unlocksPartNumber)
        )
      ) {
        throw new Error('MULTI_PART_QUESTION parts must be complete and numbered sequentially.');
      }
    }
  }
  if (
    typeof payload.title !== 'string' ||
    (mode === 'quiz'
      ? !Array.isArray(payload.questions)
      : typeof payload.overview !== 'string' || !Array.isArray(payload.keyPoints) || !Array.isArray(payload.glossary))
  ) {
    throw new Error(`Kojlux ${mode} response is missing required content.`);
  }
}

export function getKojluxResponseSchema(mode: KojluxGenerationMode): Schema {
  return mode === 'quiz'
    ? object(quizProperties, ['title', 'questions', 'metadata', 'dynamicComponents'])
    : object(notesProperties, ['title', 'overview', 'keyPoints', 'glossary', 'metadata', 'dynamicComponents']);
}

export const KOJLUX_COMPONENT_INSTRUCTIONS = `For Notecraft, teach the material with a clear overview, key points, and glossary; keep them concise and add detail only for hard or thorough requests. Notecraft is a teaching experience, not a quiz: never include DIAGNOSTIC_QUESTION_LOOP or any standalone "Check your understanding" question. Include no more than three optional study aids total: count each non-empty optional schema field as one aid, each item in dynamicComponents as one aid, and passage plus passageType together as one aid. The overview, keyPoints, and glossary do not count. Select the most useful subject-specific aids first; omit every other optional field or component entirely once the three-aid limit is reached. Choose the most useful aids for the material, and do not default to DRAG_AND_DROP. Use DRAG_AND_DROP for vocabulary, classifications, or matching only when it is the best fit. Use MULTI_PART_QUESTION for math, science, or logic problems when a learner must solve a foundational step before the final answer; number parts sequentially and use unlocksPartNumber when an answer gates the next part. Every answerable question must be at most 25 words; for a multipart question, all part question texts combined must be at most 25 words. Shared context and instructions do not count. Keep chart/table captions to 10 words or fewer, headers to 5 words or fewer, and each text cell to 8 words or fewer. Complex concepts that genuinely benefit from changing variables may use an INTERACTIVE_SIMULATION. Do not invent unsafe real-world procedures, runnable executable sandboxes, or unnecessary components. Set metadata.orchestratorReasoning to a brief user-facing rationale for the component choices, not private step-by-step reasoning. Set metadata.generatedAt to this ISO timestamp:`;

export const KOJLUX_QUIZ_COMPONENT_INSTRUCTIONS = `Create exactly the requested number of questions, never more than 15. Every answerable question prompt must be at most 25 words; count only the answerable question text, not shared context, source content, visual content, instructions, answer options, answers, or explanations. When sequential reasoning benefits from it, occasionally use a multipart question with at least two parts; keep all part question texts combined to 25 words or fewer and do not make every question multipart. For an occasional multiple-choice part (not every question), include both hints (a clue that does not reveal the answer) and remediationIfWrong (a brief targeted explanation); the learner can check that part and request its hint. Do not add standalone dynamicComponents or bonus activities; dynamicComponents must be an empty array. For fewer than five questions, do not include visuals. For every complete group of five questions, include at least two relevant visuals attached directly to different questions; for example, 5 questions need 2 visuals, 10 need 4, and 15 need 6. Use supported visuals that genuinely help (such as a relevant formula, area model, graph, process, timeline, or comparison table); the question must clearly refer to it. Do not repeat the same visual, clutter it with unrelated explanation, or reveal the answer. Keep other questions straightforward. For charts or tables, keep captions to 10 words or fewer, headers to 5 words or fewer, and each text cell to 8 words or fewer.`;

export const KOJLUX_MATH_NOTATION_INSTRUCTIONS = `Across every subject, whenever you write a mathematical expression, equation, exponent, fraction, chemical formula, or variable inline in prose, wrap it in LaTeX delimiters like \\(x^{2} + 3x = 0\\) so the app renders real mathematical typography. Use valid LaTeX for powers (x^{2}), subscripts (CO_{2}), fractions (\\frac{a}{b}), roots (\\sqrt{x}), multiplication (\\times), division (\\div), minus (\\,-\\,), inequalities (\\leq, \\geq, \\neq), and arrows (\\rightarrow). Never write plain-text exponent notation such as x^2, ASCII multiplication such as 3*x, or typed substitutes such as ->, <=, or >= in generated study content. Keep ordinary prose outside math delimiters. For rawLatex fields, provide valid LaTeX without surrounding delimiters.`;
