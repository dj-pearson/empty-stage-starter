/**
 * Report Generator Utilities
 * Generates PDF reports and shareable links for progress reports
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';

export interface ReportData {
  kidName: string;
  weekStart: Date;
  weekEnd: Date;
  stats: {
    total: number;
    ate: number;
    tasted: number;
    refused: number;
    successRate: number;
    tryBites: number;
    tryBitesSuccessful: number;
    newFoodsAccepted: { name: string }[];
  };
  insights: {
    type: string;
    message: string;
  }[];
  mealsByDay: {
    date: Date;
    total: number;
    ate: number;
    successRate: number;
  }[];
}

/**
 * Generate a PDF from the weekly progress report
 */
export async function generateProgressReportPDF(
  reportData: ReportData,
  elementId?: string
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Helper function to add text with word wrap
  const addText = (text: string, fontSize: number, isBold = false, color: [number, number, number] = [0, 0, 0]) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    pdf.text(lines, margin, yPos);
    yPos += lines.length * (fontSize * 0.4) + 2;
  };

  // Header
  pdf.setFillColor(34, 197, 94); // Green header
  pdf.rect(0, 0, pageWidth, 40, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${reportData.kidName}'s Weekly Progress Report`, margin, 20);

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${format(reportData.weekStart, 'MMM d')} - ${format(reportData.weekEnd, 'MMM d, yyyy')}`,
    margin,
    32
  );

  yPos = 55;

  // Success Rate Summary
  pdf.setTextColor(0, 0, 0);
  addText('Weekly Summary', 18, true);
  yPos += 5;

  // Stats boxes
  const boxWidth = (pageWidth - 2 * margin - 15) / 4;
  const boxHeight = 25;
  const statsData = [
    { label: 'Ate', value: reportData.stats.ate, color: [34, 197, 94] as [number, number, number] },
    { label: 'Tasted', value: reportData.stats.tasted, color: [234, 179, 8] as [number, number, number] },
    { label: 'Refused', value: reportData.stats.refused, color: [249, 115, 22] as [number, number, number] },
    { label: 'Try Bites', value: reportData.stats.tryBites, color: [168, 85, 247] as [number, number, number] },
  ];

  statsData.forEach((stat, index) => {
    const x = margin + index * (boxWidth + 5);
    pdf.setFillColor(...stat.color);
    pdf.roundedRect(x, yPos, boxWidth, boxHeight, 3, 3, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(stat.value), x + boxWidth / 2, yPos + 12, { align: 'center' });

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(stat.label, x + boxWidth / 2, yPos + 20, { align: 'center' });
  });

  yPos += boxHeight + 15;

  // Overall success rate
  pdf.setFillColor(240, 240, 240);
  pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 20, 3, 3, 'F');
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Overall Success Rate: ${reportData.stats.successRate}%`, pageWidth / 2, yPos + 13, { align: 'center' });

  yPos += 30;

  // Insights
  if (reportData.insights.length > 0) {
    addText('Highlights & Insights', 16, true);
    yPos += 3;

    reportData.insights.forEach((insight) => {
      const insightColor: [number, number, number] =
        insight.type === 'celebration' ? [34, 197, 94] :
        insight.type === 'milestone' ? [168, 85, 247] :
        insight.type === 'positive' ? [59, 130, 246] :
        [234, 179, 8];

      pdf.setFillColor(...insightColor);
      pdf.circle(margin + 3, yPos - 2, 2, 'F');

      pdf.setTextColor(60, 60, 60);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      const lines = pdf.splitTextToSize(insight.message, pageWidth - 2 * margin - 15);
      pdf.text(lines, margin + 10, yPos);
      yPos += lines.length * 5 + 5;
    });

    yPos += 5;
  }

  // Daily breakdown
  if (yPos > 200) {
    pdf.addPage();
    yPos = margin;
  }

  addText('Daily Breakdown', 16, true);
  yPos += 5;

  // Day headers
  const dayWidth = (pageWidth - 2 * margin) / 7;
  reportData.mealsByDay.forEach((day, index) => {
    const x = margin + index * dayWidth;

    // Day box
    const hasData = day.total > 0;
    if (hasData) {
      pdf.setFillColor(240, 240, 240);
    } else {
      pdf.setFillColor(250, 250, 250);
    }
    pdf.roundedRect(x + 2, yPos, dayWidth - 4, 35, 2, 2, 'F');

    // Day name
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(format(day.date, 'EEE'), x + dayWidth / 2, yPos + 8, { align: 'center' });

    // Date
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(format(day.date, 'd'), x + dayWidth / 2, yPos + 15, { align: 'center' });

    // Success rate
    if (hasData) {
      const successColor: [number, number, number] = day.successRate >= 70 ? [34, 197, 94] : day.successRate >= 40 ? [234, 179, 8] : [249, 115, 22];
      pdf.setTextColor(...successColor);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${day.successRate}%`, x + dayWidth / 2, yPos + 28, { align: 'center' });
    } else {
      pdf.setTextColor(180, 180, 180);
      pdf.setFontSize(10);
      pdf.text('-', x + dayWidth / 2, yPos + 26, { align: 'center' });
    }
  });

  yPos += 45;

  // New foods accepted
  if (reportData.stats.newFoodsAccepted.length > 0) {
    addText('New Foods Accepted This Week', 14, true);
    yPos += 3;

    const foodNames = reportData.stats.newFoodsAccepted.map(f => f.name).join(', ');
    pdf.setTextColor(34, 197, 94);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(foodNames, pageWidth - 2 * margin);
    pdf.text(lines, margin, yPos);
    yPos += lines.length * 5 + 10;
  }

  // Footer
  pdf.setTextColor(150, 150, 150);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `Generated by EatPal on ${format(new Date(), 'MMM d, yyyy \'at\' h:mm a')}`,
    pageWidth / 2,
    pdf.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  );

  return pdf.output('blob');
}

/**
 * Generate a PDF from a DOM element using html2canvas
 */
export async function generatePDFFromElement(elementId: string, filename: string): Promise<Blob> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Handle multi-page if content is too tall
  if (imgHeight <= pageHeight - 20) {
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
  } else {
    let heightLeft = imgHeight;
    let position = 10;
    let page = 0;

    while (heightLeft > 0) {
      if (page > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      position = -pageHeight * page + 10;
      page++;
    }
  }

  return pdf.output('blob');
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Share content using Web Share API or fallback
 */
export async function shareReport(
  data: {
    title: string;
    text: string;
    url?: string;
    files?: File[];
  }
): Promise<boolean> {
  // Check if Web Share API is available
  if (navigator.share) {
    try {
      // Check if file sharing is supported
      if (data.files && navigator.canShare && navigator.canShare({ files: data.files })) {
        await navigator.share({
          title: data.title,
          text: data.text,
          files: data.files,
        });
      } else {
        await navigator.share({
          title: data.title,
          text: data.text,
          url: data.url,
        });
      }
      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled share
        return false;
      }
      console.error('Share failed:', err);
      return false;
    }
  }

  // Fallback: copy to clipboard
  try {
    const shareText = data.url
      ? `${data.title}\n\n${data.text}\n\n${data.url}`
      : `${data.title}\n\n${data.text}`;
    await navigator.clipboard.writeText(shareText);
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

/**
 * Convert blob to File for sharing
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Generate shareable text summary
 */
export function generateShareText(reportData: ReportData): string {
  const lines = [
    `📊 ${reportData.kidName}'s Weekly Meal Report`,
    `Week of ${format(reportData.weekStart, 'MMM d')} - ${format(reportData.weekEnd, 'MMM d, yyyy')}`,
    '',
    `✅ Success Rate: ${reportData.stats.successRate}%`,
    `🍽️ Meals Eaten: ${reportData.stats.ate}`,
    `👅 Foods Tasted: ${reportData.stats.tasted}`,
    `🌟 Try Bites: ${reportData.stats.tryBites}`,
  ];

  if (reportData.stats.newFoodsAccepted.length > 0) {
    lines.push('');
    lines.push(`🎉 New Foods Accepted: ${reportData.stats.newFoodsAccepted.map(f => f.name).join(', ')}`);
  }

  lines.push('');
  lines.push('Generated with EatPal - Meal Planning for Families');

  return lines.join('\n');
}
