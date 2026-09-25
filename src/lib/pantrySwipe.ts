/**
 * Item 21: the pantry list's swipe gestures and phone default, as pure rules.
 *
 *   swipe right  add to the grocery list (merge, with Undo)
 *   swipe left   used up (a correction to zero, with Undo)
 *
 * Every swipe has a visible button doing the same thing, so the gesture is a
 * shortcut and never the only way in (WCAG 2.5.1).
 */
import type { ViewMode } from "@/components/pantry/pantryConstants";

/** How far a finger has to travel before a release commits the action. */
export const SWIPE_COMMIT_PX = 88;
/** Movement below this is a tap or a wobble, not a drag. */
export const SWIPE_SLOP_PX = 10;

export type SwipeIntent = "grocery" | "usedUp";

export interface SwipeAbilities {
  canGrocery: boolean;
  canUsedUp: boolean;
}

/**
 * True once a drag is clearly sideways. A vertical-ish drag is the page
 * scrolling and must be left alone.
 */
export function isHorizontalDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_SLOP_PX && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/** Which action a drag of (dx, dy) points at, whether or not it has gone far enough. */
export function swipeDirection(dx: number, abilities: SwipeAbilities): SwipeIntent | null {
  if (dx > 0 && abilities.canGrocery) return "grocery";
  if (dx < 0 && abilities.canUsedUp) return "usedUp";
  return null;
}

/** The action a released drag commits, or null. */
export function swipeIntent(dx: number, dy: number, abilities: SwipeAbilities): SwipeIntent | null {
  if (!isHorizontalDrag(dx, dy) || Math.abs(dx) < SWIPE_COMMIT_PX) return null;
  return swipeDirection(dx, abilities);
}

/**
 * How far the row follows the finger: all the way up to the commit distance,
 * then with resistance, and not at all in a direction with no action.
 */
export function swipeOffset(dx: number, abilities: SwipeAbilities): number {
  if (!swipeDirection(dx, abilities)) return 0;
  const sign = Math.sign(dx);
  const abs = Math.abs(dx);
  return sign * (abs <= SWIPE_COMMIT_PX ? abs : SWIPE_COMMIT_PX + (abs - SWIPE_COMMIT_PX) * 0.25);
}

/**
 * The view a viewer lands on. A choice they made is kept on every device
 * size; with none, a phone gets the list (rows are what fit a phone and what
 * the swipes live on) and a larger screen the grid.
 */
export function initialPantryView(stored: ViewMode | null | undefined, isMobile: boolean): ViewMode {
  if (stored === "grid" || stored === "list") return stored;
  return isMobile ? "list" : "grid";
}
