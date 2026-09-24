import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The one way into the quick-log modal.
 *
 * Dashboard.tsx owns the only QuickLogModal and mounts this provider around
 * the Outlet, so any dashboard page (a "Log it" link on a meal row, the FAB)
 * opens the same dialog against the same today's-meals list rather than
 * keeping a modal and a save path of its own. Pass an entryId to open on that
 * meal; omit it to open on the one nearest the current time.
 *
 * A page can also take over the FAB's primary action while it is mounted
 * (registerPageAction): Food Tracker turns "Log a meal" into "Log a tasting",
 * which logs against the ladder instead of a plan entry. Unmounting the page
 * hands the FAB back.
 */
export interface OpenQuickLogOptions {
  entryId?: string;
}

export interface PageAction {
  label: string;
  run: () => void;
}

export interface QuickLogContextValue {
  openQuickLog: (opts?: OpenQuickLogOptions) => void;
  /** The current page's primary action, or null when the page has none. */
  pageAction: PageAction | null;
  /**
   * Make `action` the FAB's primary item. Returns the unregister function; it
   * clears only this registration, so a stale cleanup cannot remove a newer
   * page's action.
   */
  registerPageAction: (action: PageAction) => () => void;
}

const QuickLogContext = createContext<QuickLogContextValue | null>(null);

export function QuickLogProvider({
  openQuickLog,
  pageAction: controlledAction,
  onPageActionChange,
  children,
}: {
  openQuickLog: (opts?: OpenQuickLogOptions) => void;
  /**
   * Controlled mode: the shell renders the FAB outside this provider, so it
   * holds the state and passes it in. Omit both to let the provider hold it.
   */
  pageAction?: PageAction | null;
  onPageActionChange?: (action: PageAction | null) => void;
  children: ReactNode;
}) {
  const [ownAction, setOwnAction] = useState<PageAction | null>(null);
  const controlled = onPageActionChange !== undefined;
  const pageAction = controlled ? controlledAction ?? null : ownAction;

  const changeRef = useRef(onPageActionChange);
  changeRef.current = onPageActionChange;
  const current = useRef<PageAction | null>(null);

  const publish = useCallback((next: PageAction | null) => {
    current.current = next;
    if (changeRef.current) changeRef.current(next);
    else setOwnAction(next);
  }, []);

  const registerPageAction = useCallback(
    (action: PageAction) => {
      publish(action);
      return () => {
        if (current.current === action) publish(null);
      };
    },
    [publish]
  );

  const value = useMemo(
    () => ({ openQuickLog, pageAction, registerPageAction }),
    [openQuickLog, pageAction, registerPageAction]
  );
  return <QuickLogContext.Provider value={value}>{children}</QuickLogContext.Provider>;
}

const noop: QuickLogContextValue = {
  openQuickLog: () => {},
  pageAction: null,
  registerPageAction: () => () => {},
};

/**
 * Outside the dashboard shell there is no modal to open. That returns a no-op
 * rather than throwing, so a card rendered in a test or a storybook-style
 * harness does not need the whole shell around it.
 */
export function useQuickLog(): QuickLogContextValue {
  return useContext(QuickLogContext) ?? noop;
}
