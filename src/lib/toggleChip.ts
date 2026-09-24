/**
 * Shared classes for the tap-to-toggle chips in the log flows (quick log,
 * journal editor): which meal, how much, which result, which quick note.
 *
 * They were each styled inline, at 28-36px tall, which is under the 44px
 * target a parent hits one-handed at the table. min-h-11 is that target; the
 * small variant is for dense rows of suggestions where 36px is the floor.
 * Pair with `toggleChipState(pressed)` and an aria-pressed on the button.
 */
export const TOGGLE_CHIP_CLASS =
  'min-h-11 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50';

export const TOGGLE_CHIP_SMALL_CLASS =
  'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50';

/** Surface for a chip that is on or off. Semantic tokens only. */
export function toggleChipState(pressed: boolean): string {
  return pressed ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70';
}
