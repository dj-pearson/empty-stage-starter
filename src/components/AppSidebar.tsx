import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useNavEntitlements } from "@/hooks/useNavEntitlements";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  isIndexRoute,
  navItemsInGroup,
} from "@/lib/navigation";

/**
 * Desktop sidebar. Sections and their contents come from src/lib/navigation.ts
 * (US-811); this file used to carry three of the four hand-maintained nav
 * arrays that disagreed with each other and with the mobile renderers.
 */

const linkClass = (isActive: boolean) =>
  `flex items-center gap-2 no-underline visited:no-underline ${
    isActive
      ? "bg-primary/10 text-primary font-medium"
      : "text-sidebar-foreground visited:text-sidebar-foreground hover:bg-muted/50 hover:text-sidebar-foreground"
  }`;

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const entitlements = useNavEntitlements();

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      {/* Header with Logo */}
      <SidebarHeader className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <picture className="block dark:hidden">
            <source srcSet="/Logo-Green.webp" type="image/webp" />
            <img
              src="/Logo-Green.webp"
              alt="EatPal"
              className="h-8"
              width="120"
              height="32"
            />
          </picture>
          <picture className="hidden dark:block">
            <source srcSet="/Logo-White.webp" type="image/webp" />
            <img
              src="/Logo-White.webp"
              alt="EatPal"
              className="h-8"
              width="120"
              height="32"
            />
          </picture>
        </div>
        {/*
          The kid selector lives in the Dashboard top header only (US-811). It
          used to render in both places at once, so an expanded sidebar showed
          the same control twice; the header copy is the one that survives
          because this one vanishes when the sidebar collapses.
        */}
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUP_ORDER.map((group) => {
          const items = navItemsInGroup(group, entitlements);
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{NAV_GROUP_LABELS[group]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild tooltip={item.label}>
                        <NavLink
                          to={item.to}
                          end={isIndexRoute(item.to)}
                          className={({ isActive }) => linkClass(isActive)}
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {!isCollapsed && <span>{item.label}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
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
