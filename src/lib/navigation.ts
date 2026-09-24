import {
  BookOpen,
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

/**
 * Which live status an item carries (item 33). The item only names the badge;
 * the number comes from useNavBadges, computed once in the Dashboard shell from
 * contexts that are already loaded, and every renderer reads the same answer.
 *
 *  - groceryLeft: unchecked items on the default grocery list.
 *  - dinnerUnplanned: a dot while today has no dinner planned.
 *  - unloggedMeals: today's meals whose hour has passed with no result logged.
 *  - ladderDue: ladder foods due to be offered today.
 */
export type NavBadgeKey = "groceryLeft" | "dinnerUnplanned" | "unloggedMeals" | "ladderDue";

/** A badge as rendered: a number, or a dot that says "look here" without one. */
export type NavBadgeValue = { kind: "count"; count: number } | { kind: "dot" };

/** Current badge values. A key that is absent shows nothing. */
export type NavBadges = Partial<Record<NavBadgeKey, NavBadgeValue>>;

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
  /** The live status shown next to this item, if any. */
  badge?: NavBadgeKey;
}

export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  // Main. The four `primary` entries are the mobile bottom bar, in bar order.
  { to: "/dashboard", label: "Home", icon: Home, group: "main", primary: true, badge: "unloggedMeals" },
  { to: "/dashboard/planner", label: "Planner", icon: Calendar, group: "main", primary: true, badge: "dinnerUnplanned" },
  { to: "/dashboard/pantry", label: "Pantry", icon: Utensils, group: "main", primary: true },
  { to: "/dashboard/grocery", label: "Grocery", icon: ShoppingCart, group: "main", primary: true, badge: "groceryLeft" },
  { to: "/dashboard/recipes", label: "Recipes", icon: ChefHat, group: "main" },
  { to: "/dashboard/kids", label: "Kids", icon: Users, group: "main" },

  // Tools.
  { to: "/dashboard/food-tracker", label: "Food Tracker", icon: Target, group: "tools", badge: "ladderDue" },
  { to: "/dashboard/ai-coach", label: "AI Coach", icon: Bot, group: "tools" },
  { to: "/dashboard/meal-builder", label: "Meal Builder", icon: Sparkles, group: "tools" },
  { to: "/dashboard/food-chaining", label: "Food Chaining", icon: TrendingUp, group: "tools" },
  // Routed since US-766 and linked only from three cards and the Kids page.
  { to: "/dashboard/sibling-meal-finder", label: "Sibling Meals", icon: GitCompare, group: "tools" },

  // Insights.
  // The notes and amounts caregivers log, a day at a time, for everyone in
  // the household to read.
  { to: "/dashboard/food-journal", label: "Food Journal", icon: BookOpen, group: "insights" },
  { to: "/dashboard/insights", label: "Insights", icon: LineChart, group: "insights" },
  { to: "/dashboard/progress", label: "Progress", icon: Trophy, group: "insights" },

  // Account. Household is here rather than under Main because it is a setup
  // task you do once, but it has to be SOMEWHERE: inviting the other parent
  // was previously reachable only from a dialog and the /join landing page.
  { to: "/dashboard/household", label: "Household", icon: UsersRound, group: "account" },
  // One Settings hub; Accessibility is its ?section=accessibility and no
  // longer a page of its own (the old URL redirects, see routeAliases.ts).
  { to: "/dashboard/settings", label: "Settings", icon: Settings, group: "account" },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard, group: "account" },

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
 * One group's items minus the ones already on the mobile bottom bar.
 *
 * The "More" sheet is the complement of the bar, but a flat grid of fourteen
 * tiles is its own kind of unfindable, so it renders the same sections the
 * sidebar does. Listing Planner again inside More would just be the duplication
 * this registry exists to end.
 */
export function secondaryNavItemsInGroup(
  group: NavGroup,
  entitlements: NavEntitlements = {}
): NavItem[] {
  return navItemsInGroup(group, entitlements).filter((item) => item.primary !== true);
}

/**
 * `end` for NavLink. Only the dashboard index needs it; without it every
 * /dashboard/* route also marks Home active.
 */
export function isIndexRoute(to: string): boolean {
  return to === "/dashboard";
}

/** The badge value for one item, or undefined when it has none right now. */
export function navBadgeFor(item: Pick<NavItem, "badge">, badges: NavBadges | undefined): NavBadgeValue | undefined {
  if (!item.badge || !badges) return undefined;
  const value = badges[item.badge];
  if (!value) return undefined;
  // A zero count is "nothing to do", not a badge reading 0.
  if (value.kind === "count" && !(value.count > 0)) return undefined;
  return value;
}
