import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { PHOTO_AI_NOTICE } from './aiSafety';

/**
 * US-632: the Privacy Policy now states that photos submitted to AI features
 * are passed through and not stored. That is currently true - the functions
 * take base64 in the request body and hand it straight to the model - and it is
 * the kind of thing a later "let's cache uploads" change would quietly break.
 * These tests make that change argue with a failing test first.
 */
const IMAGE_FUNCTIONS = [
  'identify-food-image',
  'parse-receipt-image',
  'recognize-fridge-contents',
];

const readFn = (name: string) =>
  readFileSync(path.resolve(__dirname, '../../supabase/functions', name, 'index.ts'), 'utf-8');

describe('photo pass-through', () => {
  it.each(IMAGE_FUNCTIONS)('%s never writes the image to storage', (name) => {
    const source = readFn(name);

    expect(source).not.toMatch(/storage\s*\n?\s*\.from\(/);
    expect(source).not.toMatch(/\.upload\(/);
  });

  it.each(IMAGE_FUNCTIONS)('%s never persists the image to a table', (name) => {
    const source = readFn(name);
    const insertsImage = /\.insert\(\s*\{[^}]*(image|base64|photo)/is.test(source);

    expect(insertsImage).toBe(false);
  });

  it.each(IMAGE_FUNCTIONS)('%s takes the image from the request body', (name) => {
    expect(readFn(name)).toMatch(/imageBase64/);
  });
});

describe('photo disclosure', () => {
  const POLICY = readFileSync(
    path.resolve(__dirname, '../pages/PrivacyPolicy.tsx'),
    'utf-8'
  );

  it('lists photos among the information collected', () => {
    expect(POLICY).toMatch(/child profile photos/i);
    expect(POLICY).toMatch(/grocery receipts/i);
  });

  it('explains what happens to a photo sent to an AI feature', () => {
    expect(POLICY).toMatch(/Photos submitted to AI features/i);
    expect(POLICY).toMatch(/not retained by us/i);
  });

  it('separates stored profile photos from pass-through photos', () => {
    expect(POLICY).toMatch(/Child profile photos are different/i);
    expect(POLICY).toMatch(/not sent to AI providers/i);
  });

  it.each([
    'src/components/ImageFoodCapture.tsx',
    'src/components/ScanReceiptDialog.tsx',
  ])('%s shows the notice before the photo is sent', (file) => {
    const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf-8');
    expect(source).toMatch(/PHOTO_AI_NOTICE/);
  });

  it('says where the photo goes and what happens to it', () => {
    expect(PHOTO_AI_NOTICE).toMatch(/third-party AI provider/i);
    expect(PHOTO_AI_NOTICE).toMatch(/don't store it/i);
  });
});
