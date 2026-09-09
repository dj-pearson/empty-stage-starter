import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Outlet, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { fetchOnboardingCompleted, readLocalOnboardingFlag } from "@/lib/onboardingStatus";
import { SupportWidget } from "@/components/SupportWidget";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KidSelector } from "@/components/KidSelector";
import { QuickActionMenu } from "@/components/ui/QuickActionMenu";
import { QuickLogModal } from "@/components/QuickLogModal";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useWhiteLabelTheme } from "@/hooks/useWhiteLabelTheme";
import { BindEmailBanner } from "@/components/auth/BindEmailBanner";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import {
  Calendar,
  ShoppingCart,
  Sparkles,
  MoreHorizontal,
  ClipboardList,
} from "lucide-react";
import { useNavEntitlements } from "@/hooks/useNavEntitlements";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  isIndexRoute,
  primaryNavItems,
  secondaryNavItemsInGroup,
} from "@/lib/navigation";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const entitlements = useNavEntitlements();
  const { planEntries, foods, activeKidId, updatePlanEntry } = useApp();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  // Apply white-label theme for Professional subscribers
  useWhiteLabelTheme();

  // Handle checkout=success query param (fallback for legacy redirect)
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast("🎉 Subscription activated!", { description: "Your plan is now active. Enjoy your premium features!" });
      // Clean up the query param
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  /**
   * Send a user who never finished setup to /onboarding (US-770).
   *
   * Onboarding used to fire as a dialog from Auth.tsx, so somebody who closed
   * it, or who arrived at /dashboard by any route other than a fresh sign-in,
   * simply never saw it again. The cached flag is checked first so a returning
   * user does not wait on a round trip before the dashboard renders; the server
   * column -- the same one iOS US-708 writes -- is the authority and seeds the
   * cache.
   */
  useEffect(() => {
    let cancelled = false;

    if (readLocalOnboardingFlag() === true) return;

    void fetchOnboardingCompleted().then((done) => {
      // null means we could not tell (signed out mid-flight, a failed read).
      // Not knowing is not a reason to interrupt somebody's dashboard.
      if (!cancelled && done === false) {
        navigate("/onboarding", { replace: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    // Set up listener for auth state changes
    // Auth protection is handled by ProtectedRoute wrapper
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session ? session.user : null);
    });

    // Get current session for initial render
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast("Signed out", { description: "You have been signed out successfully." });
    navigate("/");
  };

  /**
   * Today's plan entries for the active child, labelled for the picker
   * (US-812). Already-logged meals stay in the list so a mistaken tap can be
   * corrected without going to the planner.
   */
  const todaysMeals = useMemo(() => {
    if (!activeKidId) return [];
    const today = new Date().toISOString().split("T")[0];

    return planEntries
      .filter((entry) => entry.kid_id === activeKidId && entry.date === today)
      .map((entry) => {
        const food = foods.find((f) => f.id === entry.food_id);
        const slot = entry.meal_slot.replace("_", " ");
        return {
          id: entry.id,
          notes: entry.notes,
          label: food ? `${slot} - ${food.name}` : slot,
        };
      });
  }, [planEntries, foods, activeKidId]);

  const quickActions = [
    {
      icon: ClipboardList,
      label: "Log Meal Result",
      onClick: () => setQuickLogOpen(true),
      shortcut: "L",
    },
    {
      icon: ShoppingCart,
      label: "View Grocery List",
      onClick: () => navigate("/dashboard/grocery"),
      shortcut: "G",
    },
    {
      icon: Sparkles,
      label: "Suggest Foods",
      onClick: () => navigate("/dashboard/pantry"),
      shortcut: "S",
    },
    {
      icon: Calendar,
      label: "Today's Plan",
      onClick: () => navigate("/dashboard"),
      shortcut: "T",
    },
  ];

  /**
   * Log a result against a real plan entry (US-812).
   *
   * This used to call toast("Meal logged!") and return, writing nothing. The
   * floating action is on every dashboard page, so the most reachable way to
   * record a meal result was also the only one that discarded it.
   */
  const handleQuickLog = async (
    result: 'ate' | 'tasted' | 'refused',
    notes?: string,
    mealId?: string
  ) => {
    // An explicit id has to match. Falling back to the first meal when the
    // named one is missing would log a result against the wrong dinner.
    const entry = mealId ? todaysMeals.find((meal) => meal.id === mealId) : todaysMeals[0];
    if (!entry) {
      toast.error("Nothing planned for today", {
        description: "Add a meal to today's plan first.",
      });
      return;
    }

    try {
      await updatePlanEntry(entry.id, { result, notes: notes ?? entry.notes });
      toast.success(`Logged as ${result}`, { description: entry.label });
    } catch {
      // The write is optimistic locally, so a failure here means it did not
      // reach Supabase. Saying so beats a success toast over a lost result.
      toast.error("Couldn't log that meal", { description: "Please try again." });
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - EatPal</title>
        <meta name="description" content="Manage your family's meal plans, food tracking, and nutrition insights" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/*
        Offline banner (US-765). Mounted once outside the desktop/mobile split
        because it positions itself fixed and both layouts need it; it renders
        null while online. It was written for the service worker that until now
        was never registered, so nothing in the app had ever told a user their
        connection had dropped.
      */}
      <OfflineIndicator />
      {/* Desktop Layout with Sidebar */}
      <div className="hidden md:block">
        <SidebarProvider defaultOpen={true}>
          <div className="flex min-h-screen w-full">
            <AppSidebar />

            <div className="flex-1 flex flex-col">
              {/* Top Header */}
              <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
                <SidebarTrigger />

                <div className="flex-1" />

                {/* Kid Selector */}
                <KidSelector />

                {/* Keyboard Shortcut Hint */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden lg:flex items-center gap-2 text-xs"
                  onClick={() => {
                    const event = new KeyboardEvent('keydown', {
                      key: 'k',
                      metaKey: true,
                      ctrlKey: true,
                      bubbles: true
                    });
                    document.dispatchEvent(event);
                  }}
                  title="Open command palette"
                >
                  <span className="text-muted-foreground">Quick Actions</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">{navigator?.platform?.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}</span>K
                  </kbd>
                </Button>

                {/* Keyboard Shortcuts */}
                <KeyboardShortcutsModal />

                {/* Theme Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="touch-target"
                >
                  <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>

                {/* Logout */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="touch-target"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </Button>
              </header>

              {/* Main Content */}
              <main id="main-content" className="flex-1 overflow-auto" role="main" aria-label="Dashboard content">
                <BindEmailBanner />
                <Outlet />
              </main>
            </div>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden min-h-screen bg-background">
        {/* Mobile Top Header */}
        <nav className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50" aria-label="Mobile header navigation">
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
              The hamburger is gone (US-815). Once every nav group rendered in
              the bottom "More" sheet, this was a third menu listing the same
              links a second time, on the opposite corner of the screen. What
              only lived here -- the kid selector, theme and sign out -- moved:
              the selector to this header, where it is one tap instead of two,
              and the other two into More.
            */}
            <div className="min-w-0 max-w-[60%]">
              <KidSelector />
            </div>
          </div>
        </nav>

        {/* Mobile Content with padding */}
        <main id="main-content-mobile" className="pt-14 pb-20" role="main" aria-label="Dashboard content">
          <BindEmailBanner />
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-bottom" aria-label="Primary mobile navigation">
          <div className="flex justify-around items-center h-16 pb-[env(safe-area-inset-bottom)]">
            {primaryNavItems(entitlements).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={isIndexRoute(to)}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors active:scale-95 min-w-[64px]",
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
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors active:scale-95 min-w-[64px]",
                    "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="More navigation options"
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs leading-tight text-center">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[75vh] flex flex-col rounded-t-xl">
                <SheetHeader className="pb-4 border-b">
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <span className="font-heading font-bold text-primary">
                      More Features
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-4">
                  {/*
                    The complement of the bottom bar, so a destination can never
                    be missing from both (US-811), grouped into the same
                    sections as the desktop sidebar (US-815). Admin and the
                    Professional Portal come through the same entitlement filter
                    rather than as appended special cases.
                  */}
                  {NAV_GROUP_ORDER.map((group) => {
                    const items = secondaryNavItemsInGroup(group, entitlements);
                    if (items.length === 0) return null;

                    return (
                      <section key={group} className="mb-6">
                        <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                          {NAV_GROUP_LABELS[group].toUpperCase()}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {items.map(({ to, icon: Icon, label }) => (
                            <NavLink
                              key={to}
                              to={to}
                              onClick={() => setMoreMenuOpen(false)}
                              className={({ isActive }) =>
                                cn(
                                  "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all active:scale-95",
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
                    Theme and sign out (US-815). These were the only controls
                    the removed hamburger owned outright, so they land here
                    rather than disappearing.
                  */}
                  <div className="mt-6 pt-6 border-t space-y-2 pb-safe">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full justify-start gap-3 h-12 active:scale-[0.98]"
                      onClick={() => {
                        setTheme(theme === "dark" ? "light" : "dark");
                        setMoreMenuOpen(false);
                      }}
                    >
                      {theme === "dark" ? (
                        <>
                          <Sun className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="text-base">Light Mode</span>
                        </>
                      ) : (
                        <>
                          <Moon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="text-base">Dark Mode</span>
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive active:scale-[0.98]"
                      onClick={() => {
                        handleLogout();
                        setMoreMenuOpen(false);
                      }}
                    >
                      <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="text-base">Sign Out</span>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>

      {/* Quick Action Menu - Floating Action Button */}
      <QuickActionMenu actions={quickActions} position="bottom-right" />

      {/* Quick Log Modal */}
      <QuickLogModal
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        meals={todaysMeals}
        onLog={handleQuickLog}
      />

      {/* Support Widget - Available on all pages */}
      <SupportWidget />

    </>
  );
};

export default Dashboard;
