import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /**
   * "Ctrl-or-Cmd" accelerator: fire when EITHER Ctrl or Meta is held (the
   * platform-appropriate modifier). Use this instead of setting both ctrlKey
   * and metaKey. When set, ctrlKey/metaKey are ignored (US-542).
   */
  ctrlOrMeta?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/** Minimal shape of a keyboard event for matching (testable without the DOM). */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Match a key event against a shortcut (US-542).
 *
 * Each modifier is compared independently against its expected boolean and the
 * results are AND-ed, so a plain `n` shortcut does NOT fire while Ctrl is held.
 * Ctrl and Meta are only treated interchangeably when the shortcut opts in via
 * `ctrlOrMeta` (fires when either is held); otherwise each must match exactly.
 */
export function matchesShortcut(event: KeyEventLike, shortcut: KeyboardShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  if (!!shortcut.shiftKey !== event.shiftKey) return false;
  if (!!shortcut.altKey !== event.altKey) return false;

  if (shortcut.ctrlOrMeta) {
    // Exactly the platform accelerator: one of Ctrl/Meta must be held.
    return event.ctrlKey || event.metaKey;
  }
  if (!!shortcut.ctrlKey !== event.ctrlKey) return false;
  if (!!shortcut.metaKey !== event.metaKey) return false;
  return true;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when user is typing in an input
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Cmd/Ctrl+K for command palette even in inputs
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          // Let it pass through
        } else {
          return;
        }
      }

      for (const shortcut of shortcutsRef.current) {
        if (matchesShortcut(event, shortcut)) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.action();
          break;
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Helper function to format shortcut for display
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.ctrlOrMeta) parts.push(isMac() ? "⌘" : "Ctrl");
  else {
    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.metaKey) parts.push("⌘");
  }
  if (shortcut.shiftKey) parts.push("⇧");
  if (shortcut.altKey) parts.push("Alt");
  parts.push(shortcut.key.toUpperCase());

  return parts.join("+");
}

// Check if user is on Mac
export function isMac(): boolean {
  return typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}
