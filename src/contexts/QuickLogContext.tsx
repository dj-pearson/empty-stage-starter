import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The one way into the quick-log modal.
 *
 * Dashboard.tsx owns the only QuickLogModal and mounts this provider around
 * the Outlet, so any dashboard page (a "Log it" link on a meal row, the FAB)
 * opens the same dialog against the same today's-meals list rather than
 * keeping a modal and a save path of its own. Pass an entryId to open on that
 * meal; omit it to open on the one nearest the current time.
 */
export interface OpenQuickLogOptions {
  entryId?: string;
}

export interface QuickLogContextValue {
  openQuickLog: (opts?: OpenQuickLogOptions) => void;
}

const QuickLogContext = createContext<QuickLogContextValue | null>(null);

export function QuickLogProvider({
  openQuickLog,
  children,
}: {
  openQuickLog: (opts?: OpenQuickLogOptions) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ openQuickLog }), [openQuickLog]);
  return <QuickLogContext.Provider value={value}>{children}</QuickLogContext.Provider>;
}

const noop: QuickLogContextValue = { openQuickLog: () => {} };

/**
 * Outside the dashboard shell there is no modal to open. That returns a no-op
 * rather than throwing, so a card rendered in a test or a storybook-style
 * harness does not need the whole shell around it.
 */
export function useQuickLog(): QuickLogContextValue {
  return useContext(QuickLogContext) ?? noop;
}
