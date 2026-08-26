import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  getSolution,
  solutionCanonical,
  solutionPages,
  solutionPath,
  solutionsDisclaimer,
} from '@/lib/solutions-content';

/**
 * US-649. The story's first acceptance criterion is a judgement call -- build a
 * page only for an audience the product genuinely serves -- and a judgement call
 * made once in a commit message decays. These assertions turn it into a check
 * that runs: every capability a page claims names a file, and the file has to be
 * there. Delete the sibling meal finder and this suite fails before the page
 * that advertises it reaches a reader.
 */
const repoRoot = path.resolve(__dirname, '../..');

describe('solutions content (US-649)', () => {
  it('publishes the three audiences that survived the capability check', () => {
    expect(solutionPages.map((p) => p.slug)).toEqual(['arfid', 'autism-sensory', 'multiple-kids']);
  });

  it('has no feeding-therapist page', () => {
    // The story listed one. There is no client management, session tracking or
    // billing in this repo to point at, so it is not published. If that tier
    // ships, add the page and the evidence with it.
    expect(solutionPages.some((p) => /therap/i.test(p.slug))).toBe(false);
  });

  it.each(solutionPages.map((p) => p.slug))('%s resolves and is substantial', (slug) => {
    const page = getSolution(slug);
    expect(page).not.toBeNull();
    expect(page!.intro.length).toBeGreaterThanOrEqual(2);
    expect(page!.capabilities.length).toBeGreaterThanOrEqual(4);
    expect(page!.limits.length).toBeGreaterThanOrEqual(2);
    expect(page!.faqs.length).toBeGreaterThanOrEqual(3);
    expect(page!.summary.length).toBeGreaterThan(40);
    expect(page!.metaDescription.length).toBeGreaterThan(80);
    expect(page!.metaDescription.length).toBeLessThan(200);
  });

  it('returns null for an unknown or missing slug', () => {
    expect(getSolution('feeding-therapists')).toBeNull();
    expect(getSolution(undefined)).toBeNull();
  });

  it('builds paths and canonicals from the slug', () => {
    for (const page of solutionPages) {
      expect(solutionPath(page.slug)).toBe(`/solutions/${page.slug}`);
      expect(solutionCanonical(page.slug)).toBe(`https://tryeatpal.com/solutions/${page.slug}`);
    }
  });
});

describe('every claimed capability points at shipped code (US-649)', () => {
  const claims = solutionPages.flatMap((page) =>
    page.capabilities.map((capability) => ({
      slug: page.slug,
      name: capability.name,
      evidence: capability.evidence,
    }))
  );

  it.each(claims)('$slug: "$name" is backed by $evidence', ({ evidence }) => {
    expect(existsSync(path.join(repoRoot, evidence))).toBe(true);
  });

  it('never ships an empty evidence path', () => {
    for (const claim of claims) {
      expect(claim.evidence).toMatch(/^(src|app|supabase|functions)\//);
    }
  });
});

describe('health-adjacent pages stay honest (US-649)', () => {
  const medicalPages = solutionPages.filter((p) => p.medical);

  it('marks ARFID and sensory feeding as medical, and the sibling page not', () => {
    expect(medicalPages.map((p) => p.slug)).toEqual(['arfid', 'autism-sensory']);
  });

  it('states plainly that the content is not medical advice', () => {
    expect(solutionsDisclaimer).toMatch(/has not been reviewed by a clinician/);
    expect(solutionsDisclaimer).toMatch(/does not|nothing here diagnoses/i);
  });

  it('names no reviewer anywhere in the module', () => {
    // MedicalWebPageSchema takes a reviewedBy. Passing one would assert a
    // clinical review that has not happened, which is the invented-credential
    // failure this repo has already had to remediate once.
    const source = readFileSync(path.join(repoRoot, 'src/lib/solutions-content.ts'), 'utf8');
    // Prose about reviewedBy is fine; assigning one is not.
    expect(source).not.toMatch(/reviewedBy\s*[:=]/);
    const pageSource = readFileSync(path.join(repoRoot, 'src/pages/SolutionPage.tsx'), 'utf8');
    expect(pageSource).not.toMatch(/reviewedBy=/);
  });

  it('quotes no statistic it cannot source', () => {
    // A percentage or an "N in M" on a health page is a claim that needs a
    // citation, and there is no citation mechanism here.
    const prose = solutionPages.flatMap((page) => [
      ...page.intro,
      ...page.limits,
      ...page.capabilities.map((c) => c.what),
      ...page.faqs.map((f) => f.answer),
      page.summary,
      page.metaDescription,
    ]);
    for (const line of prose) {
      expect(line).not.toMatch(/\d+\s?%/);
      expect(line).not.toMatch(/\b\d+ in \d+\b/);
    }
  });
});
