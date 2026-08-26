import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AWAITING_PRODUCT_DECISION,
  COMPLIANCE_TERMS,
  FEATURE_CLAIM_EVIDENCE,
  MARKETING_SURFACES,
  UNSOURCED_CLAIM_PATTERNS,
} from '@/lib/marketingClaims';
import { coreEntities } from '@/lib/seo-config';

/**
 * US-655. The gate the story asked for: the claim list pinned to something
 * checkable, so the next person writing marketing copy cannot quietly add a
 * fifth batch of claims nothing backs.
 *
 * Comments are stripped before scanning. A comment recording why a claim was
 * removed has to be able to name the claim, or the register cannot document
 * itself.
 */
const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * Remove every match, then check that removing it did not create a new one.
 *
 * A single pass is what CodeQL flags as incomplete multi-character
 * sanitization, and it is right to. Deleting a match can splice the text on
 * either side of it into a delimiter pair that was not there before:
 * `<!<!-- x -->-- y -->` becomes `<!-- y -->` once the inner comment goes, and
 * one pass would stop there and hand the scan a comment as prose. Here that
 * only skews which text the claim scan reads, but a scanner that can be fooled
 * by nesting reports what it was given rather than what is in the file.
 */
function stripRepeatedly(input: string, pattern: RegExp): string {
  let out = input;
  let previous: string;
  do {
    previous = out;
    out = out.replace(pattern, '');
  } while (out !== previous);
  return out;
}

function prose(rel: string): string {
  const source = read(rel);
  if (rel.endsWith('.ts') || rel.endsWith('.tsx')) {
    return stripRepeatedly(source, /\/\*[\s\S]*?\*\//g).replace(/^\s*\/\/.*$/gm, '');
  }
  if (rel.endsWith('.html')) {
    return stripRepeatedly(source, /<!--[\s\S]*?-->/g);
  }
  return source;
}

describe('the scanner reads what is in the file (US-655)', () => {
  it('keeps stripping when removing one comment creates another', () => {
    // Each input is one where deleting the first match splices a NEW comment
    // out of the text either side of it, so a single pass stops one comment
    // short and the leftover reaches the claim scan as prose.
    expect(stripRepeatedly('<!<!-- x -->-- y -->CLAIM', /<!--[\s\S]*?-->/g)).toBe('CLAIM');
    expect(stripRepeatedly('//*x*/* y */CLAIM', /\/\*[\s\S]*?\*\//g)).toBe('CLAIM');
  });

  it('leaves a file with no comments untouched', () => {
    expect(stripRepeatedly('HIPAA compliant', /<!--[\s\S]*?-->/g)).toBe('HIPAA compliant');
  });
});

describe('marketing surfaces claim no certification we cannot show (US-655)', () => {
  it.each(MARKETING_SURFACES)('%s exists', (surface) => {
    expect(existsSync(path.join(repoRoot, surface))).toBe(true);
  });

  const cases = MARKETING_SURFACES.flatMap((surface) =>
    COMPLIANCE_TERMS.map((term) => ({ surface, pattern: term.pattern, why: term.why }))
  );

  it.each(cases)('$surface does not claim $pattern', ({ surface, pattern, why }) => {
    const hits = prose(surface)
      .split('\n')
      .filter((line) => pattern.test(line));
    expect(hits, `${surface}: ${why}`).toEqual([]);
  });
});

describe('marketing surfaces quote no number they cannot source (US-655)', () => {
  // The .txt files are pure copy. The .ts/.tsx surfaces are scanned too, but
  // their code carries legitimate numbers (indices, widths, durations) that no
  // pattern separates from a claim, so only the copy files are gated here and
  // the others are covered by review.
  const copySurfaces = MARKETING_SURFACES.filter((surface) => surface.endsWith('.txt'));

  const cases = copySurfaces.flatMap((surface) =>
    UNSOURCED_CLAIM_PATTERNS.map((claim) => ({ surface, pattern: claim.pattern, why: claim.why }))
  );

  it.each(cases)('$surface makes no claim matching $pattern', ({ surface, pattern, why }) => {
    const hits = prose(surface)
      .split('\n')
      .filter((line) => pattern.test(line));
    expect(hits, `${surface}: ${why}`).toEqual([]);
  });
});

describe('the professional tier is described as unbuilt wherever it is named (US-655)', () => {
  // US-654 decides whether the tier gets built or retired. Until then, the two
  // crawler-facing files that describe it have to say it does not exist, and
  // this assertion is what stops that caveat from being tidied away.
  it.each(['public/llms.txt', 'public/llms-full.txt'])('%s carries the caveat', (surface) => {
    const text = read(surface);
    if (!/Professional/i.test(text)) return;
    expect(text).toMatch(/not built yet|not available yet|do not exist yet/i);
  });
});

describe('every advertised feature names a file that exists (US-655)', () => {
  it('has evidence for every entry in coreEntities.keyFeatures', () => {
    for (const feature of coreEntities.keyFeatures) {
      expect(FEATURE_CLAIM_EVIDENCE[feature], `no evidence recorded for "${feature}"`).toBeTruthy();
    }
  });

  it.each(Object.entries(FEATURE_CLAIM_EVIDENCE))('%s is backed by %s', (_feature, evidence) => {
    expect(existsSync(path.join(repoRoot, evidence))).toBe(true);
  });

  it('records no evidence for a feature that is no longer advertised', () => {
    // Keeps the register from accumulating dead entries, which is how a list
    // stops being read.
    for (const feature of Object.keys(FEATURE_CLAIM_EVIDENCE)) {
      expect(coreEntities.keyFeatures).toContain(feature);
    }
  });
});

describe('the open product decisions stay attached to their files (US-655)', () => {
  it.each(AWAITING_PRODUCT_DECISION)('$file is still where $claim lives', ({ file }) => {
    expect(existsSync(path.join(repoRoot, file))).toBe(true);
  });

  it('still has decisions outstanding, or this register should be deleted', () => {
    // A deliberate tripwire: when US-654 lands and this list empties, the empty
    // list is a lie unless someone also removes it. Failing here is the prompt.
    expect(AWAITING_PRODUCT_DECISION.length).toBeGreaterThan(0);
  });
});
