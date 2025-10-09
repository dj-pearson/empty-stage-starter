import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { KidSelector } from "@/components/KidSelector";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
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
  { to: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
];

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    // Set up listener first
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        setLoading(false);
        // Defer admin check to avoid deadlock
        setTimeout(() => {
          checkAdminStatus(session.user.id);
        }, 0);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        setLoading(false);
        checkAdminStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const navItemsWithAdmin = isAdmin
    ? [...mobileNavItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : mobileNavItems;

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

                {/* Theme Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
                  title="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </header>

              {/* Main Content */}
              <main className="flex-1 overflow-auto">
                <Outlet />
              </main>
            </div>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden min-h-screen bg-background">
        {/* Mobile Top Header */}
        <nav className="fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
          <div className="flex justify-between items-center h-14 px-4">
            <div className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-primary" />
              <span className="text-lg font-heading font-bold text-primary">
                EatPal
              </span>
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] flex flex-col">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-primary" />
                    <span className="font-heading font-bold text-primary">
                      Menu
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-1 mt-6 pb-4">
                    <div className="mb-4 pb-4 border-b">
                      <KidSelector />
                    </div>

                    {navItemsWithAdmin.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === "/dashboard"}
                        onClick={closeMobileMenu}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )
                        }
                      >
                        <Icon className="h-5 w-5" />
                        <span>{label}</span>
                      </NavLink>
                    ))}

                    <div className="mt-6 pt-6 border-t space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3"
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
                        variant="outline"
                        className="w-full justify-start gap-3"
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
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>

        {/* Mobile Content with padding */}
        <div className="pt-14 pb-16">
          <Outlet />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
          <div className="flex justify-around items-center h-16">
            {mobileNavItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                    isActive ? "text-primary font-medium" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
};

export default Dashboard;