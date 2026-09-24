import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { CalendarPlus, ClipboardList, Plus, ShoppingCart, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { shortcutFor } from "@/lib/dashboardShortcuts";

/**
 * The dashboard's floating action button (P2).
 *
 * Replaces ui/QuickActionMenu, whose four actions were fixed: "Log Meal
 * Result" with nothing planned, "Today's Plan" linking to the page it sat on,
 * and "Suggest Foods" going to the pantry. These are chosen from state instead:
 * a brand-new account gets one action, adding a child, because nothing else on
 * the dashboard works until that exists.
 *
 * Mobile sits above the bottom nav (h-16 plus the safe-area inset) with a 1rem
 * gap; desktop takes the corner the support button used to share.
 */

export const FAB_POSITION_CLASSES =
  "bottom-[calc(4rem+max(1rem,env(safe-area-inset-bottom))+1rem)] right-4 md:bottom-6 md:right-6";

export interface QuickActionsFabProps {
  kidCount: number;
  /** True when today has at least one planned meal with no result yet. */
  hasUnloggedToday: boolean;
  onLogMeal: () => void;
  /**
   * Label for the primary log item. A page that registered its own action
   * (Food Tracker: "Log a tasting") passes it; the default is "Log a meal".
   */
  logLabel?: string;
  /** Local YYYY-MM-DD, for the "Plan tonight" link. */
  todayKey: string;
}

interface FabAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route to open; undefined for an action that is not a navigation. */
  to?: string;
  onSelect: () => void;
  shortcut?: string;
}

function QuickActionsFabImpl({ kidCount, hasUnloggedToday, onLogMeal, logLabel, todayKey }: QuickActionsFabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const actions = useMemo<FabAction[]>(() => {
    const go = (to: string) => () => navigate(to);
    const all: FabAction[] =
      kidCount === 0
        ? [
            {
              id: "add-kid",
              label: t("shell.fab.addFirstChild", { defaultValue: "Add your first child" }),
              icon: UserPlus,
              to: "/dashboard/kids?new=1",
              onSelect: go("/dashboard/kids?new=1"),
            },
          ]
        : [
            ...(hasUnloggedToday
              ? [
                  {
                    id: "log",
                    label: logLabel ?? t("shell.fab.logMeal", { defaultValue: "Log a meal" }),
                    icon: ClipboardList,
                    onSelect: onLogMeal,
                    shortcut: shortcutFor({ kind: "quickLog" }),
                  },
                ]
              : []),
            {
              id: "plan",
              label: t("shell.fab.planTonight", { defaultValue: "Plan tonight" }),
              icon: CalendarPlus,
              to: `/dashboard/planner?date=${todayKey}&slot=dinner`,
              onSelect: go(`/dashboard/planner?date=${todayKey}&slot=dinner`),
            },
            {
              id: "grocery",
              label: t("shell.fab.grocery", { defaultValue: "Grocery list" }),
              icon: ShoppingCart,
              to: "/dashboard/grocery",
              onSelect: go("/dashboard/grocery"),
              shortcut: shortcutFor({ kind: "route", to: "/dashboard/grocery" }),
            },
          ];

    // The action for the page you are on is a link to itself; drop it.
    const here = pathname.replace(/\/+$/, "") || "/";
    return all.filter((a) => !a.to || a.to.split("?")[0] !== here);
  }, [kidCount, hasUnloggedToday, onLogMeal, logLabel, todayKey, pathname, navigate, t]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) fabRef.current?.focus();
  }, []);

  // Focus the first action on open.
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  // Escape anywhere, and a press outside the menu, close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent | MouseEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        // Focus stays where the user clicked; pulling it back to the FAB
        // would undo the click.
        close(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  if (actions.length === 0) return null;

  const fabLabel = open
    ? t("shell.fab.close", { defaultValue: "Close quick actions" })
    : t("shell.fab.open", { defaultValue: "Quick actions" });

  return (
    <div ref={rootRef} className={cn("fixed z-40 flex flex-col items-end", FAB_POSITION_CLASSES)}>
      <div
        id={menuId}
        role="group"
        aria-label={t("shell.fab.menuLabel", { defaultValue: "Quick actions" })}
        hidden={!open}
        className="mb-3 flex flex-col items-end gap-2"
      >
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <div key={action.id} className="group flex items-center justify-end gap-2">
              <span
                aria-hidden="true"
                className="pointer-events-none rounded-md bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-md motion-safe:transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                {action.label}
                {action.shortcut && (
                  <kbd className="ml-2 hidden rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground md:inline">
                    {action.shortcut}
                  </kbd>
                )}
              </span>
              <Button
                ref={index === 0 ? firstItemRef : undefined}
                type="button"
                size="icon"
                variant="secondary"
                aria-label={action.label}
                aria-keyshortcuts={action.shortcut}
                className="h-12 w-12 rounded-full shadow-md"
                onClick={() => {
                  close(true);
                  action.onSelect();
                }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        ref={fabRef}
        type="button"
        size="icon"
        aria-label={fabLabel}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="h-14 w-14 rounded-full shadow-lg"
      >
        <Plus
          aria-hidden="true"
          className={cn(
            "h-6 w-6",
            !reducedMotion && "transition-transform duration-200",
            !reducedMotion && open && "rotate-45"
          )}
        />
      </Button>
    </div>
  );
}

export const QuickActionsFab = memo(QuickActionsFabImpl);
