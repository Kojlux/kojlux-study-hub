import type { jsPDF } from 'jspdf';
import { StructuredContent } from '../types';
import { sanitizeDeep, anchorImageQuery } from './pdfTextSanitizer';

// Shared by QuizBuilder's and NoteCraft's PDF exports so a new Dynamic Forms
// block only ever needs to be taught to print itself once. Draws whichever
// fields are present on `data`, starting at `startY`, and returns the new Y
// cursor position so the caller can keep drawing below it.
//
// Formulas/solution-step LaTeX is printed as its raw source string rather
// than rendered math — rasterizing true KaTeX output into the PDF would
// need an extra dependency (html2canvas) to snapshot the on-screen render;
// this keeps the export dependency-free while keeping the LaTeX readable
// and copyable. Say the word if you'd rather have it rendered as an image.
//
// image_queries can't be embedded as actual images without re-fetching and
// converting each one to a data URL at export time, so each one instead
// becomes a clickable link to an image search for that term.
const LEFT = 15;
const WIDTH = 180;
const PAGE_BOTTOM = 280;

export function renderStructuredContentToPdf(
  pdf: jsPDF,
  rawData: StructuredContent,
  startY: number,
  topicName?: string,
): number {
  // Every string in the payload goes through the sanitizer exactly once,
  // here, before any of it reaches pdf.text()/textWithLink(). See
  // pdfTextSanitizer.ts for why this can't reintroduce the "&W&h&a&t&"
  // style corruption the way a regex-based cleanup could.
  const data = sanitizeDeep(rawData);
  let y = startY;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_BOTTOM) {
      pdf.addPage();
      y = 20;
    }
  };
  const writeWrapped = (text: string, indent: number, maxWidth: number, lineHeight = 6) => {
    const lines = pdf.splitTextToSize(text, maxWidth);
    ensureSpace(lines.length * lineHeight);
    pdf.text(lines, indent, y);
    y += lines.length * lineHeight;
  };
  const heading = (text: string) => {
    y += 3;
    ensureSpace(10);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(text, LEFT, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
  };
  const drawTable = (headers: string[], rows: (string | number)[][]) => {
    const colWidth = WIDTH / headers.length;
    ensureSpace(8);
    pdf.setFont('helvetica', 'bold');
    headers.forEach((h, i) => pdf.text(String(h), LEFT + i * colWidth, y, { maxWidth: colWidth - 2 }));
    pdf.setFont('helvetica', 'normal');
    y += 6;
    rows.forEach((row) => {
      const cellLineCounts = row.map((cell) => pdf.splitTextToSize(String(cell), colWidth - 2).length);
      const rowHeight = Math.max(...cellLineCounts, 1) * 5;
      ensureSpace(rowHeight);
      row.forEach((cell, i) => {
        const lines = pdf.splitTextToSize(String(cell), colWidth - 2);
        pdf.text(lines, LEFT + i * colWidth, y, { maxWidth: colWidth - 2 });
      });
      y += rowHeight;
    });
    y += 2;
  };
  const writeLink = (label: string, url: string) => {
    ensureSpace(6.5);
    pdf.setTextColor(37, 99, 235); // link blue
    pdf.textWithLink(label, LEFT, y, { url });
    const textWidth = pdf.getTextWidth(label);
    pdf.setDrawColor(37, 99, 235);
    pdf.line(LEFT, y + 0.8, LEFT + textWidth, y + 0.8); // underline, signals it's clickable
    pdf.setDrawColor(0, 0, 0);
    pdf.setTextColor(0, 0, 0);
    y += 6.5;
  };

  // Math & Physics
  if ((data.formulas && data.formulas.length > 0) || (data.solutionSteps && data.solutionSteps.length > 0)) {
    heading('Formulas & Working');
    data.formulas?.forEach((f) => writeWrapped(f, LEFT, WIDTH));
    data.solutionSteps?.forEach((s, i) => {
      writeWrapped(`${i + 1}. ${s.step}`, LEFT, WIDTH);
      if (s.latex) writeWrapped(s.latex, LEFT + 4, WIDTH - 4);
    });
  }

  // Science & Biology
  if (data.processFlow && data.processFlow.length > 0) {
    heading('Process');
    data.processFlow.forEach((s, i) => writeWrapped(`${i + 1}. ${s.step} — ${s.description}`, LEFT, WIDTH));
  }
  if (data.variables) {
    heading('Variables');
    writeWrapped(`Independent: ${data.variables.independent}`, LEFT, WIDTH);
    writeWrapped(`Dependent: ${data.variables.dependent}`, LEFT, WIDTH);
    if (data.variables.controlled && data.variables.controlled.length > 0) {
      writeWrapped(`Controlled: ${data.variables.controlled.join(', ')}`, LEFT, WIDTH);
    }
  }
  if (data.chemicalEquations && data.chemicalEquations.length > 0) {
    heading('Equations');
    data.chemicalEquations.forEach((eq) => writeWrapped(eq, LEFT, WIDTH));
  }

  // Geography & History
  if (data.timeline && data.timeline.length > 0) {
    heading('Timeline');
    data.timeline.forEach((t) => writeWrapped(`${t.date} — ${t.event}: ${t.significance}`, LEFT, WIDTH));
  }
  if (data.factSheetTable && data.factSheetTable.headers.length > 0) {
    heading('Fact Sheet');
    drawTable(data.factSheetTable.headers, data.factSheetTable.rows);
  }

  // Any subject, data-heavy content
  if (data.table && data.table.headers.length > 0) {
    heading('Data');
    drawTable(data.table.headers, data.table.rows);
  }

  // Visual asset keywords: rather than embedding images (which would mean
  // re-fetching and converting each one to a data URL at export time), each
  // query becomes a clickable link straight to an image search for it.
  if (data.imageQueries && data.imageQueries.length > 0) {
    heading('Images');
    writeWrapped('Tap a link to search for a relevant image online:', LEFT, WIDTH, 5);
    y += 1.5;
    data.imageQueries.forEach((q) => {
      const anchored = anchorImageQuery(q, topicName);
      const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(anchored)}`;
      writeLink(`\u2022 ${anchored}`, url);
    });
  }

  return y;
}