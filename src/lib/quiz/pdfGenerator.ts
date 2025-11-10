/**
 * PDF Report Generator for Picky Eater Quiz
 * Generates a comprehensive, beautifully designed PDF report
 */

import jsPDF from 'jspdf';
import { QuizResult, PersonalityProfile } from '@/types/quiz';
import { getPersonalityType } from './personalityTypes';

interface PDFGenerationOptions {
  childName?: string;
  parentName?: string;
  includeProgressPath?: boolean;
  includeMealIdeas?: boolean;
}

export async function generatePDFReport(
  result: QuizResult,
  options: PDFGenerationOptions = {}
): Promise<Blob> {
  const { childName = 'Your child', parentName = 'Parent', includeProgressPath = true, includeMealIdeas = true } = options;

  const doc = new jsPDF();
  const personalityDef = getPersonalityType(result.profile.primaryType);

  let yPosition = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  // Helper function to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 20) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Helper function to add text with word wrap
  const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 11) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * (fontSize * 0.5); // Approximate height
  };

  // ===== PAGE 1: COVER PAGE =====

  // Header background (colored rectangle)
  doc.setFillColor(99, 102, 241); // Primary blue
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text('Picky Eater', pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(24);
  doc.text('Feeding Strategy Guide', pageWidth / 2, 40, { align: 'center' });

  // Subtitle
  doc.setFontSize(12);
  doc.text(`Personalized for ${childName}`, pageWidth / 2, 52, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);
  yPosition = 80;

  // Personality Type Badge
  doc.setFillColor(243, 244, 246); // Light gray
  doc.roundedRect(margin, yPosition, contentWidth, 40, 3, 3, 'F');

  doc.setFontSize(20);
  doc.text(`${personalityDef.icon} ${personalityDef.name}`, pageWidth / 2, yPosition + 15, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(75, 85, 99);
  doc.text(personalityDef.shortDescription, pageWidth / 2, yPosition + 30, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPosition += 55;

  // Introduction
  doc.setFontSize(11);
  const introHeight = addWrappedText(
    `Dear ${parentName},\n\nThis comprehensive guide has been created specifically for ${childName} based on their unique eating personality. Inside you'll find personalized strategies, food recommendations, and a roadmap to help make mealtimes easier and more enjoyable for your whole family.`,
    margin,
    yPosition,
    contentWidth
  );
  yPosition += introHeight + 15;

  // What's Inside box
  doc.setFillColor(239, 246, 255); // Light blue
  doc.roundedRect(margin, yPosition, contentWidth, 70, 3, 3, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('What\'s Inside This Guide:', margin + 5, yPosition + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const features = [
    '✓ Understanding Your Child\'s Eating Personality',
    '✓ Green Light, Yellow Light & Red Light Foods',
    '✓ Proven Feeding Strategies That Work',
    '✓ Sample Meal Ideas & Recipes',
    '✓ 6-Month Progress Pathway'
  ];

  features.forEach((feature, index) => {
    doc.text(feature, margin + 10, yPosition + 25 + (index * 8));
  });

  yPosition += 85;

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('Created by TryEatPal.com', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.text(new Date().toLocaleDateString(), pageWidth / 2, pageHeight - 10, { align: 'center' });

  // ===== PAGE 2: PERSONALITY PROFILE =====
  doc.addPage();
  yPosition = 20;

  // Section header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, yPosition - 10, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Understanding Your Child\'s Eating Personality', pageWidth / 2, yPosition, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPosition += 20;

  // Personality name and icon
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`${personalityDef.icon} ${personalityDef.name}`, margin, yPosition);
  doc.setFont('helvetica', 'normal');
  yPosition += 12;

  // Full description
  doc.setFontSize(11);
  const descHeight = addWrappedText(personalityDef.fullDescription, margin, yPosition, contentWidth);
  yPosition += descHeight + 10;

  checkPageBreak(40);

  // Primary Challenge
  doc.setFillColor(254, 226, 226); // Light red
  doc.roundedRect(margin, yPosition, contentWidth, 25, 3, 3, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Primary Challenge:', margin + 5, yPosition + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const challengeHeight = addWrappedText(personalityDef.primaryChallenge, margin + 5, yPosition + 18, contentWidth - 10, 10);
  yPosition += 30;

  checkPageBreak(60);

  // Strengths
  doc.setFillColor(220, 252, 231); // Light green
  doc.roundedRect(margin, yPosition, contentWidth, 50, 3, 3, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Strengths:', margin + 5, yPosition + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  personalityDef.strengths.slice(0, 3).forEach((strength, index) => {
    doc.text(`• ${strength}`, margin + 10, yPosition + 20 + (index * 8));
  });
  yPosition += 55;

  checkPageBreak(40);

  // Common Behaviors
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Common Behaviors:', margin, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  yPosition += 8;

  personalityDef.commonBehaviors.slice(0, 4).forEach((behavior, index) => {
    checkPageBreak(10);
    doc.text(`• ${behavior}`, margin + 5, yPosition);
    yPosition += 7;
  });

  // ===== PAGE 3: FOOD RECOMMENDATIONS =====
  doc.addPage();
  yPosition = 20;

  // Section header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, yPosition - 10, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Food Recommendations', pageWidth / 2, yPosition, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPosition += 20;

  // Green Light Foods
  doc.setFillColor(220, 252, 231);
  doc.roundedRect(margin, yPosition, contentWidth, 12, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('🟢 Green Light Foods - High Likelihood of Acceptance', margin + 5, yPosition + 8);
  doc.setFont('helvetica', 'normal');
  yPosition += 18;

  result.recommendations.greenLight.slice(0, 5).forEach((food) => {
    checkPageBreak(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${food.icon || '•'} ${food.name}`, margin + 5, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const foodDescHeight = addWrappedText(food.description, margin + 10, yPosition + 5, contentWidth - 15, 9);
    doc.setTextColor(0, 0, 0);
    yPosition += foodDescHeight + 10;
  });

  yPosition += 5;
  checkPageBreak(50);

  // Yellow Light Foods
  doc.setFillColor(254, 249, 195);
  doc.roundedRect(margin, yPosition, contentWidth, 12, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('🟡 Yellow Light Foods - Introduce With Care', margin + 5, yPosition + 8);
  doc.setFont('helvetica', 'normal');
  yPosition += 18;

  result.recommendations.yellowLight.slice(0, 5).forEach((food) => {
    checkPageBreak(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${food.icon || '•'} ${food.name}`, margin + 5, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const foodDescHeight = addWrappedText(food.description, margin + 10, yPosition + 5, contentWidth - 15, 9);
    doc.setTextColor(0, 0, 0);
    yPosition += foodDescHeight + 10;
  });

  yPosition += 5;
  checkPageBreak(50);

  // Red Light Foods
  doc.setFillColor(254, 226, 226);
  doc.roundedRect(margin, yPosition, contentWidth, 12, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('🔴 Red Light Foods - Avoid For Now', margin + 5, yPosition + 8);
  doc.setFont('helvetica', 'normal');
  yPosition += 18;

  result.recommendations.redLight.slice(0, 5).forEach((food) => {
    checkPageBreak(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${food.icon || '•'} ${food.name}`, margin + 5, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const foodDescHeight = addWrappedText(food.description, margin + 10, yPosition + 5, contentWidth - 15, 9);
    doc.setTextColor(0, 0, 0);
    yPosition += foodDescHeight + 10;
  });

  // ===== PAGE 4: STRATEGIES =====
  doc.addPage();
  yPosition = 20;

  // Section header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, yPosition - 10, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Proven Feeding Strategies', pageWidth / 2, yPosition, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPosition += 20;

  result.strategies.forEach((strategy, index) => {
    checkPageBreak(60);

    // Strategy card
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin, yPosition, contentWidth, 55, 3, 3, 'F');

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${strategy.icon} ${strategy.title}`, margin + 5, yPosition + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    addWrappedText(strategy.description, margin + 5, yPosition + 18, contentWidth - 10, 10);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    strategy.tips.slice(0, 3).forEach((tip, tipIndex) => {
      doc.text(`• ${tip}`, margin + 10, yPosition + 30 + (tipIndex * 6));
    });

    yPosition += 60;
  });

  // ===== PAGE 5: PROGRESS PATHWAY (if included) =====
  if (includeProgressPath) {
    doc.addPage();
    yPosition = 20;

    // Section header
    doc.setFillColor(99, 102, 241);
    doc.rect(0, yPosition - 10, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${childName}'s Progress Pathway`, pageWidth / 2, yPosition, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    yPosition += 20;

    doc.setFontSize(11);
    addWrappedText(
      'Here\'s a realistic roadmap showing where your child is now and where they\'re heading. Remember: progress isn\'t linear, and every child moves at their own pace.',
      margin,
      yPosition,
      contentWidth
    );
    yPosition += 20;

    result.progressPathway.forEach((phase, index) => {
      checkPageBreak(70);

      // Phase card
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, yPosition, contentWidth, 60, 3, 3, 'F');

      // Phase number circle
      doc.setFillColor(99, 102, 241);
      doc.circle(margin + 10, yPosition + 10, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text(`${phase.phase}`, margin + 10, yPosition + 13, { align: 'center' });

      // Phase title
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(phase.title, margin + 25, yPosition + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text(`Duration: ${phase.duration}`, margin + 25, yPosition + 19);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      addWrappedText(phase.description, margin + 5, yPosition + 27, contentWidth - 10, 10);

      doc.setFontSize(8);
      phase.milestones.slice(0, 3).forEach((milestone, mIndex) => {
        doc.text(`✓ ${milestone}`, margin + 10, yPosition + 42 + (mIndex * 5));
      });

      yPosition += 65;
    });
  }

  // ===== FINAL PAGE: NEXT STEPS =====
  doc.addPage();
  yPosition = 20;

  // Section header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, yPosition - 10, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Your Next Steps', pageWidth / 2, yPosition, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPosition += 25;

  // Next steps
  const nextSteps = [
    {
      number: '1',
      title: 'Start With One Strategy',
      text: 'Choose one feeding strategy from this guide and commit to it for 2 weeks. Consistency is key.'
    },
    {
      number: '2',
      title: 'Keep a Food Journal',
      text: 'Track what foods your child tries and their reactions. You\'ll start to see patterns emerge.'
    },
    {
      number: '3',
      title: 'Reduce Mealtime Pressure',
      text: 'Division of responsibility: You decide what, when, and where. They decide if and how much.'
    },
    {
      number: '4',
      title: 'Celebrate Small Wins',
      text: 'Looking at a new food is progress. Touching it is progress. Licking it is progress. Celebrate it all.'
    }
  ];

  nextSteps.forEach((step) => {
    checkPageBreak(35);

    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin, yPosition, contentWidth, 28, 3, 3, 'F');

    // Number circle
    doc.setFillColor(99, 102, 241);
    doc.circle(margin + 10, yPosition + 12, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(step.number, margin + 10, yPosition + 15, { align: 'center' });

    // Step content
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(step.title, margin + 22, yPosition + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    addWrappedText(step.text, margin + 22, yPosition + 19, contentWidth - 27, 9);

    yPosition += 33;
  });

  yPosition += 10;
  checkPageBreak(50);

  // Call to action
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, yPosition, contentWidth, 45, 3, 3, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Want Personalized Meal Plans?', pageWidth / 2, yPosition + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`TryEatPal creates weekly meal plans specifically for ${personalityDef.name} kids.`, pageWidth / 2, yPosition + 22, { align: 'center' });
  doc.text('Try it free for $1 • No commitment • Cancel anytime', pageWidth / 2, yPosition + 30, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(99, 102, 241);
  doc.text('Visit: www.tryeatpal.com', pageWidth / 2, yPosition + 38, { align: 'center' });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text('This guide is for informational purposes only. Consult your pediatrician for medical advice.', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.text('© TryEatPal.com • All Rights Reserved', pageWidth / 2, pageHeight - 10, { align: 'center' });

  // Generate and return blob
  return doc.output('blob');
}

/**
 * Download PDF report
 */
export async function downloadPDFReport(
  result: QuizResult,
  options: PDFGenerationOptions = {}
): Promise<void> {
  const blob = await generatePDFReport(result, options);
  const childName = options.childName || 'Your Child';
  const filename = `${childName.replace(/\s+/g, '_')}_Feeding_Strategy_Guide.pdf`;

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
