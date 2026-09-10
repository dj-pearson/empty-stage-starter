import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A retry is only safe when repeating the call is safe.
 *
 * US-400 gave EdgeFunctions a blanket retry on timeouts, dropped connections
 * and 502/503/504. That is right for a read and wrong for anything that
 * changes state: a timeout does not mean the server did nothing, it means we
 * did not hear back. `bind-email-verify` is the case that shows why. The code
 * is single-use, so a request that succeeded and then timed out would be
 * repeated, the server would reject the now-spent code, and the user would be
 * told their code is invalid while their email was in fact bound.
 *
 * The policy is now opt-in. `.sendOnce` is the default and retries only the
 * URL errors that prove the request never reached the server; `.safeToRepeat`
 * keeps the old behaviour for calls that are reads.
 *
 * Source-contract assertions: there is no Swift runtime here.
 */

const SERVICES = path.resolve(__dirname, '../../ios/EatPal/EatPal/Services');
const EDGE = readFileSync(path.join(SERVICES, 'EdgeFunctions.swift'), 'utf8');

/** Every `EdgeFunctions.invoke(...)` in the app, with its function name. */
function callSites(): { file: string; fn: string; safeToRepeat: boolean }[] {
  const sites: { file: string; fn: string; safeToRepeat: boolean }[] = [];
  for (const name of readdirSync(SERVICES)) {
    if (!name.endsWith('.swift') || name === 'EdgeFunctions.swift') continue;
    const source = readFileSync(path.join(SERVICES, name), 'utf8');
    const pattern = /EdgeFunctions\.invoke(?:Raw)?\(\s*\n?\s*"([^"]+)"([\s\S]{0,300}?)\n\s*\)/g;
    for (const match of source.matchAll(pattern)) {
      sites.push({
        file: name,
        fn: match[1],
        safeToRepeat: match[2].includes('retry: .safeToRepeat'),
      });
    }
  }
  return sites;
}

const sites = callSites();

/** The contents of a `let <name>: Set<URLError.Code> = [ ... ]` literal. */
function setLiteral(name: string): string {
  const start = EDGE.indexOf(`${name}: Set<URLError.Code> = [`);
  expect(start, `${name} not found in EdgeFunctions.swift`).toBeGreaterThan(-1);
  const open = EDGE.indexOf('[', start);
  return EDGE.slice(open, EDGE.indexOf(']', open));
}

/**
 * Calls that must never be repeated on an unknown outcome. Each one either
 * consumes something single-use or has an outward side effect.
 */
const MUST_SEND_ONCE = ['bind-email-verify', 'bind-email-request'];

describe('edge function retry safety', () => {
  it('finds the call sites', () => {
    // Floor: "nothing unsafe" must not be true of an empty scan.
    expect(sites.length).toBeGreaterThanOrEqual(8);
  });

  it('defaults to not repeating a call', () => {
    expect(EDGE).toContain('retry: RetrySafety = .sendOnce');
    expect(EDGE).toContain('retry safety: RetrySafety = .sendOnce');
  });

  it('retries a send-once call only when the request never reached the server', () => {
    // .timedOut and .networkConnectionLost both happen after the bytes are on
    // the wire, so they say nothing about whether the server acted.
    const unknown = setLiteral('outcomeUnknown');
    expect(unknown).toContain('.timedOut');
    expect(unknown).toContain('.networkConnectionLost');

    const neverReached = setLiteral('neverReachedServer');
    for (const code of ['.notConnectedToInternet', '.cannotFindHost', '.dnsLookupFailed']) {
      expect(neverReached).toContain(code);
    }
    expect(neverReached).not.toContain('.timedOut');
    expect(neverReached).not.toContain('.networkConnectionLost');

    // An HTTP status means the connection reached the gateway, and the client
    // cannot tell a proxy that never forwarded from an upstream that ran and
    // did not answer. So no status is retried under .sendOnce.
    expect(EDGE).toContain('if safety == .safeToRepeat,\n                   retryableStatuses.contains');
  });

  it('never marks a single-use or outward-effect call as safe to repeat', () => {
    const violations = sites
      .filter((s) => MUST_SEND_ONCE.includes(s.fn) && s.safeToRepeat)
      .map((s) => `${s.file}: ${s.fn}`);
    expect(violations).toEqual([]);
  });

  it('keeps the retry for the reads that US-400 was written for', () => {
    // Losing these silently would undo US-400 without anyone noticing.
    const reads = ['parse-recipe', 'generate-meal-suggestions', 'recognize-fridge-contents'];
    for (const fn of reads) {
      const site = sites.find((s) => s.fn === fn);
      expect(site, `no call site for ${fn}`).toBeDefined();
      expect(site?.safeToRepeat, `${fn} lost its retry`).toBe(true);
    }
  });
});
