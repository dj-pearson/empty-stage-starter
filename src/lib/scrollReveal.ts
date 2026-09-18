/**
 * The landing page's entrance animations, without GSAP (US-772 AC2).
 *
 * What GSAP did here was two `fromTo` tweens: each `.animate-section` fades up
 * on its own, and each `.animate-grid` staggers its `.animate-item` children.
 * That is a transition and a transition-delay, and it cost a 62 kB gz chunk
 * downloaded on the first scroll of the marketing page -- the one page whose
 * whole job is loading fast for someone who has not decided yet.
 *
 * THE PART THAT IS NOT OBVIOUS: the hidden state cannot live in the base CSS.
 * These routes are prerendered (US-570) and a crawler reading the saved HTML
 * runs no JavaScript, so `opacity: 0` in a plain stylesheet hides the copy from
 * it permanently. GSAP never had this problem because `fromTo` wrote the start
 * state as an inline style at runtime. So the hidden state is scoped to
 * `.js-reveal`, a class added by script, and anything that stops the script --
 * no JavaScript, a crashed chunk, reduced motion -- leaves every section
 * visible. The class goes on the container rather than each element so one
 * write covers the whole page.
 */

/** Put on the container, by script only, to arm the hidden state. */
export const REVEAL_ROOT_CLASS = 'js-reveal';

/** Added per element when it reaches the viewport. */
export const REVEALED_CLASS = 'is-visible';

/** The two things the page animates. Matches what GSAP selected. */
export const REVEAL_SELECTOR = '.animate-section, .animate-item';

/**
 * The plain viewport, and not GSAP's `start: "top 80%"`.
 *
 * Translating that literally means `rootMargin: '0px 0px -20% 0px'`, which
 * shrinks the observer's bottom edge: an element has to climb a fifth of the
 * way up the screen before it counts. The bottom fifth of the LAST screenful
 * never can -- there is nothing left to scroll -- so the FAQ and the closing
 * CTA sat at opacity 0 permanently. Measured: 14 of 31 elements revealed after
 * a full scroll, and the twelve at the end of the page were among the
 * seventeen that did not.
 *
 * A positive margin would trigger early with no dead zone, but there is
 * nothing to gain: the transition is 700ms and starts as the element's first
 * pixel appears.
 */
export const REVEAL_ROOT_MARGIN = '0px';

/** Per-item stagger inside one `.animate-grid`, in ms. GSAP used 0.1s. */
export const STAGGER_STEP_MS = 100;

/** Beyond this the last card in a long row waits noticeably. */
export const STAGGER_MAX_MS = 400;

/**
 * The delay an item gets from its position in its grid.
 *
 * Capped rather than unbounded: a twelve-item grid would otherwise leave its
 * last card blank for 1.2s after the first, which reads as a broken page
 * rather than as a stagger.
 */
export function staggerDelayMs(indexInGroup: number): number {
  if (!Number.isFinite(indexInGroup) || indexInGroup <= 0) return 0;
  return Math.min(Math.round(indexInGroup) * STAGGER_STEP_MS, STAGGER_MAX_MS);
}

/**
 * Whether to animate at all.
 *
 * Reduced motion and a missing IntersectionObserver both mean "show
 * everything now". Neither is a reason to leave copy at opacity 0.
 */
export function shouldReveal(prefersReducedMotion: boolean, hasObserver: boolean): boolean {
  return !prefersReducedMotion && hasObserver;
}

export interface RevealOptions {
  /** Injected in tests. Defaults to the global. */
  observerImpl?: typeof IntersectionObserver;
  prefersReducedMotion?: boolean;
  rootMargin?: string;
}

/**
 * Arm the reveal on a container. Returns a cleanup function.
 *
 * A no-op that still returns a cleanup when animation is off, so the caller
 * has one shape to handle.
 */
export function observeReveal(root: HTMLElement, options: RevealOptions = {}): () => void {
  const Observer = options.observerImpl ?? (typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver);
  const prefersReducedMotion = options.prefersReducedMotion ?? false;

  if (!shouldReveal(prefersReducedMotion, Boolean(Observer)) || !Observer) {
    return () => {};
  }

  const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
  if (targets.length === 0) return () => {};

  // Stagger comes from the element's index among its siblings inside a grid,
  // so it is a style on the element rather than a timeline to keep in sync.
  for (const grid of Array.from(root.querySelectorAll<HTMLElement>('.animate-grid'))) {
    const items = Array.from(grid.querySelectorAll<HTMLElement>('.animate-item'));
    items.forEach((item, index) => {
      item.style.transitionDelay = `${staggerDelayMs(index)}ms`;
    });
  }

  root.classList.add(REVEAL_ROOT_CLASS);

  const pending = new Set<HTMLElement>(targets);

  const reveal = (el: HTMLElement) => {
    if (!pending.has(el)) return;
    pending.delete(el);
    el.classList.add(REVEALED_CLASS);
    observer.unobserve(el);
    // Once revealed, stay revealed. GSAP's grids did the same; only the
    // sections had toggleActions reversing them, and a section that fades back
    // out as you scroll up is motion nobody asked for.
  };

  const observer = new Observer((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) reveal(entry.target as HTMLElement);
    }
  }, { rootMargin: options.rootMargin ?? REVEAL_ROOT_MARGIN, threshold: 0 });

  for (const target of targets) observer.observe(target);

  /**
   * The catch-up sweep, and the reason it is not redundant.
   *
   * IntersectionObserver reports a CHANGE in intersection. Scroll far enough
   * between two frames -- a flick on a phone, a jump-to-anchor, an automated
   * scroll -- and an element goes from below the viewport to above it without
   * ever having intersected, so no callback fires and it stays at opacity 0
   * for good. Measured on the built site: a scroll in 500px steps left ten
   * elements hidden when the browser was busy enough to coalesce two steps
   * into one frame, at a viewport of 720px.
   *
   * So anything whose top edge has reached the viewport is revealed, whether
   * or not the observer noticed. rAF-throttled, and it stops once the last
   * element is revealed.
   */
  let sweepTimer: ReturnType<typeof setTimeout> | null = null;
  const sweep = () => {
    sweepTimer = null;
    const limit = window.innerHeight;
    for (const el of Array.from(pending)) {
      if (el.getBoundingClientRect().top < limit) reveal(el);
    }
    if (pending.size === 0) detachSweep();
  };
  // Leading-edge, then a 100ms cooldown. requestAnimationFrame was the first
  // throttle here and it ran late enough under automation that ten elements
  // were still mid-transition two seconds after the scroll finished -- rAF is
  // not guaranteed a frame on a page nothing is painting.
  const onScroll = () => {
    if (sweepTimer) return;
    sweep();
    sweepTimer = setTimeout(() => { sweepTimer = null; }, 100);
  };
  const detachSweep = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (sweepTimer) clearTimeout(sweepTimer);
    sweepTimer = null;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  return () => {
    detachSweep();
    observer.disconnect();
    root.classList.remove(REVEAL_ROOT_CLASS);
  };
}
