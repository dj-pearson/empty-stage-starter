/**
 * Social Share Image Generator
 * Creates shareable images for social media using Canvas API
 */

import { PersonalityType } from '@/types/quiz';
import { getPersonalityType } from './personalityTypes';

interface ShareImageOptions {
  personalityType: PersonalityType;
  childName?: string;
  template?: 'card' | 'story' | 'post';
  width?: number;
  height?: number;
}

/**
 * Generate a shareable image for social media
 */
export async function generateShareImage(options: ShareImageOptions): Promise<Blob> {
  const {
    personalityType,
    childName,
    template = 'card',
    width = 1200,
    height = 630
  } = options;

  const personalityDef = getPersonalityType(personalityType);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  const color = personalityDef.color;
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, lightenColor(color, 40));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add pattern overlay
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 30 + 10,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // White card in center
  const cardPadding = 60;
  const cardX = cardPadding;
  const cardY = cardPadding;
  const cardWidth = width - (cardPadding * 2);
  const cardHeight = height - (cardPadding * 2);

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 20);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Icon/Emoji at top
  ctx.font = 'bold 120px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(personalityDef.icon, width / 2, cardY + 120);

  // Personality name
  ctx.font = 'bold 60px Arial';
  ctx.fillStyle = color;
  ctx.fillText(personalityDef.name, width / 2, cardY + 240);

  // Child name (if provided)
  if (childName) {
    ctx.font = '32px Arial';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(`${childName}'s Food Personality`, width / 2, cardY + 300);
  }

  // Description
  ctx.font = '28px Arial';
  ctx.fillStyle = '#374151';
  const descLines = wrapText(ctx, personalityDef.shortDescription, cardWidth - 100);
  descLines.forEach((line, index) => {
    ctx.fillText(line, width / 2, cardY + 360 + (index * 40));
  });

  // Bottom branding
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('TryEatPal.com/picky-eater-quiz', width / 2, height - 100);

  // "Take the Quiz" badge
  const badgeY = height - 140;
  const badgeWidth = 250;
  const badgeHeight = 50;
  const badgeX = (width - badgeWidth) / 2;

  ctx.fillStyle = color;
  roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 25);
  ctx.fill();

  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Take the Quiz', width / 2, badgeY + 32);

  // Convert canvas to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png');
  });
}

/**
 * Generate Instagram Story format image (1080x1920)
 */
export async function generateStoryImage(
  personalityType: PersonalityType,
  childName?: string
): Promise<Blob> {
  return generateShareImage({
    personalityType,
    childName,
    template: 'story',
    width: 1080,
    height: 1920
  });
}

/**
 * Generate Facebook/Twitter post image (1200x630)
 */
export async function generatePostImage(
  personalityType: PersonalityType,
  childName?: string
): Promise<Blob> {
  return generateShareImage({
    personalityType,
    childName,
    template: 'post',
    width: 1200,
    height: 630
  });
}

/**
 * Download share image
 */
export async function downloadShareImage(
  personalityType: PersonalityType,
  childName?: string
): Promise<void> {
  const blob = await generateShareImage({ personalityType, childName });
  const personalityDef = getPersonalityType(personalityType);
  const filename = `${personalityDef.name.replace(/\s+/g, '_')}_Share.png`;

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
 * Get share image as data URL for preview
 */
export async function getShareImageDataUrl(
  personalityType: PersonalityType,
  childName?: string
): Promise<string> {
  const blob = await generateShareImage({ personalityType, childName });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Helper functions

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function lightenColor(color: string, percent: number): string {
  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Lighten
  const newR = Math.min(255, r + (255 - r) * (percent / 100));
  const newG = Math.min(255, g + (255 - g) * (percent / 100));
  const newB = Math.min(255, b + (255 - b) * (percent / 100));

  // Convert back to hex
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}
