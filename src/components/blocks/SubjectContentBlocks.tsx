import React from 'react';
import { StructuredContent } from '../../types';
import PassageCard from './PassageCard';
import MathBlock from './MathBlock';
import ProcessFlowBlock from './ProcessFlowBlock';
import TimelineBlock from './TimelineBlock';
import DataTableBlock from './DataTableBlock';
import ImageQueryGallery from './ImageQueryGallery';

// Renders whichever Dynamic Forms blocks are actually present on `data`.
// This is the ONE place that maps a payload key to a UI component — shared
// verbatim between Quiz Builder's results/taking-quiz views and NoteCraft's
// results view, so a new block type only ever gets wired up once. See
// lib/subjects.ts buildStructuredFieldsClause for where these fields
// originate on the AI side.
export default function SubjectContentBlocks({ data }: { data: StructuredContent }) {
  return (
    <>
      <PassageCard passage={data.passage} passageType={data.passageType} />
      <MathBlock formulas={data.formulas} solutionSteps={data.solutionSteps} />
      <ProcessFlowBlock
        processFlow={data.processFlow}
        variables={data.variables}
        chemicalEquations={data.chemicalEquations}
      />
      <TimelineBlock timeline={data.timeline} />
      <DataTableBlock table={data.factSheetTable} title="Fact Sheet" />
      <DataTableBlock table={data.table} title="Data" />
      <ImageQueryGallery queries={data.imageQueries} />
    </>
  );
}
