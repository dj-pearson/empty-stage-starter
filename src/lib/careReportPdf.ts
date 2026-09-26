/**
 * Care report: PDF rendering.
 *
 * Layout only. Numbers come from buildCareReport and every string from the
 * caller, which owns the i18n context. Produced in the browser with the jsPDF
 * already bundled for the ladder report, and never uploaded: the file leaves
 * the device only when the parent sends it.
 */
import jsPDF from 'jspdf';
import type { Rung } from './exposureLadder';
import type { CareReport } from './careReport';

export interface CareReportPdfStrings {
  title: string;
  rangeLabel: string;
  summaryHeading: string;
  /** Already-formatted summary sentences, one per line. */
  summaryLines: string[];
  safeHeading: string;
  safeEmpty: string;
  newHeading: string;
  newEmpty: string;
  /** "Kiwi: first offered 9 Sep, 3 offers, 1 accepted". */
  newLine: (food: CareReport['newFoods'][number]) => string;
  ladderHeading: string;
  ladderEmpty: string;
  currentRungLabel: string;
  historyLabel: string;
  attemptsLabel: string;
  prepsLabel: string;
  outcomes: { success: string; partial: string; refused: string; tantrum: string };
  statusLabel: (status: string) => string;
  rungLabel: (rung: Rung) => string;
  formatDate: (iso: string) => string;
  formatPercent: (rate: number) => string;
  notesHeading: string;
  disclaimer: string;
  generatedNote: string;
}

const MARGIN = 18;
const PAGE_BOTTOM = 272;

export function renderCareReportPdf(report: CareReport, s: CareReportPdfStrings): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensure = (space: number) => {
    if (y > PAGE_BOTTOM - space) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const write = (
    text: string,
    size: number,
    opts: { bold?: boolean; color?: [number, number, number]; indent?: number } = {},
  ) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setTextColor(...(opts.color ?? [30, 30, 30]));
    const indent = opts.indent ?? 0;
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    for (const line of lines) {
      ensure(0);
      pdf.text(line, MARGIN + indent, y);
      y += size * 0.45 + 1.5;
    }
  };

  const rule = () => {
    ensure(0);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 4;
  };

  const heading = (text: string) => {
    ensure(20);
    y += 2;
    write(text, 13, { bold: true });
    y += 1;
  };

  const muted: [number, number, number] = [110, 110, 110];

  // The child appears once, by first name.
  write(`${s.title} - ${report.kidFirstName}`, 18, { bold: true });
  write(s.rangeLabel, 11, { color: muted });
  y += 2;
  rule();

  heading(s.summaryHeading);
  for (const line of s.summaryLines) write(line, 10, { indent: 3 });

  heading(s.safeHeading);
  write(report.safeFoods.length > 0 ? report.safeFoods.join(', ') : s.safeEmpty, 10, {
    indent: 3,
    color: report.safeFoods.length > 0 ? undefined : muted,
  });

  heading(s.newHeading);
  if (report.newFoods.length === 0) write(s.newEmpty, 10, { indent: 3, color: muted });
  for (const food of report.newFoods) write(s.newLine(food), 10, { indent: 3 });

  heading(s.ladderHeading);
  if (report.ladder.length === 0) write(s.ladderEmpty, 10, { indent: 3, color: muted });
  for (const row of report.ladder) {
    ensure(20);
    write(row.foodName, 11, { bold: true, indent: 3 });
    if (row.currentRung) {
      const status = row.status ? ` (${s.statusLabel(row.status)})` : '';
      write(`${s.currentRungLabel}: ${s.rungLabel(row.currentRung)}${status}`, 10, { indent: 6 });
    }
    if (row.rungHistory.length > 0) {
      const history = row.rungHistory.map((c) => `${s.rungLabel(c.rung)} (${s.formatDate(c.on)})`).join(' > ');
      write(`${s.historyLabel}: ${history}`, 10, { indent: 6 });
    }
    const c = row.outcomeCounts;
    if (c.total > 0) {
      // Refusals and distress are printed plainly; hiding them would waste the appointment.
      const breakdown = [
        `${s.outcomes.success} ${c.success}`,
        `${s.outcomes.partial} ${c.partial}`,
        `${s.outcomes.refused} ${c.refused}`,
        `${s.outcomes.tantrum} ${c.tantrum}`,
      ].join(' · ');
      write(`${s.attemptsLabel} (${c.total}): ${breakdown}`, 10, { indent: 6 });
    }
    if (row.bestPreps.length > 0) {
      const preps = row.bestPreps
        .map((p) => `${p.method} ${s.formatPercent(p.acceptanceRate)} (${p.attempts})`)
        .join(' · ');
      write(`${s.prepsLabel}: ${preps}`, 10, { indent: 6 });
    }
    y += 2;
  }

  if (report.includesNotes && report.notes.length > 0) {
    heading(s.notesHeading);
    for (const note of report.notes) {
      write(`${s.formatDate(note.on)} · ${note.food}: ${note.text}`, 10, { indent: 3 });
    }
  }

  y += 4;
  rule();
  write(s.disclaimer, 9, { color: muted });
  y += 1;
  write(s.generatedNote, 9, { color: [150, 150, 150] });

  return pdf.output('blob');
}
