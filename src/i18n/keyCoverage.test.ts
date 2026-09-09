import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import en from './locales/en.json';

/**
 * US-833: a key with no entry renders as the key.
 *
 * i18n.test.ts already pins that behaviour -- `t('does.not.exist')` returns
 * 'does.not.exist' -- but nothing checked the keys the app actually uses. Four
 * of them had no entry, so the exposure-ladder row menu rendered buttons
 * labelled "foodLadder.actions.pause", "foodLadder.actions.resume",
 * "foodLadder.actions.stepDown" and "foodLadder.actions.remove".
 *
 * PLURALS ARE THE TRAP HERE. i18next resolves `t('x.count', { count })` against
 * `x.count_one` / `x.count_other`, so a naive flatten reports five perfectly
 * good keys as missing -- which is exactly what my first pass did, and five of
 * its nine "findings" were wrong. The suffixes are stripped below.
 */

const ROOT = path.resolve(__dirname, '../..');

/** Every leaf key, with CLDR plural suffixes reduced to their base. */
function definedKeys(): Set<string> {
  const out = new Set<string>();
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const key = `${prefix}${k}`;
      if (v && typeof v === 'object') walk(v as Record<string, unknown>, `${key}.`);
      else {
        out.add(key);
        out.add(key.replace(/_(zero|one|two|few|many|other)$/, ''));
      }
    }
  };
  walk(en as Record<string, unknown>, '');
  return out;
}

/** Every literal key the app passes to t(). Template keys are skipped. */
function referencedKeys(): Map<string, string[]> {
  const files = execSync("find src -name '*.tsx' -o -name '*.ts'", { encoding: 'utf8', cwd: ROOT })
    .trim()
    .split('\n')
    .filter((f) => f && !/\.test\.|src\/i18n\//.test(f));

  const used = new Map<string, string[]>();
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g)) {
      const list = used.get(m[1]) ?? [];
      list.push(file);
      used.set(m[1], list);
    }
  }
  return used;
}

describe('every translation key the app uses has English copy', () => {
  const defined = definedKeys();
  const referenced = referencedKeys();

  it('found both sides to compare', () => {
    // Assert the instrument: a regex that stops matching would make the
    // comparison below an empty-set tautology.
    expect(defined.size).toBeGreaterThanOrEqual(400);
    expect(referenced.size).toBeGreaterThanOrEqual(300);
  });

  it('resolves every referenced key', () => {
    const missing = [...referenced.entries()]
      .filter(([key]) => !defined.has(key))
      .map(([key, files]) => `${key}  (used in ${files[0]})`);
    expect(missing).toEqual([]);
  });

  it('counts a pluralised key as defined via its _one/_other forms', () => {
    // Guards the suffix stripping itself. Without it these read as missing and
    // the suite would fail on correct code -- the false-positive half of this.
    for (const key of [
      'foodLadder.weekly.exposureCount',
      'foodLadder.weekly.foodCount',
      'foodLadder.weekly.andMore',
      'foodLadder.weekly.mastered',
      'foodLadder.weekly.masteredTotal',
    ]) {
      expect(defined.has(key), `${key} should resolve through its plural forms`).toBe(true);
    }
  });
});
