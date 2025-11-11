// @ts-nocheck
/**
 * PDF Generator for Budget Calculator
 * Creates comprehensive budget report PDFs
 */

import jsPDF from 'jspdf';
import {
  BudgetCalculatorInput,
  BudgetCalculation,
  BudgetMealSuggestion,
} from '@/types/budgetCalculator';
import { formatCurrency } from './calculator';

export interface BudgetPDFGenerationOptions {
  name?: string;
  includeFullTips?: boolean;
  includeMealSuggestions?: boolean;
}

/**
 * Generate PDF report for budget calculation
 */
export async function generateBudgetPDFReport(
  input: BudgetCalculatorInput,
  calculation: BudgetCalculation,
  mealSuggestions: BudgetMealSuggestion[],
  options: BudgetPDFGenerationOptions = {}
): Promise<Blob> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // Helper function to check if we need a new page
  const checkNewPage = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Helper function for word wrapping
  const wrapText = (text: string, maxWidth: number): string[] => {
    return doc.splitTextToSize(text, maxWidth);
  };

  // ========================================
  // PAGE 1: COVER & OVERVIEW
  // ========================================

  // Header / Title
  doc.setFillColor(16, 185, 129); // Green
  doc.rect(0, 0, pageWidth, 60, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('Grocery Budget Report', pageWidth / 2, 35, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  const subtitle = options.name
    ? `Personalized Budget Plan for ${options.name}'s Family`
    : 'Your Personalized Grocery Budget Plan';
  doc.text(subtitle, pageWidth / 2, 50, { align: 'center' });

  yPos = 80;

  // Family Information Box
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(243, 244, 246); // Gray background
  doc.roundedRect(margin, yPos, contentWidth, 40, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Family Profile', margin + 10, yPos + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Family Size: ${input.familySize} people`, margin + 10, yPos + 22);
  doc.text(`Adults: ${input.adults}`, margin + 10, yPos + 30);
  doc.text(`Children: ${input.children}`, margin + 90, yPos + 22);
  if (input.state) {
    doc.text(`Location: ${input.state}`, margin + 90, yPos + 30);
  }

  yPos += 55;

  // KEY BUDGET NUMBERS
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Budget Summary', margin, yPos);
  yPos += 12;

  // Recommended Budget - Highlighted
  doc.setFillColor(220, 252, 231); // Light green
  doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setTextColor(5, 150, 105); // Dark green
  doc.text('Recommended Monthly Budget', margin + 10, yPos + 10);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(calculation.recommendedMonthlyBudget), margin + 10, yPos + 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('USDA Moderate Plan', margin + contentWidth - 10, yPos + 20, { align: 'right' });

  yPos += 35;

  // Other key metrics grid
  doc.setTextColor(0, 0, 0);
  const metrics = [
    {
      label: 'Cost Per Meal',
      value: formatCurrency(calculation.costPerMeal),
      sub: 'per person',
    },
    {
      label: 'Daily Food Cost',
      value: formatCurrency(calculation.costPerPersonPerDay),
      sub: 'per person',
    },
    {
      label: 'Weekly Budget',
      value: formatCurrency(calculation.costPerPersonPerWeek),
      sub: 'per person',
    },
  ];

  const boxWidth = (contentWidth - 20) / 3;
  metrics.forEach((metric, index) => {
    const x = margin + index * (boxWidth + 10);

    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, yPos, boxWidth, 30, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(metric.label, x + boxWidth / 2, yPos + 8, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(metric.value, x + boxWidth / 2, yPos + 18, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(metric.sub, x + boxWidth / 2, yPos + 25, { align: 'center' });
  });

  yPos += 45;

  // SAVINGS COMPARISON
  checkNewPage(50);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Annual Savings Potential', margin, yPos);
  yPos += 12;

  doc.setFillColor(239, 246, 255); // Light blue
  doc.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Compared to Meal Kits:', margin + 10, yPos + 12);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235); // Blue
  doc.text(
    `Save ${formatCurrency(calculation.vsMealKitsSavings)}/month`,
    margin + 10,
    yPos + 22
  );

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Compared to Dining Out:', margin + 100, yPos + 12);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text(
    `Save ${formatCurrency(calculation.vsDiningOutSavings)}/month`,
    margin + 100,
    yPos + 22
  );

  yPos += 45;

  // Annual savings callout
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  const annualText = `💰 That's ${formatCurrency(calculation.annualSavings)} saved per year by meal planning at home!`;
  doc.text(annualText, pageWidth / 2, yPos, { align: 'center' });

  yPos += 20;

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text('Generated by TryEatPal.com - Budget Calculator', pageWidth / 2, pageHeight - 10, {
    align: 'center',
  });

  // ========================================
  // PAGE 2: USDA PLAN LEVELS & WEEKLY BREAKDOWN
  // ========================================

  doc.addPage();
  yPos = margin;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('USDA Food Plan Comparison', margin, yPos);
  yPos += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  const planDesc = wrapText(
    'The USDA provides four different food plan levels based on nutritional guidelines and typical food costs. Your recommended plan is the Moderate Cost plan, which balances nutrition and affordability.',
    contentWidth
  );
  planDesc.forEach((line) => {
    doc.text(line, margin, yPos);
    yPos += 5;
  });
  yPos += 10;

  // Plan levels table
  const plans = [
    { name: 'Thrifty Plan', cost: calculation.thriftyPlanBudget, color: [34, 197, 94] },
    { name: 'Low-Cost Plan', cost: calculation.lowCostPlanBudget, color: [59, 130, 246] },
    {
      name: 'Moderate Cost Plan ⭐',
      cost: calculation.moderatePlanBudget,
      color: [139, 92, 246],
    },
    { name: 'Liberal Plan', cost: calculation.liberalPlanBudget, color: [236, 72, 153] },
  ];

  plans.forEach((plan) => {
    checkNewPage(20);

    doc.setFillColor(249, 250, 251);
    doc.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...plan.color);
    doc.text(plan.name, margin + 10, yPos + 10);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(plan.cost) + '/month', margin + contentWidth - 10, yPos + 10, {
      align: 'right',
    });

    yPos += 20;
  });

  yPos += 10;

  // Weekly breakdown
  checkNewPage(80);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Weekly Budget Allocation', margin, yPos);
  yPos += 12;

  const weeklyTotal = calculation.recommendedMonthlyBudget / 4.33;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text(
    `Here's how to allocate your weekly budget of ${formatCurrency(weeklyTotal)}:`,
    margin,
    yPos
  );
  yPos += 15;

  const weeklyItems = [
    {
      category: 'Main Groceries',
      amount: calculation.weeklyBreakdown.groceries,
      percent: 70,
      color: [16, 185, 129],
    },
    {
      category: 'Meal Prep Items',
      amount: calculation.weeklyBreakdown.mealPrep,
      percent: 15,
      color: [59, 130, 246],
    },
    {
      category: 'Snacks',
      amount: calculation.weeklyBreakdown.snacks,
      percent: 10,
      color: [245, 158, 11],
    },
    {
      category: 'Beverages',
      amount: calculation.weeklyBreakdown.beverages,
      percent: 5,
      color: [139, 92, 246],
    },
  ];

  weeklyItems.forEach((item) => {
    checkNewPage(25);

    // Category bar
    doc.setFillColor(...item.color);
    const barWidth = (contentWidth - 100) * (item.percent / 100);
    doc.roundedRect(margin, yPos, barWidth, 12, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(item.category, margin + 5, yPos + 8);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(item.amount), margin + contentWidth - 50, yPos + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${item.percent}%`, margin + contentWidth - 10, yPos + 8, { align: 'right' });

    yPos += 18;
  });

  // ========================================
  // PAGE 3: BUDGET TIPS
  // ========================================

  doc.addPage();
  yPos = margin;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Money-Saving Tips', margin, yPos);
  yPos += 15;

  const tipSections = [
    { title: 'Budget Strategies', tips: calculation.budgetTips, icon: '💰' },
    { title: 'Reduce Food Waste', tips: calculation.wasteReductionTips, icon: '♻️' },
    { title: 'Meal Prep Hacks', tips: calculation.mealPrepTips, icon: '🍱' },
  ];

  const tipsToShow = options.includeFullTips !== false ? 999 : 5;

  tipSections.forEach((section) => {
    checkNewPage(30);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(`${section.icon} ${section.title}`, margin, yPos);
    yPos += 10;

    section.tips.slice(0, tipsToShow).forEach((tip, index) => {
      checkNewPage(20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(75, 85, 99);
      doc.text(`${index + 1}.`, margin + 5, yPos);

      doc.setFont('helvetica', 'normal');
      const tipLines = wrapText(tip, contentWidth - 15);
      tipLines.forEach((line, lineIndex) => {
        if (lineIndex > 0) checkNewPage(6);
        doc.text(line, margin + 12, yPos);
        yPos += 5;
      });

      yPos += 3;
    });

    yPos += 8;
  });

  // ========================================
  // PAGE 4: MEAL SUGGESTIONS
  // ========================================

  if (options.includeMealSuggestions !== false && mealSuggestions.length > 0) {
    doc.addPage();
    yPos = margin;

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Budget-Friendly Meal Ideas', margin, yPos);
    yPos += 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    doc.text('Affordable meals that fit your budget and dietary preferences:', margin, yPos);
    yPos += 15;

    mealSuggestions.slice(0, 10).forEach((meal) => {
      checkNewPage(35);

      // Meal card
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'F');

      // Meal name and cost
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(meal.name, margin + 8, yPos + 8);

      doc.setFontSize(14);
      doc.setTextColor(16, 185, 129);
      doc.text(formatCurrency(meal.costPerServing), margin + contentWidth - 8, yPos + 8, {
        align: 'right',
      });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('per serving', margin + contentWidth - 8, yPos + 14, { align: 'right' });

      // Prep time and servings
      doc.setFontSize(9);
      doc.text(
        `⏱ ${meal.prepTime} min | 🍽 ${meal.servings} servings | Total: ${formatCurrency(
          meal.totalCost
        )}`,
        margin + 8,
        yPos + 16
      );

      // Ingredients
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const ingredientsText = meal.ingredients.join(', ');
      const ingredientLines = wrapText(ingredientsText, contentWidth - 16);
      ingredientLines.slice(0, 2).forEach((line, index) => {
        doc.text(line, margin + 8, yPos + 22 + index * 4);
      });

      yPos += 35;
    });
  }

  // ========================================
  // FINAL PAGE: NEXT STEPS
  // ========================================

  doc.addPage();
  yPos = margin;

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text('Ready to Put Your Budget Into Action?', pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  const ctaText = wrapText(
    'TryEatPal helps you turn this budget into reality with personalized meal plans, grocery lists, and smart shopping features that help you save money and reduce waste.',
    contentWidth - 40
  );
  ctaText.forEach((line) => {
    doc.text(line, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
  });

  yPos += 15;

  // Feature boxes
  const features = [
    {
      title: 'Smart Meal Planning',
      desc: 'Get personalized meal plans that match your budget and preferences',
    },
    {
      title: 'Automated Grocery Lists',
      desc: 'Shop efficiently with organized lists that prevent overspending',
    },
    {
      title: 'Waste Tracking',
      desc: 'Reduce food waste with smart reminders and leftover suggestions',
    },
  ];

  features.forEach((feature) => {
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin + 20, yPos, contentWidth - 40, 25, 3, 3, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(feature.title, margin + 28, yPos + 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    const descLines = wrapText(feature.desc, contentWidth - 56);
    descLines.forEach((line, index) => {
      doc.text(line, margin + 28, yPos + 17 + index * 4);
    });

    yPos += 32;
  });

  yPos += 10;

  // CTA Box
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + 20, yPos, contentWidth - 40, 30, 3, 3, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Start Your Free Trial Today', pageWidth / 2, yPos + 12, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Visit TryEatPal.com to get started', pageWidth / 2, yPos + 22, { align: 'center' });

  // Footer
  yPos = pageHeight - 30;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    'This budget is based on official USDA Food Plans data (2024) and adjusted for your location and dietary needs.',
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );
  doc.text('For more information, visit TryEatPal.com', pageWidth / 2, yPos + 6, {
    align: 'center',
  });

  // Return PDF as blob
  return doc.output('blob');
}

/**
 * Download PDF report
 */
export async function downloadBudgetPDFReport(
  input: BudgetCalculatorInput,
  calculation: BudgetCalculation,
  mealSuggestions: BudgetMealSuggestion[],
  options: BudgetPDFGenerationOptions = {}
): Promise<void> {
  const blob = await generateBudgetPDFReport(input, calculation, mealSuggestions, options);

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `TryEatPal-Budget-Report-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
