/**
 * Clinician ladder report — PDF rendering (US-605).
 *
 * Rendering only. Every number on the page comes from
 * `buildClinicianLadderReport`, and every string comes from the caller, which
 * owns the i18n context — so this file has no opinion about wording and no
 * opinion about counting.
 *
 * The document is produced entirely in the browser with the jsPDF already
 * bundled for the recipe and quiz exports, and handed back as a Blob. It is
 * never uploaded: a summary of a child's feeding therapy should leave the
 * device only when a parent decides to send it, to whom they choose.
 */

import jsPDF from 'jspdf';
import type { ClinicianLadderReport, ClinicianReportRow } from './clinicianLadderReport';
import type { Rung } from './exposureLadder';

export interface ClinicianPdfStrings {
  /** Document heading, e.g. "Exposure ladder summary". */
  title: string;
  /** Already-formatted date range, e.g. "1 Mar – 31 Mar 2026". */
  rangeLabel: string;
  /** Summary line under the heading. */
  totalsLine: string;
  currentRungLabel: string;
  startedAtLabel: string;
  historyLabel: string;
  attemptsLabel: string;
  prepsLabel: string;
  noPrepsLabel: string;
  noAttemptsLabel: string;
  outcomes: { success: string; partial: string; refused: string; tantrum: string };
  statuses: Record<string, string>;
  /** The not-medical-advice line. Always printed. */
  disclaimer: string;
  /** Footer note about where the file was produced. */
  generatedNote: string;
  rungLabel: (rung: Rung) => string;
  /** Percentage formatter, so the caller's locale decides. */
  formatPercent: (rate: number) => string;
}

const MARGIN = 18;
const PAGE_BOTTOM = 272;

export function renderClinicianLadderPdf(
  report: ClinicianLadderReport,
  strings: ClinicianPdfStrings
): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const write = (
    text: string,
    size: number,
    opts: { bold?: boolean; color?: [number, number, number]; indent?: number } = {}
  ) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setTextColor(...(opts.color ?? [30, 30, 30]));
    const indent = opts.indent ?? 0;
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    for (const line of lines) {
      if (y > PAGE_BOTTOM) {
        pdf.addPage();
        y = MARGIN;
      }
      pdf.text(line, MARGIN + indent, y);
      y += size * 0.45 + 1.5;
    }
  };

  const rule = () => {
    if (y > PAGE_BOTTOM) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.setDrawColor(220, 220, 220);
    pdf.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 4;
  };

  // The child appears once, by first name. There is nothing else to print.
  write(`${strings.title} — ${report.kidFirstName}`, 18, { bold: true });
  write(strings.rangeLabel, 11, { color: [110, 110, 110] });
  y += 2;
  write(strings.totalsLine, 11);
  y += 3;
  rule();

  for (const row of report.rows) {
    writeFoodBlock(row);
  }

  y += 4;
  rule();
  write(strings.disclaimer, 9, { color: [110, 110, 110] });
  y += 1;
  write(strings.generatedNote, 9, { color: [150, 150, 150] });

  return pdf.output('blob');

  function writeFoodBlock(row: ClinicianReportRow) {
    // Keep a food's heading with at least the first line of its detail.
    if (y > PAGE_BOTTOM - 24) {
      pdf.addPage();
      y = MARGIN;
    }

    write(row.foodName, 13, { bold: true });

    const statusLabel = row.status ? (strings.statuses[row.status] ?? row.status) : null;
    if (row.currentRung) {
      const current = `${strings.currentRungLabel}: ${strings.rungLabel(row.currentRung)}${
        statusLabel ? ` (${statusLabel})` : ''
      }`;
      write(current, 10, { indent: 3 });
    }

    if (row.startRung) {
      write(`${strings.startedAtLabel}: ${strings.rungLabel(row.startRung)}`, 10, { indent: 3 });
    }

    if (row.rungHistory.length > 0) {
      const history = row.rungHistory
        .map((change) => `${strings.rungLabel(change.rung)} (${change.on})`)
        .join('  →  ');
      write(`${strings.historyLabel}: ${history}`, 10, { indent: 3 });
    }

    const counts = row.outcomeCounts;
    if (counts.total === 0) {
      write(strings.noAttemptsLabel, 10, { indent: 3, color: [110, 110, 110] });
    } else {
      // Refusals and distress are reported plainly. A summary that hid them
      // would waste the appointment it is meant to serve.
      const breakdown = [
        `${strings.outcomes.success} ${counts.success}`,
        `${strings.outcomes.partial} ${counts.partial}`,
        `${strings.outcomes.refused} ${counts.refused}`,
        `${strings.outcomes.tantrum} ${counts.tantrum}`,
      ].join(' · ');
      write(`${strings.attemptsLabel} (${counts.total}): ${breakdown}`, 10, { indent: 3 });
    }

    if (row.bestPreps.length > 0) {
      const preps = row.bestPreps
        .map(
          (prep) =>
            `${prep.method} ${strings.formatPercent(prep.acceptanceRate)} (${prep.attempts})`
        )
        .join(' · ');
      write(`${strings.prepsLabel}: ${preps}`, 10, { indent: 3 });
    } else if (counts.total > 0) {
      write(strings.noPrepsLabel, 10, { indent: 3, color: [110, 110, 110] });
    }

    y += 3;
  }
}
