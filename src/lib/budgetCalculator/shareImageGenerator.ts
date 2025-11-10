/**
 * Share Image Generator for Budget Calculator
 * Creates shareable social media images with budget results
 */

import { BudgetCalculation } from '@/types/budgetCalculator';
import { formatCurrency } from './calculator';

export interface ShareImageOptions {
  calculation: BudgetCalculation;
  familySize: number;
  name?: string;
  format?: 'post' | 'story';
}

/**
 * Generate share image for social media
 */
export async function generateShareImage(options: ShareImageOptions): Promise<Blob> {
  const { calculation, familySize, name, format = 'post' } = options;

  // Canvas dimensions
  const width = format === 'story' ? 1080 : 1200;
  const height = format === 'story' ? 1920 : 630;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#10b981'); // Green
  gradient.addColorStop(1, '#059669'); // Darker green
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add pattern overlay
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 100 + 50,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Main content area
  const contentY = format === 'story' ? height / 2 - 300 : height / 2 - 200;

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px Arial, sans-serif';
  ctx.textAlign = 'center';

  if (format === 'story') {
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.fillText('💰 My Grocery Budget', width / 2, contentY);
  } else {
    ctx.fillText('My Grocery Budget Results', width / 2, contentY);
  }

  // Main budget amount - large and prominent
  ctx.font = 'bold 100px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = 'bold 140px Arial, sans-serif';
  }
  ctx.fillText(formatCurrency(calculation.recommendedMonthlyBudget), width / 2, contentY + 120);

  ctx.font = '32px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = '40px Arial, sans-serif';
  }
  ctx.fillText('per month', width / 2, contentY + 165);

  // Family info
  ctx.font = 'bold 28px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = 'bold 36px Arial, sans-serif';
  }
  const familyText = `Family of ${familySize}${name ? ` - ${name}` : ''}`;
  ctx.fillText(familyText, width / 2, contentY + 215);

  // Savings callout box
  const boxY = contentY + 260;
  const boxHeight = format === 'story' ? 200 : 120;

  // White box with slight transparency
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  roundRect(ctx, width * 0.1, boxY, width * 0.8, boxHeight, 15);
  ctx.fill();

  ctx.fillStyle = '#ffffff';

  if (format === 'story') {
    // Story format - stack vertically
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.fillText('Annual Savings vs Meal Kits:', width / 2, boxY + 50);

    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.fillText(formatCurrency(calculation.annualSavings), width / 2, boxY + 110);

    ctx.font = '28px Arial, sans-serif';
    ctx.fillText('per year! 🎉', width / 2, boxY + 150);
  } else {
    // Post format - side by side
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('💵 Cost per meal:', width * 0.3, boxY + 40);
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.fillText(formatCurrency(calculation.costPerMeal), width * 0.3, boxY + 80);

    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('💰 Annual savings:', width * 0.7, boxY + 40);
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.fillText(formatCurrency(calculation.annualSavings), width * 0.7, boxY + 80);
  }

  // Footer / CTA
  const footerY = format === 'story' ? height - 250 : height - 120;

  ctx.font = 'bold 28px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = 'bold 40px Arial, sans-serif';
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Calculate your budget at', width / 2, footerY);

  ctx.font = 'bold 36px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = 'bold 52px Arial, sans-serif';
  }
  ctx.fillText('TryEatPal.com', width / 2, footerY + 50);

  // USDA badge
  ctx.font = '20px Arial, sans-serif';
  if (format === 'story') {
    ctx.font = '28px Arial, sans-serif';
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText('Based on USDA Food Plans', width / 2, footerY + 90);

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to generate image'));
      }
    }, 'image/png');
  });
}

/**
 * Download share image
 */
export async function downloadShareImage(
  calculation: BudgetCalculation,
  familySize: number,
  name?: string,
  format: 'post' | 'story' = 'post'
): Promise<void> {
  const blob = await generateShareImage({ calculation, familySize, name, format });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `budget-results-${format}-${new Date().toISOString().split('T')[0]}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper function to draw rounded rectangles
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
