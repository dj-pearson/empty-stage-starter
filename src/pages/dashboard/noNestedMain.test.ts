import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

/**
 * Dashboard pages render inside the dashboard shell, which already owns
 * <main id="main-content">. The old accessibility settings page added a second
 * one, so the skip link had two targets and the page two main landmarks.
 * Reads the source as text: the failure is syntactic and legible there.
 */
const DIR = path.join(process.cwd(), 'src', 'pages', 'dashboard');

describe('dashboard pages do not nest a main landmark', () => {
  const pages = readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));

  it('finds the pages to check', () => {
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages).toContain('AccountSettings.tsx');
  });

  it.each(pages)('%s renders no <main> and no #main-content', (file) => {
    const source = readFileSync(path.join(DIR, file), 'utf8');
    expect(source).not.toMatch(/<main[\s>]/);
    expect(source).not.toContain('id="main-content"');
  });
});
