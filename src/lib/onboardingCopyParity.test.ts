import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two clients ask the first-run question with the same words (US-704).
 *
 * iOS mirrors `src/pages/Onboarding.tsx` -- same three choices, same order,
 * same copy -- so the answer means one thing across the product. The Swift
 * suite pins its own side against hardcoded strings, which catches a change
 * made in Swift. It cannot catch the other direction: somebody rewording a
 * choice here would leave iOS asking the old question, and nothing would fail.
 *
 * This reads both files and compares them. It is the same arrangement as
 * `offlineReplayCoverage.test.ts`, which parses `OfflineStore.swift` -- the
 * web suite is the only place that can see both trees at once.
 */

const ROOT = path.resolve(__dirname, '..', '..');

const WEB = readFileSync(path.join(ROOT, 'src', 'pages', 'Onboarding.tsx'), 'utf8');
const SWIFT = readFileSync(
  path.join(ROOT, 'ios', 'EatPal', 'EatPal', 'Services', 'OnboardingFlow.swift'),
  'utf8',
);

/** `{ id, title, description }` entries from the web route's CHOICES array. */
const webChoices = (() => {
  const start = WEB.indexOf('const CHOICES: Choice[] = [');
  expect(start, 'CHOICES not found in the web route').toBeGreaterThan(-1);
  const body = WEB.slice(start, WEB.indexOf('\n];', start));

  return [...body.matchAll(/id:\s*"([a-z_]+)",\s*title:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g)].map(
    (m) => ({ id: m[1], title: m[2], description: m[3] }),
  );
})();

describe('onboarding copy parity (US-704)', () => {
  it('found the web choices at all', () => {
    // Coverage over an empty list is not coverage: if the shape of CHOICES
    // changes, this fails rather than passing vacuously.
    expect(webChoices).toHaveLength(3);
  });

  it('offers the same ids in the same order on both clients', () => {
    // The order is the order a parent reads them in, and the ids are what
    // analytics and US-740's household_eaters rows will carry.
    const swiftOrder = [...SWIFT.matchAll(/case (\w+) = "([a-z_]+)"/g)].map((m) => m[2]);
    expect(swiftOrder).toEqual(webChoices.map((c) => c.id));
  });

  it('uses the same title and description for every choice', () => {
    const missing = webChoices.flatMap((choice) => {
      const problems: string[] = [];
      if (!SWIFT.includes(`"${choice.title}"`)) {
        problems.push(`${choice.id} title: web says "${choice.title}"`);
      }
      if (!SWIFT.includes(`"${choice.description}"`)) {
        problems.push(`${choice.id} description: web says "${choice.description}"`);
      }
      return problems;
    });

    expect(
      missing,
      'OnboardingFlow.swift does not carry this copy. Change both clients or neither -- ' +
        'the same question asked two ways is two products.',
    ).toEqual([]);
  });

  it('agrees on which answer asks for a child', () => {
    // Web: `const needsChild = planningFor === "my_family"`. iOS: the
    // `needsChild` computed property. A split here means one client creates a
    // child the other does not.
    expect(WEB).toMatch(/needsChild\s*=\s*planningFor === "my_family"/);
    expect(SWIFT).toMatch(/needsChild:\s*Bool\s*\{\s*self == \.myFamily\s*\}/);
  });

  it('agrees on the step counts', () => {
    // Web: `const totalSteps = needsChild ? 2 : 1`.
    expect(WEB).toMatch(/totalSteps\s*=\s*needsChild \? 2 : 1/);
    expect(SWIFT).toContain('? 2 : 1');
  });
});
