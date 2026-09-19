import { describe, it, expect } from 'vitest';
import { TRANSIENT_SNAPSHOT_SELECTORS, stripTransientUi } from '../../scripts/prerender.mjs';

/**
 * US-570: a toast must not end up in the HTML a crawler reads.
 *
 * Found by building this repo and reading dist/ rather than the build log.
 * `/pricing` calls `toast.error("Failed to load pricing plans")` when the
 * subscription_plans fetch fails, and the prerenderer snapshots whatever is on
 * screen -- so dist/pricing.html opened with that sentence as its first line of
 * rendered text, with `data-sonner-toast=""`, `data-type="error"` and
 * `data-visible="true"` present as live markup rather than as a CSS selector.
 *
 * The build exits 0 either way. A build with working credentials raises no such
 * toast, which is what makes this worth stripping rather than detecting: it is
 * invisible until the one build where a key is wrong or a table is briefly
 * unreadable, and that build succeeds and publishes the apology to Googlebot,
 * GPTBot, ClaudeBot and every social scraper.
 *
 * The real removal happens inside page.evaluate, whose body is serialised into
 * Chromium with nothing from the module in scope. The selectors are passed in
 * as an argument so there is one list, and this exercises that same list
 * against a DOM.
 */

function domFrom(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}

/** The toaster as sonner actually renders it, trimmed from a real dist. */
const TOASTER = `
  <section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite">
    <ol dir="ltr" class="toaster group" data-sonner-toaster="true" data-theme="light">
      <li class="group toast" data-sonner-toast="" data-mounted="true" data-visible="true"
          data-type="error">Failed to load pricing plans</li>
    </ol>
  </section>
`;

describe('prerender snapshots carry no transient UI (US-570)', () => {
  it('removes a raised toast, wrapper and all', () => {
    const doc = domFrom(`<div id="root"><h1>Pricing</h1><p>Plans for families.</p></div>${TOASTER}`);

    expect(doc.body.textContent).toContain('Failed to load pricing plans');
    const removed = stripTransientUi(doc, TRANSIENT_SNAPSHOT_SELECTORS);

    expect(removed).toBeGreaterThan(0);
    expect(doc.body.textContent).not.toContain('Failed to load pricing plans');
    // The offscreen "Notifications" label goes with it rather than being left
    // behind as an empty landmark.
    expect(doc.querySelector('section[aria-label^="Notifications"]')).toBeNull();
    expect(doc.querySelector('[data-sonner-toaster]')).toBeNull();
  });

  it('leaves the page content alone', () => {
    const doc = domFrom(`<div id="root"><h1>Pricing</h1><p>Plans for families.</p></div>${TOASTER}`);
    stripTransientUi(doc, TRANSIENT_SNAPSHOT_SELECTORS);

    expect(doc.querySelector('#root')?.textContent).toBe('PricingPlans for families.');
  });

  it('does nothing when no toast was raised', () => {
    const doc = domFrom('<div id="root"><h1>Pricing</h1></div>');
    expect(stripTransientUi(doc, TRANSIENT_SNAPSHOT_SELECTORS)).toBe(0);
    expect(doc.querySelector('#root')?.textContent).toBe('Pricing');
  });

  it('does not reach for aria-live or role=status generally', () => {
    // Those are worn by real content too -- a live region announcing a filtered
    // result count is page text. A snapshot policy that eats content to catch a
    // toast is the worse trade, so the selectors stay scoped to the toaster.
    const doc = domFrom(
      '<div id="root"><p role="status" aria-live="polite">12 recipes match</p></div>'
    );
    stripTransientUi(doc, TRANSIENT_SNAPSHOT_SELECTORS);

    expect(doc.querySelector('#root')?.textContent).toBe('12 recipes match');
  });

  it('keeps the selector list and the prerenderer on the same list', () => {
    // The evaluate body inlines the loop, so the one thing that could drift is
    // the list itself not being handed across.
    expect(TRANSIENT_SNAPSHOT_SELECTORS).toContain('[data-sonner-toast]');
    expect(TRANSIENT_SNAPSHOT_SELECTORS).toContain('[data-sonner-toaster]');
  });
});
