import { NavLink, useNavigate } from "react-router-dom";
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
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Trophy,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { KidSelector } from "@/components/KidSelector";

const mainNavItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/dashboard/kids", icon: Users, label: "Kids" },
  { to: "/dashboard/pantry", icon: Utensils, label: "Pantry" },
  { to: "/dashboard/recipes", icon: ChefHat, label: "Recipes" },
  { to: "/dashboard/planner", icon: Calendar, label: "Planner" },
  { to: "/dashboard/grocery", icon: ShoppingCart, label: "Grocery" },
];

const toolsNavItems = [
  { to: "/dashboard/food-tracker", icon: Target, label: "Food Tracker" },
  { to: "/dashboard/ai-coach", icon: Bot, label: "AI Coach" },
  { to: "/dashboard/meal-builder", icon: Sparkles, label: "Meal Builder" },
  { to: "/dashboard/food-chaining", icon: TrendingUp, label: "Food Chaining" },
];

const insightsNavItems = [
  { to: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/dashboard/progress", icon: Trophy, label: "Progress" },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProfessional, setIsProfessional] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserStatus = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Check admin status
      const { data: adminData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!adminData);

      // Check Professional subscription status
      const { data: subscriptionData } = await supabase
        .from("user_subscriptions")
        .select(`
          status,
          subscription_plans(name)
        `)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (subscriptionData?.subscription_plans?.name === "Professional") {
        setIsProfessional(true);
      }
    };

    checkUserStatus();
  }, []);

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      {/* Header with Logo */}
      <SidebarHeader className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between mb-4">
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
        </div>
        {!isCollapsed && (
          <div className="w-full">
            <KidSelector />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/dashboard"}
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive
                          ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                          : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 ${isActive
                        ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                        : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Insights */}
        <SidebarGroup>
          <SidebarGroupLabel>Insights</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {insightsNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive
                          ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                          : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Professional Section */}
        {isProfessional && (
          <SidebarGroup>
            <SidebarGroupLabel>Professional</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Professional Portal">
                    <NavLink
                      to="/dashboard/professional-settings"
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive
                          ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                          : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                        }`
                      }
                    >
                      <Globe className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>Professional Portal</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin Section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Admin Panel">
                    <NavLink
                      to="/admin"
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive
                          ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                          : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                        }`
                      }
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* Account */}
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Account Settings">
                  <NavLink
                    to="/dashboard/settings"
                    className={({ isActive }) =>
                      `flex items-center gap-2 ${isActive
                        ? "bg-primary/10 text-primary font-medium no-underline visited:no-underline"
                        : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground no-underline visited:no-underline"
                      }`
                    }
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span>Account Settings</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with collapse toggle */}
      <SidebarFooter className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center"
        >
          {isCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4 mr-2" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
