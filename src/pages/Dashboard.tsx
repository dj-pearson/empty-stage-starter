import { useEffect, useState } from "react";
import { useNavigate, Outlet, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupportWidget } from "@/components/SupportWidget";
import { AppInstallPrompt } from "@/components/AppInstallPrompt";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KidSelector } from "@/components/KidSelector";
import { QuickActionMenu } from "@/components/ui/QuickActionMenu";
import { QuickLogModal } from "@/components/QuickLogModal";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Menu, Trophy } from "lucide-react";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useWhiteLabelTheme } from "@/hooks/useWhiteLabelTheme";
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
  Home,
  Utensils,
  Calendar,
  ShoppingCart,
  Users,
  BarChart3,
  ChefHat,
  Target,
  Bot,
  Sparkles,
  TrendingUp,
  Shield,
  MoreHorizontal,
  ClipboardList,
  Plus,
  Settings,
  Accessibility,
} from "lucide-react";

const mobileNavItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/dashboard/kids", icon: Users, label: "Kids" },
  { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
  { to: "/dashboard/recipes", icon: ChefHat, label: "Recipes" },
  { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
  { to: "/dashboard/grocery", icon: ShoppingCart, label: "Grocery" },
  { to: "/dashboard/food-tracker", icon: Target, label: "Food Tracker" },
  { to: "/dashboard/ai-coach", icon: Bot, label: "AI Coach" },
  { to: "/dashboard/meal-builder", icon: Sparkles, label: "Meal Builder" },
  { to: "/dashboard/food-chaining", icon: TrendingUp, label: "Food Chaining" },
  { to: "/dashboard/ai-planner", icon: Sparkles, label: "AI Planner" },
  { to: "/dashboard/insights", icon: TrendingUp, label: "Insights" },
  { to: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/dashboard/progress", icon: Trophy, label: "Progress" },
  { to: "/dashboard/settings", icon: Settings, label: "Account Settings" },
];

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Apply white-label theme for Professional subscribers
  useWhiteLabelTheme();

  // Handle checkout=success query param (fallback for legacy redirect)
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast({
        title: "🎉 Subscription activated!",
        description: "Your plan is now active. Enjoy your premium features!",
      });
      // Clean up the query param
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  useEffect(() => {
    // Set up listener for auth state changes
    // Auth protection is handled by ProtectedRoute wrapper
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUser(session.user);
        // Defer admin check to avoid deadlock
        setTimeout(() => {
          checkAdminStatus(session.user.id);
        }, 0);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });

    // Get current session for initial render
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        checkAdminStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const navItemsWithAdmin = isAdmin
    ? [...mobileNavItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : mobileNavItems;

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

  const handleQuickLog = async (result: 'ate' | 'tasted' | 'refused', notes?: string) => {
    toast({
      title: "Meal logged!",
      description: `Meal marked as ${result}`,
    });
  };

  return (
    <>
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
                src="/Logo-Green.png"
                alt="EatPal"
                className="h-7 block dark:hidden"
              />
              <img
                src="/Logo-White.png"
                alt="EatPal"
                className="h-7 hidden dark:block"
              />
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="touch-target">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[360px] flex flex-col">
                <SheetHeader className="pb-4 border-b">
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <Utensils className="h-5 w-5 text-primary" />
                    <span className="font-heading font-bold text-primary">
                      Navigation
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-1 mt-6 pb-safe">
                    {/* Kid Selector Section */}
                    <div className="mb-4 pb-4 border-b">
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-2">ACTIVE PROFILE</p>
                      <KidSelector />
                    </div>

                    {/* Main Navigation Section */}
                    <div className="mb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-2">MAIN</p>
                      {navItemsWithAdmin.slice(0, 5).map(({ to, icon: Icon, label }) => (
                        <NavLink
                          key={to}
                          to={to}
                          end={to === "/dashboard"}
                          onClick={closeMobileMenu}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-[0.98]",
                              isActive
                                ? "bg-primary/10 text-primary font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )
                          }
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="text-base">{label}</span>
                        </NavLink>
                      ))}
                    </div>

                    {/* Tools Section */}
                    {navItemsWithAdmin.length > 5 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2 px-2 mt-4">TOOLS</p>
                        {navItemsWithAdmin.slice(5, navItemsWithAdmin.length - (isAdmin ? 1 : 0)).map(({ to, icon: Icon, label }) => (
                          <NavLink
                            key={to}
                            to={to}
                            onClick={closeMobileMenu}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-[0.98]",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium shadow-sm"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )
                            }
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            <span className="text-base">{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    )}

                    {/* Admin Section */}
                    {isAdmin && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2 px-2 mt-4">ADMIN</p>
                        <NavLink
                          to="/admin"
                          onClick={closeMobileMenu}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-[0.98]",
                              isActive
                                ? "bg-primary/10 text-primary font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )
                          }
                        >
                          <Shield className="h-5 w-5 shrink-0" />
                          <span className="text-base">Admin</span>
                        </NavLink>
                      </div>
                    )}

                    {/* Settings Section */}
                    <div className="mt-6 pt-6 border-t space-y-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-2">SETTINGS</p>
                      <NavLink
                        to="/dashboard/settings"
                        onClick={closeMobileMenu}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-[0.98]",
                            isActive
                              ? "bg-primary/10 text-primary font-medium shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="text-base">Account Settings</span>
                      </NavLink>
                      <NavLink
                        to="/dashboard/accessibility-settings"
                        onClick={closeMobileMenu}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-[0.98]",
                            isActive
                              ? "bg-primary/10 text-primary font-medium shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <Accessibility className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="text-base">Accessibility</span>
                      </NavLink>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full justify-start gap-3 h-12 active:scale-[0.98]"
                        onClick={() => {
                          setTheme(theme === "dark" ? "light" : "dark");
                          closeMobileMenu();
                        }}
                      >
                        {theme === "dark" ? (
                          <>
                            <Sun className="h-5 w-5 shrink-0" />
                            <span className="text-base">Light Mode</span>
                          </>
                        ) : (
                          <>
                            <Moon className="h-5 w-5 shrink-0" />
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
                          closeMobileMenu();
                        }}
                      >
                        <LogOut className="h-5 w-5 shrink-0" />
                        <span className="text-base">Sign Out</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>

        {/* Mobile Content with padding */}
        <main id="main-content-mobile" className="pt-14 pb-16" role="main" aria-label="Dashboard content">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-bottom" aria-label="Primary mobile navigation">
          <div className="flex justify-around items-center h-16 pb-[env(safe-area-inset-bottom)]">
            {mobileNavItems.slice(0, 4).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors active:scale-95 min-w-[64px]",
                    isActive
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
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
                  <div className="grid grid-cols-2 gap-3 pb-safe">
                    {mobileNavItems.slice(4).map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMoreMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all active:scale-95",
                            isActive
                              ? "bg-primary/10 border-primary text-primary font-medium shadow-sm"
                              : "border-border hover:border-primary/50 hover:bg-muted"
                          )
                        }
                      >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="text-sm text-center leading-tight">{label}</span>
                      </NavLink>
                    ))}

                    {isAdmin && (
                      <NavLink
                        to="/admin"
                        onClick={() => setMoreMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all active:scale-95",
                            isActive
                              ? "bg-primary/10 border-primary text-primary font-medium shadow-sm"
                              : "border-border hover:border-primary/50 hover:bg-muted"
                          )
                        }
                      >
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                          <Shield className="h-6 w-6" />
                        </div>
                        <span className="text-sm text-center leading-tight">Admin</span>
                      </NavLink>
                    )}
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
        onLog={handleQuickLog}
      />

      {/* Support Widget - Available on all pages */}
      <SupportWidget />

      {/* App Install Prompt - PWA installation for mobile users */}
      <AppInstallPrompt />
    </>
  );
};

export default Dashboard;
