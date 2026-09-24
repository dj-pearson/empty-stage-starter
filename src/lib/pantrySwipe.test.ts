import { describe, it, expect } from "vitest";
import { SWIPE_COMMIT_PX, initialPantryView, isHorizontalDrag, swipeIntent, swipeOffset } from "./pantrySwipe";

const both = { canGrocery: true, canUsedUp: true };

describe("swipeIntent", () => {
  it("right is the grocery list, left is used up, once far enough", () => {
    expect(swipeIntent(SWIPE_COMMIT_PX + 1, 4, both)).toBe("grocery");
    expect(swipeIntent(-(SWIPE_COMMIT_PX + 1), 4, both)).toBe("usedUp");
  });

  it("a short drag commits nothing", () => {
    expect(swipeIntent(SWIPE_COMMIT_PX - 1, 0, both)).toBeNull();
  });

  it("a mostly vertical drag is a scroll, not a swipe", () => {
    expect(swipeIntent(120, 100, both)).toBeNull();
    expect(isHorizontalDrag(30, 5)).toBe(true);
    expect(isHorizontalDrag(5, 30)).toBe(false);
  });

  it("does nothing in a direction whose action is unavailable", () => {
    expect(swipeIntent(200, 0, { canGrocery: false, canUsedUp: true })).toBeNull();
    expect(swipeIntent(-200, 0, { canGrocery: true, canUsedUp: false })).toBeNull();
  });
});

describe("swipeOffset", () => {
  it("follows the finger, then resists past the commit point", () => {
    expect(swipeOffset(40, both)).toBe(40);
    expect(swipeOffset(SWIPE_COMMIT_PX + 40, both)).toBe(SWIPE_COMMIT_PX + 10);
    expect(swipeOffset(-40, both)).toBe(-40);
  });

  it("stays put where there is no action", () => {
    expect(swipeOffset(-40, { canGrocery: true, canUsedUp: false })).toBe(0);
  });
});

describe("initialPantryView", () => {
  it("opens a phone in list view and a desktop in grid view", () => {
    expect(initialPantryView(null, true)).toBe("list");
    expect(initialPantryView(undefined, false)).toBe("grid");
  });

  it("keeps a choice the viewer made, on any screen", () => {
    expect(initialPantryView("grid", true)).toBe("grid");
    expect(initialPantryView("list", false)).toBe("list");
  });
});
