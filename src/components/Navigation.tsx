import { NavLink, useNavigate } from "react-router-dom";
import { Home, Utensils, Calendar, ShoppingCart, Moon, Sun, Users, BarChart3, ChefHat, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { KidSelector } from "@/components/KidSelector";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/dashboard/kids", icon: Users, label: "Kids" },
  { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
  { to: "/dashboard/recipes", icon: ChefHat, label: "Recipes" },
  { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
  { to: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/dashboard/grocery", icon: ShoppingCart, label: "Grocery" },
];

export function Navigation() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 md:top-0 md:bottom-auto">
      <div className="container mx-auto">
        <div className="flex justify-around items-center h-16 md:justify-between md:px-4">
          <div className="hidden md:flex items-center gap-2">
            <KidSelector />
          </div>
          <div className="flex justify-around flex-1 items-center md:justify-center md:gap-8">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors",
                    isActive
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs">{label}</span>
              </NavLink>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
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
  );
}
