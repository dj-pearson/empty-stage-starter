import { NavLink, useNavigate } from "react-router-dom";
import { Home, Utensils, Calendar, ShoppingCart, Moon, Sun, Users, BarChart3, ChefHat, LogOut, Shield, Menu, X, Target, Bot, Sparkles, TrendingUp, MoreHorizontal, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { KidSelector } from "@/components/KidSelector";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";

const baseNavItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/dashboard/kids", icon: Users, label: "Kids" },
  { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
  { to: "/dashboard/recipes", icon: ChefHat, label: "Recipes" },
  { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
  { to: "/dashboard/ai-planner", icon: Sparkles, label: "AI Planner" },
  { to: "/dashboard/insights", icon: TrendingUp, label: "Insights" },
  { to: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/dashboard/grocery", icon: ShoppingCart, label: "Grocery" },
  { to: "/dashboard/food-tracker", icon: Target, label: "Food Tracker" },
  { to: "/dashboard/ai-coach", icon: Bot, label: "AI Coach" },
  { to: "/dashboard/meal-builder", icon: Sparkles, label: "Meal Builder" },
  { to: "/dashboard/food-chaining", icon: TrendingUp, label: "Food Chaining" },
];

export function Navigation() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
    };

    checkAdminStatus();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  // Add admin item if user is admin
  const navItems = isAdmin
    ? [...baseNavItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : baseNavItems;

  // Define priority items for mobile bottom nav (most frequently used)
  const mobileBottomNavItems = [
    { to: "/dashboard", icon: Home, label: "Home" },
    { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
    { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
    { to: "/dashboard/grocery", icon: ShoppingCart, label: "Grocery" },
  ];

  // Items that go in the "More" menu (everything not in bottom nav)
  const moreMenuItems = navItems.filter(
    item => !mobileBottomNavItems.find(bottomItem => bottomItem.to === item.to)
  );

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const closeMobileMore = () => setMobileMoreOpen(false);

  return (
    <>
      {/* Desktop Header */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
        <div className="container mx-auto">
          <div className="flex justify-between items-center h-16 px-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img 
                src="/Logo-Green.png" 
                alt="EatPal" 
                className="h-8 block dark:hidden"
              />
              <img 
                src="/Logo-White.png" 
                alt="EatPal" 
                className="h-8 hidden dark:block"
              />
            </div>

            {/* Center Navigation */}
            <div className="flex items-center gap-2">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/dashboard"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm">{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              <KidSelector />

              {/* Command Palette Hint */}
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground hover:text-foreground hidden lg:flex"
                onClick={() => {
                  // Trigger command palette
                  const event = new KeyboardEvent('keydown', {
                    key: 'k',
                    metaKey: true,
                    bubbles: true
                  });
                  document.dispatchEvent(event);
                }}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">Search</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out of your account">
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <nav className="md:hidden fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
        <div className="flex justify-between items-center h-14 px-4">
          {/* Logo */}
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

          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-primary">
                  <Utensils className="h-5 w-5" />
                  <span>Navigation</span>
                </SheetTitle>
              </SheetHeader>
              
              <div className="flex flex-col mt-6">
                {/* Kid Selector */}
                <div className="mb-4 pb-4 border-b">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">ACTIVE PROFILE</p>
                  <KidSelector />
                </div>

                {/* Main Navigation */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">MAIN</p>
                  <NavLink
                    to="/dashboard"
                    end
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Home className="h-5 w-5 shrink-0" />
                    <span>Home</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/kids"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Users className="h-5 w-5 shrink-0" />
                    <span>Kids</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/pantry"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Utensils className="h-5 w-5 shrink-0" />
                    <span>Pantry</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/recipes"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <ChefHat className="h-5 w-5 shrink-0" />
                    <span>Recipes</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/planner"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Calendar className="h-5 w-5 shrink-0" />
                    <span>Planner</span>
                  </NavLink>
                </div>

                {/* Tools Section */}
                <div className="space-y-1 mt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">TOOLS</p>
                  <NavLink
                    to="/dashboard/grocery"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <ShoppingCart className="h-5 w-5 shrink-0" />
                    <span>Grocery</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/food-tracker"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Target className="h-5 w-5 shrink-0" />
                    <span>Food Tracker</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/ai-coach"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Bot className="h-5 w-5 shrink-0" />
                    <span>AI Coach</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/meal-builder"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Sparkles className="h-5 w-5 shrink-0" />
                    <span>Meal Builder</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/food-chaining"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <TrendingUp className="h-5 w-5 shrink-0" />
                    <span>Food Chaining</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/analytics"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <BarChart3 className="h-5 w-5 shrink-0" />
                    <span>Analytics</span>
                  </NavLink>
                </div>

                {/* Insights Section */}
                <div className="space-y-1 mt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">INSIGHTS</p>
                  <NavLink
                    to="/dashboard/ai-planner"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <Sparkles className="h-5 w-5 shrink-0" />
                    <span>AI Planner</span>
                  </NavLink>
                  <NavLink
                    to="/dashboard/insights"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <TrendingUp className="h-5 w-5 shrink-0" />
                    <span>Insights</span>
                  </NavLink>
                </div>

                {/* Admin Section */}
                {isAdmin && (
                  <div className="space-y-1 mt-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">ADMIN</p>
                    <NavLink
                      to="/admin"
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        )
                      }
                    >
                      <Shield className="h-5 w-5 shrink-0" />
                      <span>Admin</span>
                    </NavLink>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 pt-4 border-t space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 px-3"
                    onClick={() => {
                      setTheme(theme === "dark" ? "light" : "dark");
                      closeMobileMenu();
                    }}
                  >
                    {theme === "dark" ? (
                      <>
                        <Sun className="h-5 w-5" />
                        <span>Light Mode</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-5 w-5" />
                        <span>Dark Mode</span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 px-3"
                    onClick={() => {
                      handleLogout();
                      closeMobileMenu();
                    }}
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-inset-bottom">
        <div className="flex justify-around items-center h-16 px-2">
          {/* Priority Navigation Items */}
          {mobileBottomNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[60px]",
                  isActive
                    ? "text-primary font-medium scale-105"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )
              }
            >
              <Icon className="h-6 w-6" />
              <span className="text-[11px] leading-tight">{label}</span>
            </NavLink>
          ))}

          {/* More Menu Button */}
          <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[60px]",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <MoreHorizontal className="h-6 w-6" />
                <span className="text-[11px] leading-tight">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
              <SheetHeader>
                <SheetTitle>More Features</SheetTitle>
                <SheetDescription>
                  Access all your meal planning tools
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-1">
                {/* Group items by category for better organization */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-4 py-2">PLANNING</p>
                  {moreMenuItems
                    .filter(item => ['AI Planner', 'Insights', 'Analytics', 'Food Tracker'].includes(item.label))
                    .map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === "/dashboard"}
                        onClick={closeMobileMore}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-4 px-4 py-3.5 rounded-lg transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <div className={cn(
                          "p-2 rounded-lg",
                          "bg-muted"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">{label}</span>
                        </div>
                      </NavLink>
                    ))}
                </div>

                <Separator className="my-2" />

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-4 py-2">TOOLS & AI</p>
                  {moreMenuItems
                    .filter(item => ['AI Coach', 'Meal Builder', 'Food Chaining'].includes(item.label))
                    .map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === "/dashboard"}
                        onClick={closeMobileMore}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-4 px-4 py-3.5 rounded-lg transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <div className={cn(
                          "p-2 rounded-lg",
                          "bg-muted"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">{label}</span>
                        </div>
                      </NavLink>
                    ))}
                </div>

                <Separator className="my-2" />

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-4 py-2">OTHER</p>
                  {moreMenuItems
                    .filter(item => !['AI Planner', 'Insights', 'Analytics', 'Food Tracker', 'AI Coach', 'Meal Builder', 'Food Chaining'].includes(item.label))
                    .map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === "/dashboard"}
                        onClick={closeMobileMore}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-4 px-4 py-3.5 rounded-lg transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <div className={cn(
                          "p-2 rounded-lg",
                          "bg-muted"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">{label}</span>
                        </div>
                      </NavLink>
                    ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
