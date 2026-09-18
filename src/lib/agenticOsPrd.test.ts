import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * prd-agentic-os.json says what it can prove (US-788).
 *
 * The 41 agentic OS stories lived only in tasks/prd-agentic-os.md, outside
 * every tool that reads a PRD here -- a shadow backlog that read as work to do
 * while being a record of work already done. Converting it to JSON is only
 * half the fix. A story that claims `passes: true` because someone typed it is
 * the same problem in a new file.
 *
 * So each story's notes name the artefact it shipped, and this re-derives the
 * claim from the repo on every run: 30 edge functions, 16 tables, 33 shared
 * logic modules and 6 Command Center tabs. Delete one and the story that
 * claims it fails here rather than sitting there as a green line.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const PRD = JSON.parse(readFileSync(path.join(ROOT, 'prd-agentic-os.json'), 'utf8'));

/** `Built: a, b, c.` / `MISSING: a, b.` out of a story's notes. */
function artefactsOf(notes: string): string[] {
  const match = notes.match(/(?:Built|MISSING):\s*(.+?)\.\s*$/);
  if (!match) return [];
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

const MIGRATIONS = readdirSync(path.join(ROOT, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(path.join(ROOT, 'supabase', 'migrations', f), 'utf8'))
  .join('\n');

function present(artefact: string): boolean {
  if (artefact.startsWith('table:')) {
    const table = artefact.slice('table:'.length);
    return new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?${table}\\b`, 'i').test(MIGRATIONS);
  }
  return existsSync(path.join(ROOT, artefact));
}

describe('the agentic OS PRD is a PRD', () => {
  it('carries all 41 stories from the markdown', () => {
    expect(PRD.userStories).toHaveLength(41);
    const ids = PRD.userStories.map((s: { id: string }) => s.id);
    expect(ids[0]).toBe('US-475');
    expect(ids[ids.length - 1]).toBe('US-515');
    expect(new Set(ids).size, 'duplicate ids').toBe(41);
  });

  it('gives every story the epic fields the other PRDs use', () => {
    // prd-kitchen-loop.json's shape, so a loop can target this file the same
    // way and the verify engine reads the same keys.
    for (const story of PRD.userStories) {
      expect(Object.keys(story)).toEqual(
        expect.arrayContaining([
          'id', 'title', 'description', 'acceptanceCriteria',
          'priority', 'passes', 'slice', 'platform', 'loopVerifiable', 'notes',
        ]),
      );
      expect(typeof story.slice).toBe('number');
      expect(['edge', 'web', 'sql']).toContain(story.platform);
      expect(typeof story.loopVerifiable).toBe('boolean');
    }
  });
});

describe('every passing story names something that exists', () => {
  const passing = PRD.userStories.filter((s: { passes: boolean }) => s.passes);

  it('has stories to check', () => {
    expect(passing.length).toBeGreaterThan(0);
  });

  it('finds every artefact those stories claim', () => {
    const broken: string[] = [];
    for (const story of passing) {
      const artefacts = artefactsOf(story.notes ?? '');
      if (artefacts.length === 0) {
        broken.push(`${story.id}: passes with no artefact named in notes`);
        continue;
      }
      for (const artefact of artefacts) {
        if (!present(artefact)) broken.push(`${story.id}: ${artefact} is gone`);
      }
    }
    expect(broken, 'stories claiming something the repo no longer has').toEqual([]);
  });
});

describe('prd-verify picks this file up with no workflow change', () => {
  const workflow = readFileSync(
    path.join(ROOT, '.github', 'workflows', 'prd-verify.yml'),
    'utf8',
  );

  it('loops the prd-*.json glob rather than naming files', () => {
    // AC2. The engine step iterates `prd.json prd-*.json`, so an epic file is
    // read by being named prd-<epic>.json and nothing else.
    expect(workflow).toMatch(/for prd in prd\.json prd-\*\.json/);
    expect(PRD).toBeTruthy();
  });

  it('is named so that glob matches it', () => {
    expect(existsSync(path.join(ROOT, 'prd-agentic-os.json'))).toBe(true);
  });

  it('is watched by the workflow trigger', () => {
    expect(workflow).toContain("- 'prd-*.json'");
  });
});

describe("prd.json's description describes prd.json", () => {
  const main = JSON.parse(readFileSync(path.join(ROOT, 'prd.json'), 'utf8'));

  it('no longer describes the agentic OS', () => {
    // AC3. It opened "Agentic OS - Autonomous multi-agent operations layer"
    // while holding the main product backlog, so anyone reading the file to
    // find out what it was got the wrong answer.
    expect(main.description).not.toMatch(/^Agentic OS/);
    expect(main.description).not.toMatch(/tier-1 routine work/i);
  });

  it('points at the file that does', () => {
    expect(main.description).toContain('prd-agentic-os.json');
  });
});
