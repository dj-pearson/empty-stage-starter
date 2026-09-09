/**
 * The breakpoints, once, in the units the CSS actually uses.
 *
 * WHY THIS EXISTS. Three different answers to "is this mobile?" shipped at the
 * same time, and the documented one disagreed with the stylesheet:
 *
 *   useMediaQuery.ts  useIsMobile   (max-width: 768px)    mobile AT 768
 *   use-mobile.tsx    useIsMobile   width < 768           desktop AT 768
 *   Tailwind          md:           (min-width: 768px)    desktop AT 768
 *
 * 768px is iPad portrait. At exactly that width the hook exported from
 * '@/hooks' -- the one CLAUDE.md's hook list points at -- said mobile while
 * every `md:` class on the page had already switched to the desktop layout. The
 * same off-by-one sat in useIsDesktop (min-width: 1025px against Tailwind's
 * lg: at 1024px), so 1024px-wide windows were desktop to the CSS and not-desktop
 * to the hook.
 *
 * Nothing imported the broken hooks yet, which is the only reason this was not
 * a live bug -- and exactly why it was worth fixing before something did.
 *
 * These are Tailwind's stock values. The project does not override
 * `theme.screens`; tailwind.config.ts sets `container.screens['2xl']` to
 * 1400px, which applies to the `container` class only and NOT to the `2xl:`
 * variant. src/lib/breakpoints.test.ts asserts all of that against the resolved
 * Tailwind config, so this file cannot drift from the stylesheet in silence.
 */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * `(min-width: Npx)` -- the same boundary as Tailwind's `<bp>:` prefix, so a
 * hook and a class name flip on the same pixel.
 */
export function atLeast(bp: Breakpoint): string {
  return `(min-width: ${BREAKPOINTS[bp]}px)`;
}

/**
 * Everything below a breakpoint: the exact complement of `atLeast`.
 *
 * The 0.02px step is not decoration. `max-width: 767px` and `min-width: 768px`
 * leave a hole for the fractional viewport widths a browser really reports
 * under page zoom or on a scaled display, where BOTH queries are false and a
 * layout keyed off the pair renders neither branch.
 */
export function below(bp: Breakpoint): string {
  return `(max-width: ${BREAKPOINTS[bp] - 0.02}px)`;
}

/** Between two breakpoints, inclusive of the lower and exclusive of the upper. */
export function between(lower: Breakpoint, upper: Breakpoint): string {
  return `${atLeast(lower)} and ${below(upper)}`;
}
