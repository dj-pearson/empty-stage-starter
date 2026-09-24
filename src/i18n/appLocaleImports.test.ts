import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import en from './locales/en.json';
import { appTranslation } from './appLocale';

/**
 * Page copy in locales/app/*.json is registered by importing ./appLocale, not
 * at init, so it stays out of the entry chunk. A component that renders one of
 * those keys without the import works while some other importer happens to
 * have loaded first, and renders the raw key when it is reached another way.
 * This makes the import a rule instead of a coincidence.
 */

const ROOT = path.resolve(__dirname, '../..');

function leafKeys(tree: Record<string, unknown>, prefix = '', out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object') leafKeys(v as Record<string, unknown>, `${key}.`, out);
    else out.add(key.replace(/_(zero|one|two|few|many|other)$/, ''));
  }
  return out;
}

describe('page copy loaded through appLocale', () => {
  const appOnly = leafKeys(appTranslation as Record<string, unknown>);
  for (const key of leafKeys(en as Record<string, unknown>)) appOnly.delete(key);

  it('has keys to check (instrument sanity)', () => {
    expect(appOnly.size).toBeGreaterThan(100);
  });

  it('is imported by every file that renders one of its keys', () => {
    const files = execSync("find src -name '*.tsx' -o -name '*.ts'", { encoding: 'utf8', cwd: ROOT })
      .trim()
      .split('\n')
      .filter((f) => f && !/\.test\.|src\/i18n\//.test(f));

    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(path.join(ROOT, file), 'utf8');
      const keys = [...src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g)].map((m) => m[1]);
      const hit = keys.find((k) => appOnly.has(k));
      if (hit && !src.includes('@/i18n/appLocale')) missing.push(`${file} (${hit})`);
    }
    expect(missing).toEqual([]);
  });
});
