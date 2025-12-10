import { NavLink, useNavigate } from "react-router-dom";
import { Home, Utensils, Calendar, ShoppingCart, Moon, Sun, Users, BarChart3, ChefHat, LogOut, Shield, Menu, X, Target, Bot, Sparkles, TrendingUp } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { KidSelector } from "@/components/KidSelector";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

const baseNavItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/dashboard/kids", icon: Users, label: "Kids" },
  { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
  { to: "/dashboard/recipes", icon: ChefHat, label: "Recipes" },
  { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
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

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
                <LogOut className="h-5 w-5" />
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
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <img 
                    src="/Logo-Green.png" 
                    alt="EatPal" 
                    className="h-6 block dark:hidden"
                  />
                  <img 
                    src="/Logo-White.png" 
                    alt="EatPal" 
                    className="h-6 hidden dark:block"
                  />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 mt-6">
                {/* Kid Selector */}
                <div className="mb-4 pb-4 border-b">
                  <KidSelector />
                </div>

                {/* Navigation Links */}
                {navItems.map(({ to, icon: Icon, label }) => (
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

                {/* Actions */}
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
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="flex justify-around items-center h-16">
          {navItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
