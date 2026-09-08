import {
  Accessibility,
  BarChart3,
  Bot,
  Calendar,
  ChefHat,
  CreditCard,
  GitCompare,
  Globe,
  Home,
  LineChart,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  UsersRound,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Every in-app destination, once (US-811).
 *
 * There used to be four hand-maintained lists: mainNavItems, toolsNavItems and
 * insightsNavItems in AppSidebar.tsx, and a flat mobileNavItems in
 * Dashboard.tsx that three different renderers sliced three different ways.
 * They disagreed, and the disagreements were the kind nobody notices in review:
 *
 *  - The mobile bottom bar was `mobileNavItems.slice(0, 4)`, so Planner and
 *    Grocery -- the two screens a meal planner is opened for -- sat behind
 *    "More" while Recipes held a primary slot.
 *  - The hamburger's MAIN was `slice(0, 5)` and its TOOLS ran to the end of the
 *    array, so Grocery was filed under Tools and Account Settings rendered
 *    twice on the same sheet.
 *  - /dashboard/insights was in the mobile list and in no desktop group.
 *  - /dashboard/household, where you invite the other parent, was in neither.
 *
 * One list fixes all four at once and makes the next one a test failure rather
 * than a bug report. This follows the same rule as ROUTE_ALIASES in
 * routeAliases.ts: adding a destination in one place and forgetting the others
 * is how the drift happened in the first place.
 */

/** Which sidebar section an item belongs to. Also drives the mobile sheet. */
export type NavGroup = "main" | "tools" | "insights" | "account";

/** Entitlement an item is gated behind. Undefined means everyone sees it. */
export type NavRequirement = "admin" | "professional";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /**
   * Shown in the mobile bottom bar. Exactly four items carry this: the bar has
   * five slots and the fifth is "More". They are the daily loop -- what is for
   * dinner, what is in the house, what do we need to buy -- and they match the
   * iOS tab bar (MainTabView.Tab) so muscle memory survives switching device.
   */
  primary?: true;
  requires?: NavRequirement;
}

export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  // Main. The four `primary` entries are the mobile bottom bar, in bar order.
  { to: "/dashboard", label: "Home", icon: Home, group: "main", primary: true },
  { to: "/dashboard/planner", label: "Planner", icon: Calendar, group: "main", primary: true },
  { to: "/dashboard/pantry", label: "Pantry", icon: Utensils, group: "main", primary: true },
  { to: "/dashboard/grocery", label: "Grocery", icon: ShoppingCart, group: "main", primary: true },
  { to: "/dashboard/recipes", label: "Recipes", icon: ChefHat, group: "main" },
  { to: "/dashboard/kids", label: "Kids", icon: Users, group: "main" },

  // Tools.
  { to: "/dashboard/food-tracker", label: "Food Tracker", icon: Target, group: "tools" },
  { to: "/dashboard/ai-coach", label: "AI Coach", icon: Bot, group: "tools" },
  { to: "/dashboard/meal-builder", label: "Meal Builder", icon: Sparkles, group: "tools" },
  { to: "/dashboard/food-chaining", label: "Food Chaining", icon: TrendingUp, group: "tools" },
  // Routed since US-766 and linked only from three cards and the Kids page.
  { to: "/dashboard/sibling-meal-finder", label: "Sibling Meals", icon: GitCompare, group: "tools" },

  // Insights.
  { to: "/dashboard/insights", label: "Insights", icon: LineChart, group: "insights" },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3, group: "insights" },
  { to: "/dashboard/progress", label: "Progress", icon: Trophy, group: "insights" },

  // Account. Household is here rather than under Main because it is a setup
  // task you do once, but it has to be SOMEWHERE: inviting the other parent
  // was previously reachable only from a dialog and the /join landing page.
  { to: "/dashboard/household", label: "Household", icon: UsersRound, group: "account" },
  { to: "/dashboard/settings", label: "Account Settings", icon: Settings, group: "account" },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard, group: "account" },
  { to: "/dashboard/accessibility-settings", label: "Accessibility", icon: Accessibility, group: "account" },

  // Gated.
  {
    to: "/dashboard/professional-settings",
    label: "Professional Portal",
    icon: Globe,
    group: "account",
    requires: "professional",
  },
  { to: "/admin", label: "Admin", icon: Shield, group: "account", requires: "admin" },
]);

/** Human labels for the sidebar section headings and the mobile sheet. */
export const NAV_GROUP_LABELS: Readonly<Record<NavGroup, string>> = Object.freeze({
  main: "Main",
  tools: "Tools",
  insights: "Insights",
  account: "Account",
});

/** Section order, so the sidebar and the mobile sheet cannot disagree. */
export const NAV_GROUP_ORDER: readonly NavGroup[] = Object.freeze([
  "main",
  "tools",
  "insights",
  "account",
]);

export interface NavEntitlements {
  isAdmin?: boolean;
  isProfessional?: boolean;
}

/** Everything this user may see, in declaration order. */
export function navItemsFor({ isAdmin, isProfessional }: NavEntitlements = {}): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requires === "admin") return Boolean(isAdmin);
    if (item.requires === "professional") return Boolean(isProfessional);
    return true;
  });
}

/** The four mobile bottom-bar destinations, in bar order. */
export function primaryNavItems(entitlements: NavEntitlements = {}): NavItem[] {
  return navItemsFor(entitlements).filter((item) => item.primary === true);
}

/**
 * Everything the bottom bar does not show, which is exactly what the "More"
 * sheet must offer. Defined as the complement so a new item can never be
 * unreachable on mobile: it is either primary or it is in More.
 */
export function secondaryNavItems(entitlements: NavEntitlements = {}): NavItem[] {
  return navItemsFor(entitlements).filter((item) => item.primary !== true);
}

/** One group's items, for the sidebar sections and the mobile sheet. */
export function navItemsInGroup(group: NavGroup, entitlements: NavEntitlements = {}): NavItem[] {
  return navItemsFor(entitlements).filter((item) => item.group === group);
}

/**
 * `end` for NavLink. Only the dashboard index needs it; without it every
 * /dashboard/* route also marks Home active.
 */
export function isIndexRoute(to: string): boolean {
  return to === "/dashboard";
}
