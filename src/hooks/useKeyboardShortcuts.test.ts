import { describe, it, expect } from "vitest";
import { matchesShortcut, type KeyboardShortcut, type KeyEventLike } from "./useKeyboardShortcuts";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: "n", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over,
});
const sc = (over: Partial<KeyboardShortcut>): KeyboardShortcut => ({
  key: "n", description: "", action: () => {}, ...over,
});

describe("matchesShortcut modifier matching (US-542)", () => {
  it("a plain shortcut does NOT fire while a modifier is held", () => {
    const plainN = sc({ key: "n" });
    expect(matchesShortcut(ev({ key: "n" }), plainN)).toBe(true);
    // The bug: Ctrl+N used to trigger the plain 'n' shortcut.
    expect(matchesShortcut(ev({ key: "n", ctrlKey: true }), plainN)).toBe(false);
    expect(matchesShortcut(ev({ key: "n", metaKey: true }), plainN)).toBe(false);
    expect(matchesShortcut(ev({ key: "n", shiftKey: true }), plainN)).toBe(false);
    expect(matchesShortcut(ev({ key: "n", altKey: true }), plainN)).toBe(false);
  });

  it("ctrlKey:true requires Ctrl exactly and not Meta", () => {
    const ctrlN = sc({ key: "n", ctrlKey: true });
    expect(matchesShortcut(ev({ key: "n", ctrlKey: true }), ctrlN)).toBe(true);
    expect(matchesShortcut(ev({ key: "n", metaKey: true }), ctrlN)).toBe(false);
    expect(matchesShortcut(ev({ key: "n" }), ctrlN)).toBe(false);
  });

  it("ctrlOrMeta fires on either Ctrl or Meta, but not plain", () => {
    const k = sc({ key: "k", ctrlOrMeta: true });
    expect(matchesShortcut(ev({ key: "k", ctrlKey: true }), k)).toBe(true);
    expect(matchesShortcut(ev({ key: "k", metaKey: true }), k)).toBe(true);
    expect(matchesShortcut(ev({ key: "k" }), k)).toBe(false);
  });

  it("shift is matched independently and AND-ed", () => {
    const ctrlShiftP = sc({ key: "p", ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(ev({ key: "p", ctrlKey: true, shiftKey: true }), ctrlShiftP)).toBe(true);
    // Missing shift → no match.
    expect(matchesShortcut(ev({ key: "p", ctrlKey: true }), ctrlShiftP)).toBe(false);
  });

  it("is case-insensitive on the key", () => {
    expect(matchesShortcut(ev({ key: "N" }), sc({ key: "n" }))).toBe(true);
  });
});
