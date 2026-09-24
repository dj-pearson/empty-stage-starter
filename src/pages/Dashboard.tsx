import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Outlet, useSearchParams, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { supabase } from "@/integrations/supabase/client";
import { useFoods, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { QuickLogProvider, type OpenQuickLogOptions } from "@/contexts/QuickLogContext";
import { fetchOnboardingCompleted, readLocalOnboardingFlag } from "@/lib/onboardingStatus";
import { SupportWidget } from "@/components/SupportWidget";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KidSelector } from "@/components/KidSelector";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { QuickLogModal } from "@/components/QuickLogModal";
import {
  buildQuickLogMeals,
  buildUndoPatch,
  performQuickLog,
  type QuickLogPlanMeal,
  type QuickLogResult,
} from "@/lib/quickLog";
import { toISODate } from "@/lib/date-utils";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun, LogOut, LifeBuoy, Search, Sparkles, MoreHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useWhiteLabelTheme } from "@/hooks/useWhiteLabelTheme";
import { useKeyboardShortcuts, isMac, type KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";
import { BindEmailBanner } from "@/components/auth/BindEmailBanner";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { userFacingError } from "@/lib/networkFailure";
import { SHORTCUTS } from "@/lib/dashboardShortcuts";
import type { AmountEaten, MealSlot, PlanEntry } from "@/types";
import { useNavEntitlements } from "@/hooks/useNavEntitlements";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  isIndexRoute,
  primaryNavItems,
  secondaryNavItemsInGroup,
} from "@/lib/navigation";

/**
 * Whether the dashboard may render its page yet (US-770).
 *
 * 'pass' when the cached flag already says onboarding is done, so a returning
 * parent never waits on a round trip. 'checking' otherwise: the header and nav
 * render, the page slot shows a skeleton, and the server column (the one iOS
 * US-708 writes) decides. 'redirect' is the moment between that answer and
 * /onboarding mounting, when rendering the page would flash it.
 */
export type OnboardingGate = "pass" | "checking" | "redirect";

/** What the page slot shows while the gate is still asking the server. */
function OutletSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

const Dashboard = () => {
  const { t } = useTranslation();
  // US-865: which shell mounts, so only one <Outlet/> exists at a time.
  const isMobile = useIsMobile();
  const { userId } = useAuth();
  // One call for both shells; AppSidebar gets the answer as a prop.
  const entitlements = useNavEntitlements();
  const { kids, activeKidId } = useKids();
  const { planEntries, updatePlanEntry } = usePlan();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { preferences } = useAccessibility();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogDefaultId, setQuickLogDefaultId] = useState<string | undefined>(undefined);
  const [supportOpen, setSupportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [gate, setGate] = useState<OnboardingGate>(() =>
    readLocalOnboardingFlag() === true ? "pass" : "checking"
  );
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Apply white-label theme for Professional subscribers
  useWhiteLabelTheme();

  // Handle checkout=success query param (fallback for legacy redirect)
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast(t("shell.checkout.title", { defaultValue: "Subscription activated" }), {
        description: t("shell.checkout.body", { defaultValue: "Your plan is active now." }),
      });
      // Clean up the query param
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  /**
   * Send a user who never finished setup to /onboarding (US-770).
   *
   * Onboarding used to fire as a dialog from Auth.tsx, so somebody who closed
   * it, or who arrived at /dashboard by any route other than a fresh sign-in,
   * simply never saw it again. The cached flag is checked first (the gate's
   * initial state) so a returning user does not wait on a round trip; the
   * server column is the authority and seeds the cache.
   *
   * While the answer is outstanding the page slot shows a skeleton, not the
   * page: rendering Home for a first-run account and then yanking it away to
   * /onboarding was a flash of a dashboard with nothing in it.
   */
  useEffect(() => {
    if (gate !== "checking" || !userId) return;
    let cancelled = false;

    void fetchOnboardingCompleted(userId).then((done) => {
      if (cancelled) return;
      if (done === false) {
        setGate("redirect");
        navigate("/onboarding", { replace: true });
        return;
      }
      // null means we could not tell (a failed read). Not knowing is not a
      // reason to keep somebody out of their dashboard.
      setGate("pass");
    });

    return () => {
      cancelled = true;
    };
  }, [gate, userId, navigate]);

  const handleLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Still signed in; staying here is the truth. Navigating to / would
        // show the landing page to somebody whose session is still live.
        toast.error(t("shell.signOutFailed", { defaultValue: "Couldn't sign you out" }), {
          description: userFacingError(error, t("shell.tryAgain", { defaultValue: "Please try again." })),
        });
        return;
      }
      toast(t("shell.signedOut", { defaultValue: "Signed out" }));
      navigate("/");
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, navigate, t]);

  const toggleTheme = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark, setTheme]);

  const slotLabel = useCallback(
    (slot: MealSlot) => t(`mealSlots.${slot}`, { defaultValue: slot.replace("_", " ") }),
    [t]
  );

  /**
   * Today's plan entries, labelled for the picker (US-812). In Family mode
   * that is every kid's, named by kid; it used to be an empty list, so the
   * quick log said "nothing planned" to exactly the parents planning for
   * everyone. Already-logged meals stay in the list so a mistaken tap can be
   * corrected without going to the planner. Built in src/lib/quickLog.ts.
   */
  // US-818: the LOCAL calendar day. toISOString() converts to UTC first, so
  // west of Greenwich this flipped to tomorrow in the evening and the
  // dashboard started showing tomorrow's meals -- and the quick-log FAB
  // logged results against them.
  const today = toISODate(new Date());
  const todaysMeals = useMemo(
    () => buildQuickLogMeals(planEntries, kids, foods, recipes, activeKidId, today, new Date(), slotLabel),
    [planEntries, kids, foods, recipes, activeKidId, today, slotLabel]
  );
  const hasUnloggedToday = useMemo(() => todaysMeals.some((m) => !m.result), [todaysMeals]);

  const openQuickLog = useCallback(
    (opts?: OpenQuickLogOptions) => {
      if (todaysMeals.length === 0) {
        toast(t("quickLog.nothingPlanned", { defaultValue: "Nothing is planned for today yet" }), {
          action: {
            label: t("quickLog.openPlanner", { defaultValue: "Plan a meal" }),
            onClick: () => navigate(`/dashboard/planner?date=${today}&slot=dinner`),
          },
        });
        return;
      }
      // The time-of-day pick is made now, not when the list was built: a tab
      // left open since lunch should open on dinner.
      const fresh = buildQuickLogMeals(planEntries, kids, foods, recipes, activeKidId, today, new Date(), slotLabel);
      const requested = opts?.entryId && fresh.some((m) => m.id === opts.entryId) ? opts.entryId : undefined;
      setQuickLogDefaultId(requested ?? fresh.find((m) => m.preselected)?.id);
      setQuickLogOpen(true);
    },
    [todaysMeals, planEntries, kids, foods, recipes, activeKidId, today, slotLabel, navigate, t]
  );

  const openQuickLogFromFab = useCallback(() => openQuickLog(), [openQuickLog]);

  /**
   * Log a result against a real plan entry (US-812), and say whether it landed.
   *
   * The modal closes only on true. A failed write keeps it open with the note
   * the parent typed, rather than closing on a result that never saved.
   */
  const handleQuickLog = async (
    result: QuickLogResult,
    notes?: string,
    mealId?: string,
    amount?: AmountEaten
  ): Promise<boolean> => {
    const before: QuickLogPlanMeal | undefined = mealId
      ? todaysMeals.find((m) => m.id === mealId)
      : todaysMeals[0];

    // Which entry, and whether the write landed, are decided in
    // src/lib/quickLog.ts so both can be tested without mounting this page.
    const outcome = await performQuickLog({
      meals: todaysMeals,
      result,
      notes,
      mealId,
      amount,
      save: (entryId, patch) => updatePlanEntry(entryId, patch),
    });

    switch (outcome.status) {
      case "saved": {
        // Undo puts back only what the log wrote, from the row as it was, and
        // says so when it did not land: a silent failed undo leaves the parent
        // believing a wrong result is gone.
        const undoPatch = before ? buildUndoPatch(before, { ...outcome.patch }) : undefined;
        const undo =
          before && undoPatch
            ? {
                label: t("quickLog.undo", { defaultValue: "Undo" }),
                onClick: async () => {
                  let failed: unknown = null;
                  try {
                    // notes may be null here (no note before), which the
                    // column takes; PlanEntry types it as string | undefined.
                    const res = await updatePlanEntry(before.id, undoPatch as Partial<PlanEntry>);
                    failed = res?.error ?? null;
                  } catch (error) {
                    failed = error;
                  }
                  if (failed) {
                    toast.error(
                      t("quickLog.undoFailed", {
                        defaultValue: "Couldn't undo that. Check the meal in the planner.",
                      })
                    );
                  }
                },
              }
            : undefined;
        toast.success(
          t("quickLog.logged", {
            defaultValue: "Logged: {{result}}",
            result: t(`quickLog.result.${result}`),
          }),
          { description: outcome.entry.label, action: undo }
        );
        return outcome.status === "saved";
      }
      case "nothing-planned":
        toast.error(t("quickLog.nothingPlanned", { defaultValue: "Nothing is planned for today yet" }));
        return false;
      case "unknown-meal":
        // The modal named an entry that has since gone. Logging against
        // whichever meal happened to be first would be the wrong dinner.
        toast.error(t("quickLog.mealGone", { defaultValue: "That meal is no longer on today's plan" }));
        return false;
      case "failed":
        // updatePlanEntry rolls the row back and toasts the rejection itself
        // (runOptimisticMutation), so a second toast here would be the same
        // failure reported twice. The modal shows its own inline message.
        return false;
    }
  };

  const shortcuts = useMemo<KeyboardShortcut[]>(
    () =>
      SHORTCUTS.flatMap((s) => {
        const action = () => {
          if (s.target.kind === "route") navigate(s.target.to);
          else if (s.target.kind === "quickLog") openQuickLog();
          else setShortcutsOpen(true);
        };
        const bound: KeyboardShortcut = { key: s.key, shiftKey: s.shiftKey, description: s.label, action };
        // matchesShortcut compares Shift exactly. '?' needs Shift on a US
        // layout and not on every other one, so it is bound both ways.
        return s.shiftKey ? [bound, { ...bound, shiftKey: false }] : [bound];
      }),
    [navigate, openQuickLog]
  );
  useKeyboardShortcuts({ shortcuts, enabled: preferences.keyboardShortcuts });

  const page =
    gate === "pass" ? (
      <QuickLogProvider openQuickLog={openQuickLog}>
        <Outlet />
      </QuickLogProvider>
    ) : (
      <OutletSkeleton label={t("shell.loading", { defaultValue: "Loading your dashboard" })} />
    );

  const lightLabel = t("shell.lightMode", { defaultValue: "Light Mode" });
  const darkLabel = t("shell.darkMode", { defaultValue: "Dark Mode" });

  return (
    <>
      <Helmet>
        <title>{t("shell.meta.title", { defaultValue: "Dashboard - EatPal" })}</title>
        <meta
          name="description"
          content={t("shell.meta.description", {
            defaultValue: "Manage your family's meal plans, food tracking, and nutrition insights",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/*
        Offline banner (US-765). Mounted once outside the desktop/mobile split
        because it positions itself fixed and both layouts need it; it renders
        null while online.
      */}
      <OfflineIndicator />
      {/*
        US-865: ONE SHELL AT A TIME.
        These two blocks each contained their own <main> and their own <Outlet/>,
        and both were mounted -- the CSS only hid one. So every dashboard page
        ran TWICE: two React trees with their own state, two of every query and
        every realtime subscription, two role="main" landmarks with the same
        label, and two h1 elements.
        Choosing with useIsMobile rather than CSS is why src/hooks/use-mobile.tsx
        now answers on the first render: a wrong first answer would mount the
        wrong shell, throw it away, and mount the other -- reintroducing the
        double mount it is here to remove.
      */}
      {isMobile ? (
        <div className="min-h-screen bg-background">
          {/* Mobile top header */}
          <header className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
            <div className="flex justify-between items-center h-14 px-4">
              <div className="flex items-center gap-2">
                <img
                  src="/Logo-Green.webp"
                  alt="EatPal"
                  className="h-7 block dark:hidden"
                />
                <img
                  src="/Logo-White.webp"
                  alt="EatPal"
                  className="h-7 hidden dark:block"
                />
              </div>

              {/*
                The hamburger is gone (US-815). What only lived there -- the kid
                selector, theme and sign out -- moved: the selector to this
                header, the other two into More.
              */}
              <div className="min-w-0 max-w-[60%]">
                <KidSelector />
              </div>
            </div>
          </header>

          {/*
            US-865: id="main-content", the same as the desktop shell, so the
            skip link has a target on a phone.
            The bottom padding is the nav's height, its safe-area inset and a
            1rem gap: the same sum the FAB sits at, so the last row of a page
            is never under the bar.
          */}
          <main
            id="main-content"
            className="pt-14 pb-[calc(4rem+max(1rem,env(safe-area-inset-bottom))+1rem)]"
            role="main"
            aria-label={t("shell.mainLabel", { defaultValue: "Dashboard content" })}
          >
            <BindEmailBanner />
            {page}
          </main>

          {/* Mobile Bottom Navigation */}
          <nav
            className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-bottom"
            aria-label={t("shell.primaryNav", { defaultValue: "Primary" })}
          >
            <div className="flex justify-around items-center h-16">
              {primaryNavItems(entitlements).map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={isIndexRoute(to)}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors motion-safe:active:scale-95 min-w-[64px]",
                      isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    )
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs leading-tight text-center">{label}</span>
                </NavLink>
              ))}

              {/* More Menu Button */}
              <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    className={cn(
                      "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors motion-safe:active:scale-95 min-w-[64px]",
                      "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label={t("shell.more.label", { defaultValue: "More navigation options" })}
                  >
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[11px] sm:text-xs leading-tight text-center">
                      {t("shell.more.short", { defaultValue: "More" })}
                    </span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[75vh] flex flex-col rounded-t-xl">
                  <SheetHeader className="pb-4 border-b">
                    <SheetTitle className="flex items-center gap-2 text-lg">
                      <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                      <span className="font-heading font-bold text-primary">
                        {t("shell.more.title", { defaultValue: "More" })}
                      </span>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto py-4">
                    {/*
                      The complement of the bottom bar, so a destination can never
                      be missing from both (US-811), grouped into the same
                      sections as the desktop sidebar (US-815).
                    */}
                    {NAV_GROUP_ORDER.map((group) => {
                      const items = secondaryNavItemsInGroup(group, entitlements);
                      if (items.length === 0) return null;

                      return (
                        <section key={group} className="mb-6">
                          <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                            {NAV_GROUP_LABELS[group]}
                          </h3>
                          <div className="grid grid-cols-2 gap-3">
                            {items.map(({ to, icon: Icon, label }) => (
                              <NavLink
                                key={to}
                                to={to}
                                onClick={() => setMoreMenuOpen(false)}
                                className={({ isActive }) =>
                                  cn(
                                    "flex flex-col items-center gap-3 p-4 rounded-xl border transition-colors motion-safe:active:scale-95",
                                    isActive
                                      ? "bg-primary/10 border-primary text-primary font-medium"
                                      : "border-border hover:border-primary/50 hover:bg-muted"
                                  )
                                }
                              >
                                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                                  <Icon className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <span className="text-sm text-center leading-tight">{label}</span>
                              </NavLink>
                            ))}
                          </div>
                        </section>
                      );
                    })}

                    {/*
                      Help, theme and sign out (US-815). Help lives here rather
                      than as a second floating button, which sat on the FAB.
                    */}
                    <div className="mt-6 pt-6 border-t space-y-2 pb-safe">
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full justify-start gap-3 h-12"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setSupportOpen(true);
                        }}
                      >
                        <LifeBuoy className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="text-base">{t("support.open", { defaultValue: "Help & support" })}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full justify-start gap-3 h-12"
                        onClick={() => {
                          toggleTheme();
                          setMoreMenuOpen(false);
                        }}
                      >
                        {isDark ? (
                          <Sun className="h-5 w-5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Moon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-base">{isDark ? lightLabel : darkLabel}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive"
                        disabled={signingOut}
                        onClick={async () => {
                          await handleLogout();
                          setMoreMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="text-base">{t("shell.signOut", { defaultValue: "Sign Out" })}</span>
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </nav>
        </div>
      ) : (
        <div>
          <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full">
              <AppSidebar entitlements={entitlements} />

              <div className="flex-1 flex flex-col">
                {/* Top Header */}
                <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4">
                  <SidebarTrigger />

                  <div className="flex-1" />

                  <KidSelector />

                  {/*
                    Opens the command palette, which searches pages and
                    actions. It was labelled "Quick Actions", which is also
                    what the FAB is called, for a control that does neither.
                  */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:flex items-center gap-2 text-xs"
                    aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}
                    onClick={() => {
                      const event = new KeyboardEvent("keydown", {
                        key: "k",
                        metaKey: true,
                        ctrlKey: true,
                        bubbles: true,
                      });
                      document.dispatchEvent(event);
                    }}
                  >
                    <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-muted-foreground">{t("shell.search", { defaultValue: "Search" })}</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      <span className="text-xs">{isMac() ? "\u2318" : "Ctrl"}</span>K
                    </kbd>
                  </Button>

                  <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSupportOpen(true)}
                    aria-label={t("support.open", { defaultValue: "Help & support" })}
                    className="touch-target"
                  >
                    <LifeBuoy className="h-5 w-5" aria-hidden="true" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="touch-target"
                    aria-label={isDark ? lightLabel : darkLabel}
                  >
                    {isDark ? (
                      <Sun className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Moon className="h-5 w-5" aria-hidden="true" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleLogout()}
                    disabled={signingOut}
                    aria-label={t("shell.signOut", { defaultValue: "Sign Out" })}
                    className="touch-target"
                  >
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </header>

                <main
                  id="main-content"
                  className="flex-1 overflow-auto"
                  role="main"
                  aria-label={t("shell.mainLabel", { defaultValue: "Dashboard content" })}
                >
                  <BindEmailBanner />
                  {page}
                </main>
              </div>
            </div>
          </SidebarProvider>
        </div>
      )}

      {gate === "pass" && (
        <QuickActionsFab
          kidCount={kids.length}
          hasUnloggedToday={hasUnloggedToday}
          onLogMeal={openQuickLogFromFab}
          todayKey={today}
        />
      )}

      {/* The only quick-log dialog; pages open it through useQuickLog(). */}
      <QuickLogModal
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        meals={todaysMeals}
        defaultMealId={quickLogDefaultId}
        onLog={handleQuickLog}
      />

      <SupportWidget open={supportOpen} onOpenChange={setSupportOpen} hideTrigger />
    </>
  );
};

export default Dashboard;
