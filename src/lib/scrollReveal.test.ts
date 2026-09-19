import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  REVEALED_CLASS,
  REVEAL_ROOT_CLASS,
  STAGGER_MAX_MS,
  STAGGER_STEP_MS,
  observeReveal,
  shouldReveal,
  staggerDelayMs,
} from './scrollReveal';

/**
 * US-772. The behaviour that matters here is not the animation, it is what
 * happens when the animation does not run: the landing page is prerendered,
 * and copy left at opacity 0 is copy a crawler and a reduced-motion visitor
 * never read.
 */

/** A controllable IntersectionObserver, so no jsdom support is needed. */
function fakeObserver() {
  const observed: Element[] = [];
  let callback: IntersectionObserverCallback | null = null;
  const instance = {
    observe: (el: Element) => { observed.push(el); },
    unobserve: (el: Element) => {
      const i = observed.indexOf(el);
      if (i >= 0) observed.splice(i, 1);
    },
    disconnect: vi.fn(),
    takeRecords: () => [],
    root: null,
    rootMargin: '',
    thresholds: [],
  } as unknown as IntersectionObserver;

  const Impl = function (cb: IntersectionObserverCallback) {
    callback = cb;
    return instance;
  } as unknown as typeof IntersectionObserver;

  return {
    Impl,
    observed,
    intersect(...els: Element[]) {
      callback?.(
        els.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
        instance,
      );
    },
  };
}

function page(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <section class="animate-section">one</section>
    <div class="animate-grid">
      <div class="animate-item">a</div>
      <div class="animate-item">b</div>
      <div class="animate-item">c</div>
    </div>
  `;
  return root;
}

describe('staggerDelayMs', () => {
  it('gives the first item no delay', () => {
    expect(staggerDelayMs(0)).toBe(0);
  });

  it('steps by 100ms, the interval GSAP used', () => {
    expect(staggerDelayMs(1)).toBe(STAGGER_STEP_MS);
    expect(staggerDelayMs(3)).toBe(3 * STAGGER_STEP_MS);
  });

  it('caps, so a long row does not leave its last card blank for a second', () => {
    expect(staggerDelayMs(12)).toBe(STAGGER_MAX_MS);
  });

  it('treats nonsense as no delay rather than NaN in a style attribute', () => {
    expect(staggerDelayMs(Number.NaN)).toBe(0);
    expect(staggerDelayMs(-4)).toBe(0);
  });
});

describe('shouldReveal', () => {
  it('animates when motion is welcome and the observer exists', () => {
    expect(shouldReveal(false, true)).toBe(true);
  });

  it('declines under reduced motion', () => {
    expect(shouldReveal(true, true)).toBe(false);
  });

  it('declines with no IntersectionObserver, rather than hiding everything', () => {
    expect(shouldReveal(false, false)).toBe(false);
  });
});

describe('observeReveal', () => {
  it('arms the container and reveals an element when it intersects', () => {
    const root = page();
    const observer = fakeObserver();

    observeReveal(root, { observerImpl: observer.Impl });
    expect(root.classList.contains(REVEAL_ROOT_CLASS)).toBe(true);
    expect(observer.observed).toHaveLength(4); // 1 section + 3 items

    const section = root.querySelector('.animate-section')!;
    expect(section.classList.contains(REVEALED_CLASS)).toBe(false);
    observer.intersect(section);
    expect(section.classList.contains(REVEALED_CLASS)).toBe(true);
  });

  it('stops watching an element once it has been revealed', () => {
    const root = page();
    const observer = fakeObserver();
    observeReveal(root, { observerImpl: observer.Impl });

    const section = root.querySelector('.animate-section')!;
    observer.intersect(section);
    // Scrolling back up must not fade real copy out again.
    expect(observer.observed).not.toContain(section);
  });

  it('staggers the items in a grid by their position', () => {
    const root = page();
    observeReveal(root, { observerImpl: fakeObserver().Impl });

    const delays = Array.from(root.querySelectorAll<HTMLElement>('.animate-item')).map(
      (el) => el.style.transitionDelay,
    );
    expect(delays).toEqual(['0ms', '100ms', '200ms']);
  });

  it('NEVER arms the hidden state under reduced motion', () => {
    // The whole reason the hidden state is scoped to a class: this container
    // is prerendered HTML, and .js-reveal is what makes it invisible.
    const root = page();
    const observer = fakeObserver();

    observeReveal(root, { observerImpl: observer.Impl, prefersReducedMotion: true });

    expect(root.classList.contains(REVEAL_ROOT_CLASS)).toBe(false);
    expect(observer.observed).toHaveLength(0);
  });

  it('NEVER arms the hidden state without an IntersectionObserver', () => {
    // The real absence, not an injected one: src/test/setup.ts defines a
    // global stub, so passing `undefined` would just fall through to that.
    const root = page();
    const saved = globalThis.IntersectionObserver;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    try {
      observeReveal(root);
      expect(root.classList.contains(REVEAL_ROOT_CLASS)).toBe(false);
    } finally {
      globalThis.IntersectionObserver = saved;
    }
  });

  it('disarms on cleanup, so an unmount cannot leave the page hidden', () => {
    const root = page();
    const observer = fakeObserver();
    const stop = observeReveal(root, { observerImpl: observer.Impl });

    stop();
    expect(root.classList.contains(REVEAL_ROOT_CLASS)).toBe(false);
  });

  it('does nothing at all on a container with nothing to animate', () => {
    const root = document.createElement('div');
    const observer = fakeObserver();
    observeReveal(root, { observerImpl: observer.Impl });
    expect(root.classList.contains(REVEAL_ROOT_CLASS)).toBe(false);
  });
});

/**
 * The catch-up sweep. An element that was scrolled past between two frames
 * never intersects, so the observer never reports it -- and without this it
 * stays at opacity 0 for the rest of the session.
 */
describe('observeReveal catches up on an element the observer missed', () => {
  function pageWithRects(tops: number[]): HTMLElement {
    const root = document.createElement('div');
    tops.forEach((top, i) => {
      const el = document.createElement('section');
      el.className = 'animate-section';
      el.textContent = `s${i}`;
      el.getBoundingClientRect = () => ({ top, bottom: top + 100, height: 100 }) as DOMRect;
      root.appendChild(el);
    });
    return root;
  }

  it('reveals an element already above the fold on the next scroll', async () => {
    // -900 is "scrolled past": below the viewport one frame, above it the
    // next, with no intersection in between.
    const root = pageWithRects([-900, 5000]);
    const observer = fakeObserver();
    observeReveal(root, { observerImpl: observer.Impl });

    const [passed, far] = Array.from(root.querySelectorAll('.animate-section'));
    expect(passed.classList.contains(REVEALED_CLASS)).toBe(false);

    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(passed.classList.contains(REVEALED_CLASS)).toBe(true);
    // And it does not reveal what is still genuinely below the fold.
    expect(far.classList.contains(REVEALED_CLASS)).toBe(false);
  });

  it('stops listening once everything is revealed', async () => {
    const root = pageWithRects([-10]);
    const remove = vi.spyOn(window, 'removeEventListener');
    observeReveal(root, { observerImpl: fakeObserver().Impl });

    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    remove.mockRestore();
  });
});

/**
 * The prerendered HTML is not hidden.
 *
 * scripts/prerender.mjs renders each route in a real Chromium, with
 * `reducedMotion: 'reduce'` (prerender.mjs:748), and saves the DOM it finds.
 * So the effect runs during prerendering -- and the only reason the saved
 * markup is readable is that observeReveal declines to add .js-reveal under
 * reduced motion. Flip that branch and every prerendered page ships at opacity
 * 0 to anyone who does not run the JavaScript, which is every crawler.
 *
 * Guarded on a dist being present: the unit job has none, and the e2e job
 * downloads the build artifact (US-855 wired the same pattern for
 * headingOutline and cspInlineScripts).
 */
describe('prerendered HTML is readable without JavaScript', () => {
  const dist = path.join(process.cwd(), process.env.E2E_DIST || 'dist');
  const pages = ['index.html', 'app-shell.html'].map((f) => path.join(dist, f));

  it('carries the animated sections but never the class that hides them', () => {
    const present = pages.filter((f) => existsSync(f));
    if (present.length === 0) {
      expect(true).toBe(true); // no build here; the e2e job runs this for real
      return;
    }

    for (const file of present) {
      const html = readFileSync(file, 'utf8');
      if (!html.includes('animate-section')) continue;
      expect(html, `${path.basename(file)} was saved with the reveal armed`).not.toContain(
        REVEAL_ROOT_CLASS,
      );
    }
  });
});
