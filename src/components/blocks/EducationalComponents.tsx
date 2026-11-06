import React, { useState } from 'react';
import {
  AreaModelBlock,
  ChronologicalTimelineBlock,
  CodingSandboxBlock,
  ComparativeTableBlock,
  ConceptHierarchyBlock,
  CoordinateGeometryBlock,
  DiagnosticQuestionLoopBlock,
  DragAndDropBlock,
  EducationalComponent,
  FlashcardDeckBlock,
  FormulaBlock,
  InteractiveSimulationBlock,
  LabExperimentBlock,
  MultiPartQuestionBlock,
  ProcessFlowBlock,
  ReadingPassageBlock,
} from '../../types';
import { BlockMath, MathText } from './Latex';

const cardClass = 'rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const eyebrowClass = 'mb-2 text-[10px] font-bold uppercase tracking-widest text-focus-primary';

export default function EducationalComponents({ components }: { components: EducationalComponent[] }) {
  if (!components.length) return null;
  return (
    <div className="space-y-3">
      {components.map((component, index) => (
        <ComponentCard key={`${component.type}-${index}`} component={component} />
      ))}
    </div>
  );
}

function ComponentCard({ component }: { component: EducationalComponent }) {
  switch (component.type) {
    case 'INTERACTIVE_SIMULATION': return <SimulationCard block={component} />;
    case 'DIAGNOSTIC_QUESTION_LOOP': return <DiagnosticCard block={component} />;
    case 'DRAG_AND_DROP': return <DragAndDropCard block={component} />;
    case 'MULTI_PART_QUESTION': return <MultiPartQuestionCard block={component} />;
    case 'AREA_MODEL': return <AreaModelCard block={component} />;
    case 'COORDINATE_GEOMETRY': return <GeometryCard block={component} />;
    case 'FORMULA_DISPLAY': return <FormulaCard block={component} />;
    case 'PROCESS_FLOW': return <ProcessCard block={component} />;
    case 'HISTORICAL_TIMELINE': return <TimelineCard block={component} />;
    case 'READING_PASSAGE': return <ReadingCard block={component} />;
    case 'COMPARATIVE_TABLE': return <TableCard block={component} />;
    case 'CONCEPT_HIERARCHY': return <HierarchyCard block={component} />;
    case 'CODING_SANDBOX': return <CodeCard block={component} />;
    case 'LAB_EXPERIMENT': return <LabCard block={component} />;
    case 'FLASHCARD_DECK': return <FlashcardsCard block={component} />;
  }
}

function DragAndDropCard({ block }: { block: DragAndDropBlock }) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const assignedItems = new Set(Object.values(assignments));

  const assign = (zoneId: string, value: string) => {
    setAssignments((current) => ({ ...current, [zoneId]: value }));
    setChecked(false);
  };

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Match and classify</p>
      <MathText text={block.instruction} className="block font-semibold" />
      <div className="my-3 flex flex-wrap gap-2" aria-label="Items to place">
        {block.draggableItems.map((item) => (
          <button
            key={item}
            type="button"
            draggable
            disabled={assignedItems.has(item)}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', item)}
            className="rounded-xl border border-focus-primary/30 bg-focus-primary/5 px-3 py-2 text-sm disabled:opacity-40"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {block.dropZones.map((zone) => (
          <div
            key={zone.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const value = event.dataTransfer.getData('text/plain');
              const assignedElsewhere = Object.entries(assignments).some(
                ([assignedZone, item]) => assignedZone !== zone.id && item === value
              );
              if (block.draggableItems.includes(value) && !assignedElsewhere) assign(zone.id, value);
            }}
            className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700"
          >
            <MathText text={zone.targetDescription} className="block text-xs text-slate-500" />
            <div className="mt-2 flex items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded-lg border p-2 text-sm dark:bg-slate-800"
                value={assignments[zone.id] ?? ''}
                onChange={(event) => assign(zone.id, event.target.value)}
                aria-label={`Answer for ${zone.targetDescription}`}
              >
                <option value="">Choose an item</option>
                {block.draggableItems.map((item) => (
                  <option key={item} value={item} disabled={assignedItems.has(item) && assignments[zone.id] !== item}>
                    {item}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-700 dark:text-slate-200">{assignments[zone.id] ?? 'Drop here'}</span>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 rounded-lg bg-focus-primary px-3 py-2 text-xs font-bold text-white"
        onClick={() => setChecked(true)}
      >
        Check matches
      </button>
      {checked && (
        <p className="mt-2 text-sm" aria-live="polite">
          {block.dropZones.filter((zone) => assignments[zone.id] === zone.correctItemValue).length} of {block.dropZones.length} matches correct.
        </p>
      )}
    </section>
  );
}

function MultiPartQuestionCard({ block }: { block: MultiPartQuestionBlock }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Multi-part problem</p>
      <MathText text={block.sharedContextMarkdown} className="block whitespace-pre-wrap text-sm" />
      <div className="mt-3 space-y-3">
        {block.parts.map((part) => {
          const gatekeepers = block.parts.filter((candidate) => candidate.unlocksPartNumber === part.partNumber);
          const isUnlocked = part.partNumber === 1 || gatekeepers.length === 0 ||
            gatekeepers.every((gatekeeper) => checked[gatekeeper.partNumber] === true);
          const isCorrect = answers[part.partNumber]?.trim().toLowerCase() === part.correctAnswer.trim().toLowerCase();
          return (
            <fieldset key={part.partNumber} disabled={!isUnlocked} className="rounded-xl border p-3 disabled:opacity-50">
              <legend className="px-1 text-xs font-bold">Part {part.partNumber}</legend>
              <MathText text={part.questionText} className="block text-sm" />
              {part.questionType === 'MULTIPLE_CHOICE' ? (
                <div className="mt-2 space-y-2">
                  {(part.options ?? []).map((option) => (
                    <label className="flex items-center gap-2 text-sm" key={option}>
                      <input
                        type="radio"
                        name={`multipart-${part.partNumber}`}
                        value={option}
                        checked={answers[part.partNumber] === option}
                        onChange={() => setAnswers((current) => ({ ...current, [part.partNumber]: option }))}
                      />
                      <MathText text={option} />
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="mt-2 w-full rounded-lg border p-2 text-sm dark:bg-slate-800"
                  value={answers[part.partNumber] ?? ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [part.partNumber]: event.target.value }))}
                  aria-label={`Answer for part ${part.partNumber}`}
                />
              )}
              <button
                type="button"
                className="mt-3 rounded-lg bg-focus-primary px-3 py-2 text-xs font-bold text-white"
                onClick={() => {
                  if (isCorrect) {
                    setChecked((current) => ({ ...current, [part.partNumber]: true }));
                  } else {
                    setChecked((current) => ({ ...current, [part.partNumber]: false }));
                  }
                }}
              >
                Check part
              </button>
              {checked[part.partNumber] === true && <p className="mt-2 text-sm text-emerald-700">Correct.</p>}
              {answers[part.partNumber]?.trim() && checked[part.partNumber] === false && (
                <p className="mt-2 text-sm text-amber-700">{part.remediationIfWrong}</p>
              )}
              {!isUnlocked && <p className="mt-2 text-xs text-slate-500">Complete the previous part to unlock this one.</p>}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

function SimulationCard({ block }: { block: InteractiveSimulationBlock }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() =>
    Object.fromEntries(block.sandboxVariables.map((variable) => [
      variable.name,
      variable.valueType === 'boolean'
        ? String(variable.defaultValue).toLowerCase() === 'true'
        : variable.defaultValue,
    ]))
  );
  const states = block.stateTransitions.filter((transition) => {
    const actual = values[transition.ifVariable];
    if (transition.condition === 'equals') return String(actual) === String(transition.targetValue);
    const actualNumber = Number(actual);
    const targetNumber = Number(transition.targetValue);
    return transition.condition === 'greater_than'
      ? actualNumber > targetNumber
      : actualNumber < targetNumber;
  });

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Interactive simulation</p>
      <MathText text={block.title} className="block font-bold text-slate-800 dark:text-slate-100" />
      <MathText text={block.conceptObjective} className="mt-1 block text-sm text-slate-600 dark:text-slate-300" />
      <MathText text={block.initialRenderMarkdown} className="my-3 block whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/70" />
      <div className="space-y-3">
        {block.sandboxVariables.map((variable) => (
          <label key={variable.name} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs">
            <MathText text={`${variable.name}: ${String(values[variable.name])}`} className="font-semibold" />
            {variable.valueType === 'number' ? (
              <input
                type="range"
                min={variable.minRange ?? 0}
                max={variable.maxRange ?? 100}
                step={variable.step ?? 1}
                value={Number(values[variable.name])}
                onChange={(event) => setValues((current) => ({ ...current, [variable.name]: Number(event.target.value) }))}
                aria-label={variable.name}
              />
            ) : variable.valueType === 'boolean' ? (
              <input
                type="checkbox"
                checked={Boolean(values[variable.name])}
                onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.checked }))}
                aria-label={variable.name}
              />
            ) : (
              <input
                className="w-36 rounded-lg border px-2 py-1 dark:bg-slate-800"
                value={String(values[variable.name])}
                onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                aria-label={variable.name}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-focus-primary/5 p-3 text-sm" aria-live="polite">
        {states.length
          ? states.map((state, index) => <MathText key={index} text={state.resultingVisualStateDescription} className="block" />)
          : <p className="text-slate-500">Adjust a value to explore how the model changes.</p>}
      </div>
    </section>
  );
}

function DiagnosticCard({ block }: { block: DiagnosticQuestionLoopBlock }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  let isCorrect = false;
  try {
    isCorrect = block.questionType === 'BOOLEAN_TOGGLE'
      ? answer.toLowerCase() === block.expectedAnswerPattern.toLowerCase()
      : new RegExp(block.expectedAnswerPattern, 'i').test(answer);
  } catch {
    isCorrect = answer.trim().toLowerCase() === block.expectedAnswerPattern.trim().toLowerCase();
  }

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Check your understanding</p>
      <p className="mb-1 text-[10px] text-slate-500">Connected to: {block.contextAnchorId}</p>
      <MathText text={block.probingPrompt} className="block font-semibold" />
      {block.questionType === 'MULTIPLE_CHOICE' ? (
        <div className="mt-3 space-y-2">
          {(block.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`diagnostic-${block.contextAnchorId}`} value={option} checked={answer === option}
                onChange={() => { setAnswer(option); setSubmitted(false); }} />
              <MathText text={option} />
            </label>
          ))}
        </div>
      ) : block.questionType === 'BOOLEAN_TOGGLE' ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={answer === 'true'} onChange={(event) => {
            setAnswer(String(event.target.checked)); setSubmitted(false);
          }} />
          Yes
        </label>
      ) : (
        <textarea className="mt-3 w-full rounded-xl border p-3 text-sm dark:bg-slate-800" rows={3}
          value={answer} onChange={(event) => { setAnswer(event.target.value); setSubmitted(false); }} />
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button className="rounded-lg bg-focus-primary px-3 py-2 text-xs font-bold text-white"
          onClick={() => setSubmitted(true)}>Check answer</button>
        <button className="text-xs font-semibold text-focus-primary" onClick={() => setShowHint((visible) => !visible)}>
          {showHint ? 'Hide hint' : 'Show hint'}
        </button>
      </div>
      {showHint && <MathText text={block.hints.join(' ')} className="mt-2 block text-sm text-slate-600 dark:text-slate-300" />}
      {submitted && (
        <p className={`mt-3 text-sm ${isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
          {isCorrect ? 'That’s right.' : <MathText text={block.targetedRemediationExplanation} />}
        </p>
      )}
    </section>
  );
}

function AreaModelCard({ block }: { block: AreaModelBlock }) {
  const cells = new Map(block.gridCells.map((cell) => [`${cell.row}:${cell.col}`, cell]));
  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Area model</p>
      <MathText text={block.explanation} className="mb-3 block text-sm" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs">
          <thead><tr><th />{block.topLabels.map((label, index) => <th className="border p-2" key={index}><MathText text={label} /></th>)}</tr></thead>
          <tbody>{block.leftLabels.map((label, rowIndex) => (
            <tr key={rowIndex}><th className="border p-2"><MathText text={label} /></th>{block.topLabels.map((_, colIndex) => {
              const cell = cells.get(`${rowIndex}:${colIndex}`);
              return <td className="border p-2" key={colIndex} title={cell?.derivation}><MathText text={cell?.value ?? ''} /></td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function GeometryCard({ block }: { block: CoordinateGeometryBlock }) {
  const { xMin, xMax, yMin, yMax } = block.bounds;
  const x = (value: number) => ((value - xMin) / (xMax - xMin)) * 100;
  const y = (value: number) => 100 - ((value - yMin) / (yMax - yMin)) * 100;
  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Coordinate geometry · {block.graphType.toLowerCase()}</p>
      <MathText text={block.equation} className="block font-semibold" />
      <div className="relative mt-3 h-48 rounded-xl border bg-slate-50 dark:bg-slate-800">
        <span className="absolute left-1/2 top-0 h-full border-l border-slate-300" />
        <span className="absolute left-0 top-1/2 w-full border-t border-slate-300" />
        {block.keyPoints.map((point, index) => (
          <span key={index} className="absolute h-2.5 w-2.5 rounded-full bg-focus-primary"
            style={{ left: `${x(point.x)}%`, top: `${y(point.y)}%`, transform: 'translate(-50%, -50%)' }}
            title={`${point.label}: ${point.mathematicalSignificance}`} />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-xs">{block.keyPoints.map((point, index) =>
        <li key={index}><strong>{point.label}</strong> ({point.x}, {point.y}) — <MathText text={point.mathematicalSignificance} /></li>
      )}</ul>
    </section>
  );
}

function FormulaCard({ block }: { block: FormulaBlock }) {
  return <section className={cardClass}><MathText text={block.title} className={eyebrowClass} /><BlockMath latex={block.rawLatex} />
    <ul className="mt-2 space-y-1 text-xs">{block.variables.map((variable) =>
      <li key={variable.symbol}><strong><MathText text={variable.symbol} /></strong>: <MathText text={`${variable.meaning}${variable.unit ? ` (${variable.unit})` : ''}`} /></li>)}</ul>
  </section>;
}

function ProcessCard({ block }: { block: ProcessFlowBlock }) {
  return <section className={cardClass}><MathText text={block.processName} className={eyebrowClass} />
    <ol className="space-y-2">{block.steps.map((step) => <li key={step.stepNumber} className="border-l-2 border-focus-primary/40 pl-3">
      <strong>{step.stepNumber}. <MathText text={step.title} /></strong><MathText text={step.mechanism} className="block text-sm text-slate-600 dark:text-slate-300" />
      {step.trigger && <MathText text={`Trigger: ${step.trigger}`} className="block text-xs text-slate-500" />}</li>)}</ol>
  </section>;
}

function TimelineCard({ block }: { block: ChronologicalTimelineBlock }) {
  return <section className={cardClass}><MathText text={block.eraOrPeriod} className={eyebrowClass} />
    <ol className="space-y-3">{block.events.map((event, index) => <li key={index} className="grid grid-cols-[auto_1fr] gap-3">
      <time className="font-bold text-focus-primary"><MathText text={event.dateOrEra} /></time>
      <div><strong><MathText text={event.title} /></strong><MathText text={event.significance} className="block text-sm text-slate-600 dark:text-slate-300" /></div>
    </li>)}</ol>
  </section>;
}

function ReadingCard({ block }: { block: ReadingPassageBlock }) {
  return <section className={cardClass}><p className={eyebrowClass}>Reading passage{block.contextOrAuthor ? ` · ${block.contextOrAuthor}` : ''}</p>
    <MathText text={block.passageText} className="block whitespace-pre-wrap text-sm leading-relaxed" />
    {block.literaryDevices.length > 0 && <ul className="mt-3 space-y-1 text-xs">{block.literaryDevices.map((device, index) =>
      <li key={index}><strong><MathText text={device.device} /></strong> “<MathText text={device.exampleText} />” — <MathText text={device.effect} /></li>)}</ul>}
  </section>;
}

function TableCard({ block }: { block: ComparativeTableBlock }) {
  return <section className={cardClass}><MathText text={block.caption} className={eyebrowClass} />
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{block.headers.map((header, index) =>
      <th key={index} className="border-b p-2"><MathText text={header} /></th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) =>
      <tr key={rowIndex}>{block.headers.map((_, colIndex) => <td key={colIndex} className="border-b p-2"><MathText text={row[colIndex] ?? ''} /></td>)}</tr>)}
    </tbody></table></div>
  </section>;
}

function HierarchyCard({ block }: { block: ConceptHierarchyBlock }) {
  return <section className={cardClass}><p className={eyebrowClass}>Concept hierarchy</p>
    <MathText text={block.rootConcept} className="block font-bold" /><ul className="mt-2 space-y-2">{block.subConcepts.map((concept, index) =>
      <li key={index} className="ml-3 border-l-2 border-focus-primary/30 pl-3"><strong><MathText text={concept.name} /></strong>
        <span className="text-xs text-slate-500"> · <MathText text={concept.parentName} /></span>
        <MathText text={concept.definition} className="block text-sm text-slate-600 dark:text-slate-300" /></li>)}</ul>
  </section>;
}

function CodeCard({ block }: { block: CodingSandboxBlock }) {
  return <section className={cardClass}><p className={eyebrowClass}>Code study · {block.language}</p>
    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100"><code>{block.initialCode}</code></pre>
    <p className="mt-2 text-xs"><strong>Expected output:</strong> <MathText text={block.expectedOutput} /></p>
    {block.testCases.map((test, index) => <p className="mt-1 text-xs" key={index}>Test: <MathText text={test.input} /> → <MathText text={test.output} /></p>)}
    <p className="mt-2 text-[10px] text-slate-500">Code is shown for study; it is not executed.</p>
  </section>;
}

function LabCard({ block }: { block: LabExperimentBlock }) {
  return <section className={cardClass}><p className={eyebrowClass}>Lab experiment</p><MathText text={block.title} className="block font-bold" />
    <p className="mt-2 text-xs"><strong>Materials:</strong> <MathText text={block.materialsNeeded.join(', ')} /></p>
    <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{block.safetyPrecautions.map((item, index) => <li key={index}><MathText text={item} /></li>)}</ul>
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{block.procedureSteps.map((step, index) => <li key={index}><MathText text={step} /></li>)}</ol>
    <p className="mt-2 text-sm"><strong>Expected observation:</strong> <MathText text={block.expectedObservation} /></p>
  </section>;
}

function FlashcardsCard({ block }: { block: FlashcardDeckBlock }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return <section className={cardClass}><p className={eyebrowClass}>Flashcards</p>
    <div className="grid gap-2 sm:grid-cols-2">{block.cards.map((card, index) => (
      <button key={index} className="min-h-24 rounded-xl bg-focus-primary/5 p-3 text-left text-sm"
        onClick={() => setFlipped((current) => ({ ...current, [index]: !current[index] }))}>
        <span className="block text-[10px] font-bold uppercase text-focus-primary">{flipped[index] ? 'Answer' : 'Question'}</span>
        <MathText text={flipped[index] ? card.back : card.front} className="block" />
        {!flipped[index] && card.hint && <MathText text={`Hint: ${card.hint}`} className="mt-1 block text-xs text-slate-500" />}
      </button>
    ))}</div>
  </section>;
}
