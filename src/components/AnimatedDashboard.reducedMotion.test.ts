import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * US-821. The dashboard's entrance variants neutralised y and scale under
 * prefers-reduced-motion but left `opacity: 0` as the hidden state, so someone
 * who asked for less motion still got the whole dashboard fading in.
 *
 * A source assertion rather than a render one, because what matters is that
 * the hidden opacity is CONDITIONAL -- rendering it would only prove whatever
 * matchMedia the test environment stubs.
 */
const SOURCE = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'AnimatedDashboard.tsx'),
  'utf8'
);

describe('the dashboard entrance animation', () => {
  it('has no unconditional hidden opacity left', () => {
    // `hidden: { opacity: 0 }` or `opacity: 0,` inside a hidden variant is the
    // shape this fixes. whileHover and decorative opacities are untouched and
    // do not use the `hidden` key.
    const hiddenBlocks = SOURCE.match(/hidden:\s*\{[^}]*\}/g) ?? [];
    expect(hiddenBlocks.length).toBeGreaterThan(0);
    for (const block of hiddenBlocks) {
      expect(block, `hidden variant still fades unconditionally: ${block}`).not.toMatch(
        /opacity:\s*0\b(?!\s*:)/
      );
      expect(block).toMatch(/opacity:\s*shouldReduceMotion\s*\?\s*1\s*:\s*0/);
    }
  });

  it('still animates for everyone else', () => {
    // The point is the preference, not removing the animation.
    expect(SOURCE).toMatch(/shouldReduceMotion\s*\?\s*0\s*:\s*0\.(4|5)/);
  });

  it('gates every entrance opacity, inline ones included', () => {
    // The variants were only half of it. Four m.* elements set their entrance
    // state inline with initial={{ opacity: 0, y: shouldReduceMotion ? 0 : N }}
    // -- the movement gated, the fade not. The subtitle in the welcome banner
    // was still carrying style="opacity: 0" when the accessibility scan read
    // it, which is why its text measured against a half-transparent card.
    //
    // The exception is a hover overlay, which starts invisible by design and
    // has no `animate` of its own.
    const inlineInitials = SOURCE.match(/initial=\{\{[^}]*\}\}/g) ?? [];
    const entranceFades = inlineInitials.filter(
      (block) => /opacity:/.test(block) && !/opacity:\s*shouldReduceMotion/.test(block)
    );
    expect(entranceFades, `ungated entrance fade: ${entranceFades.join(', ')}`).toEqual([
      'initial={{ opacity: 0 }}',
    ]);
  });
});
