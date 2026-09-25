/**
 * The dashboard's single-key shortcuts, once.
 *
 * Dashboard.tsx binds these and KeyboardShortcutsModal renders them, both from
 * this array. The modal used to carry its own hand-written list next to a
 * QuickActionMenu that bound nothing at all, so "press G for groceries" was
 * documented and did nothing.
 */
export type DashboardShortcutTarget =
  | { kind: "route"; to: string }
  | { kind: "quickLog" }
  | { kind: "help" };

export interface DashboardShortcut {
  /** KeyboardEvent.key, compared case-insensitively. */
  key: string;
  /** What the modal and aria-keyshortcuts show. */
  display: string;
  /** '?' is Shift+/ on the layouts that matter; matchesShortcut is exact. */
  shiftKey?: boolean;
  group: "navigation" | "actions";
  /** i18n key and its English default. */
  labelKey: string;
  label: string;
  target: DashboardShortcutTarget;
}

export const SHORTCUTS: readonly DashboardShortcut[] = Object.freeze([
  {
    key: "t",
    display: "T",
    group: "navigation",
    labelKey: "shell.shortcuts.today",
    label: "Go to today",
    target: { kind: "route", to: "/dashboard" },
  },
  {
    key: "g",
    display: "G",
    group: "navigation",
    labelKey: "shell.shortcuts.grocery",
    label: "Go to the grocery list",
    target: { kind: "route", to: "/dashboard/grocery" },
  },
  {
    key: "s",
    display: "S",
    group: "navigation",
    labelKey: "shell.shortcuts.pantry",
    label: "Go to the pantry",
    target: { kind: "route", to: "/dashboard/pantry" },
  },
  {
    key: "l",
    display: "L",
    group: "actions",
    labelKey: "shell.shortcuts.logMeal",
    label: "Log a meal",
    target: { kind: "quickLog" },
  },
  {
    key: "?",
    display: "?",
    shiftKey: true,
    group: "actions",
    labelKey: "shell.shortcuts.help",
    label: "Show keyboard shortcuts",
    target: { kind: "help" },
  },
]);

/** The aria-keyshortcuts value for a route or action, when one is bound. */
export function shortcutFor(target: DashboardShortcutTarget): string | undefined {
  const hit = SHORTCUTS.find((s) =>
    s.target.kind === "route" && target.kind === "route"
      ? s.target.to === target.to
      : s.target.kind === target.kind && target.kind !== "route"
  );
  return hit?.display;
}
