import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Every queued op kind has somewhere to be replayed (US-823).
 *
 * The trap this catches, recorded on the story and still live: QueuedOpKind in
 * app/mobile/lib/syncQueue.ts declares 'ladder.attempt' and 'ladder.patch',
 * and the mobile driver's switch handles neither. Both fall to
 * `default: return false`, so the shared drain retries them five times and
 * drops them. Nothing enqueues those kinds today -- src/lib/ladderSyncOps.ts
 * is spec with no runtime caller -- so it costs nothing yet. The moment
 * somebody wires an enqueue without adding the replay arm, an offline exposure
 * -ladder write is silently thrown away, and nothing says so.
 *
 * A type union cannot enforce this on its own: `default` satisfies the
 * compiler and swallows the case. So the union and the switch are compared as
 * text, which is the only place the disagreement is visible.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The string literals in a `type X = 'a' | 'b'` union.
 *
 * Comments are stripped FIRST. The mobile union carries a paragraph explaining
 * why two of its members have no replay arm, and an apostrophe in prose
 * ("driver's switch") reads as a string literal otherwise -- which is how the
 * first version of this test reported a member called "s switch handles the
 * seven".
 */
function unionMembers(source: string, typeName: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const start = withoutComments.indexOf(`type ${typeName}`);
  if (start === -1) throw new Error(`type ${typeName} not found`);
  const body = withoutComments.slice(start, withoutComments.indexOf(';', start));
  return [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** The literals a switch actually has a `case` for. */
function handledCases(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map((m) => m[1])
  );
}

describe('the mobile queue replays every kind it declares', () => {
  const declared = unionMembers(read('app/mobile/lib/syncQueue.ts'), 'QueuedOpKind');
  const handled = handledCases(read('app/mobile/hooks/useOfflineSyncDriver.ts'));

  it('found both sides, so a rename cannot make this vacuous', () => {
    expect(declared.length).toBeGreaterThan(3);
    expect(handled.size).toBeGreaterThan(3);
  });

  /**
   * Declared ahead of their replay arm, on purpose, as the contract US-609
   * will implement. Keeping them here rather than deleting them preserves that
   * contract; what makes them safe is the assertion below that nothing
   * enqueues them yet.
   */
  const AWAITING_REPLAY: Record<string, string> = {
    'ladder.attempt': 'US-609. The INTENT of a quick log, so a replay can recompute.',
    'ladder.patch': 'US-609. A direct parent edit (pause, resume, skip), an absolute set.',
  };

  it.each(declared.filter((kind) => !(kind in AWAITING_REPLAY)))(
    '%s has a replay arm',
    (kind) => {
      expect(
        handled.has(kind),
        `QueuedOpKind declares '${kind}' and the driver's switch has no case for it, so a ` +
          'queued op of that kind falls to default, is retried five times and then dropped. ' +
          'Either add the replay arm or remove the kind from the union -- a declared kind with ' +
          'nowhere to land is a silent data loss waiting for its first caller.'
      ).toBe(true);
    }
  );

  it('still has no replay arm for the kinds waiting on US-609', () => {
    // If one gains an arm, delete its entry above rather than leaving a stale
    // exemption. A list that never shrinks stops being read.
    for (const kind of Object.keys(AWAITING_REPLAY)) {
      expect(
        handled.has(kind),
        `'${kind}' now has a replay arm -- remove it from AWAITING_REPLAY.`
      ).toBe(false);
    }
  });

  /**
   * THE ASSERTION THAT MAKES THE TRAP SAFE.
   *
   * A declared kind with no replay arm costs nothing while nothing enqueues
   * it. The moment somebody wires an enqueue and forgets the arm, an offline
   * exposure-ladder write is retried five times and thrown away with nothing
   * said. So: no enqueue may name these until they can be replayed.
   */
  it('nothing enqueues a kind that cannot be replayed', () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git') continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.|\.spec\./.test(entry)) continue;
        // The file that DECLARES the union names every kind, and its exported
        // enqueue() sits a few lines away -- that is the declaration, not a
        // caller.
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (rel === 'app/mobile/lib/syncQueue.ts') continue;
        const body = readFileSync(full, 'utf8');
        for (const kind of Object.keys(AWAITING_REPLAY)) {
          // An enqueue names the kind next to a queue call. The declaration
          // itself, and ladderSyncOps.ts's spec, only name it in a type or a
          // comment.
          const enqueues = new RegExp(
            `(enqueue|queueWrite|queueWrites|addToQueue)[^;]{0,200}['"]${kind}['"]`,
            's'
          ).test(body);
          if (enqueues) callers.push(`${rel} -> ${kind}`);
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    walk(path.join(ROOT, 'app'));

    expect(
      callers,
      'These enqueue a kind the replay switch does not handle, so the write is retried five ' +
        'times and silently dropped. Add the replay arm in the same change as the enqueue.'
    ).toEqual([]);
  });
});

describe('the web queue replays every kind it declares', () => {
  const source = read('src/lib/webSyncQueue.ts');
  const declared = unionMembers(source, 'WebQueuedOpKind');
  const handled = handledCases(source);

  it('found both sides', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it.each(declared)('%s has a replay arm', (kind) => {
    expect(
      handled.has(kind),
      `WebQueuedOpKind declares '${kind}' with no case in createGroceryExecutor.`
    ).toBe(true);
  });

  it('does not claim a kind the web app cannot queue', () => {
    // Inserts are deliberately absent: the database owns `id`, so a queued
    // insert replays under an id the optimistic row does not have and comes
    // back over realtime as a second row. Declaring one here would invite
    // exactly that.
    expect(declared.some((kind) => kind.endsWith('.insert'))).toBe(false);
  });
});
