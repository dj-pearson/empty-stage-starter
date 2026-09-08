import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  NAV_ITEMS,
  NAV_GROUP_ORDER,
  navItemsFor,
  primaryNavItems,
  secondaryNavItems,
  navItemsInGroup,
} from './navigation';

/**
 * One nav list, and the ways it used to drift (US-811).
 *
 * Before this there were four lists across two files, sliced three ways, and
 * every disagreement between them shipped: Planner and Grocery behind "More"
 * on mobile while Recipes held a primary slot; Grocery filed under Tools in the
 * hamburger; Account Settings rendered twice on the same sheet; /dashboard/
 * insights in the mobile list and no desktop group; /dashboard/household, where
 * you invite the other parent, in neither.
 *
 * None of those is visible in a diff of one file, which is why they are pinned
 * here rather than left to review. The orphan check at the bottom reads App.tsx
 * as text, the same trick routeAliases.test.ts uses and for the same reason:
 * the fact is legible in the source and rendering the router to prove it would
 * drag in every lazy page and the whole provider stack.
 */

const appSource = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

describe('the nav registry is internally consistent', () => {
  it('has no duplicate destinations', () => {
    const routes = NAV_ITEMS.map((item) => item.to);
    expect(routes).toEqual([...new Set(routes)]);
  });

  it('has no duplicate labels', () => {
    // Two entries reading "Account Settings" is what the hamburger shipped.
    const labels = NAV_ITEMS.map((item) => item.label);
    expect(labels).toEqual([...new Set(labels)]);
  });

  it('puts every item in a known group', () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_GROUP_ORDER).toContain(item.group);
    }
  });

  it('accounts for every item across the groups', () => {
    const grouped = NAV_GROUP_ORDER.flatMap((group) =>
      navItemsInGroup(group, { isAdmin: true, isProfessional: true })
    );
    expect(grouped).toHaveLength(NAV_ITEMS.length);
  });
});

describe('the mobile bottom bar', () => {
  it('holds exactly four items, because the fifth slot is More', () => {
    expect(primaryNavItems()).toHaveLength(4);
  });

  it('is the daily loop, in bar order', () => {
    // Recipes held the fourth slot and Planner and Grocery were behind More,
    // which is backwards: you open a meal planner to answer what is for dinner,
    // what is in the house, and what do we need to buy.
    expect(primaryNavItems().map((item) => item.label)).toEqual([
      'Home',
      'Planner',
      'Pantry',
      'Grocery',
    ]);
  });

  it('matches the iOS tab bar so muscle memory survives switching device', () => {
    // ios/EatPal/EatPal/Views/Dashboard/MainTabView.swift, enum Tab.
    const iosTabs = ['Home', 'Planner', 'Pantry', 'Grocery'];
    expect(primaryNavItems().map((item) => item.label)).toEqual(iosTabs);
  });

  it('never marks a gated item primary', () => {
    // The bar renders before the entitlement checks resolve; a gated primary
    // would pop in and reflow the bar under the user's thumb.
    for (const item of NAV_ITEMS.filter((i) => i.primary)) {
      expect(item.requires).toBeUndefined();
    }
  });
});

describe('nothing is unreachable on mobile', () => {
  it('splits every item into either the bar or the More sheet', () => {
    const entitlements = { isAdmin: true, isProfessional: true };
    const primary = primaryNavItems(entitlements);
    const secondary = secondaryNavItems(entitlements);

    expect(primary.length + secondary.length).toBe(NAV_ITEMS.length);
    expect(primary.filter((item) => secondary.includes(item))).toEqual([]);
  });
});

describe('entitlement gating', () => {
  it('hides admin and professional items by default', () => {
    const routes = navItemsFor().map((item) => item.to);
    expect(routes).not.toContain('/admin');
    expect(routes).not.toContain('/dashboard/professional-settings');
  });

  it('shows each one only to the entitlement that owns it', () => {
    expect(navItemsFor({ isAdmin: true }).map((i) => i.to)).toContain('/admin');
    expect(navItemsFor({ isAdmin: true }).map((i) => i.to)).not.toContain(
      '/dashboard/professional-settings'
    );
    expect(navItemsFor({ isProfessional: true }).map((i) => i.to)).toContain(
      '/dashboard/professional-settings'
    );
    expect(navItemsFor({ isProfessional: true }).map((i) => i.to)).not.toContain('/admin');
  });
});

describe('every routed dashboard page is reachable from the nav', () => {
  it('has a nav entry for each child route in App.tsx', () => {
    // A relative `path="x"` in App.tsx is only ever a /dashboard child; the
    // catch-all is the one exception. /dashboard/household and
    // /dashboard/insights are here because they were routed, rendered, and
    // linked from no navigation at all -- the same failure US-769 found for
    // /dashboard/billing, which is a page people pay through.
    const childRoutes = [...appSource.matchAll(/path="([^"/][^"]*)"/g)]
      .map((match) => match[1])
      .filter((route) => route !== '*');

    const navRoutes = new Set(NAV_ITEMS.map((item) => item.to));
    const orphans = childRoutes.filter((route) => !navRoutes.has(`/dashboard/${route}`));

    expect(orphans).toEqual([]);
  });

  it('points every nav entry at a route that exists', () => {
    const childRoutes = new Set(
      [...appSource.matchAll(/path="([^"/][^"]*)"/g)].map((match) => match[1])
    );

    const dangling = NAV_ITEMS.filter((item) => {
      if (item.to === '/dashboard') return false;
      if (item.to === '/admin') return !appSource.includes('path="/admin"');
      return !childRoutes.has(item.to.replace('/dashboard/', ''));
    });

    expect(dangling.map((item) => item.to)).toEqual([]);
  });
});

describe('the renderers consume the registry rather than their own copies', () => {
  const sidebar = readFileSync(
    path.join(process.cwd(), 'src', 'components', 'AppSidebar.tsx'),
    'utf8'
  );
  const dashboard = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'Dashboard.tsx'),
    'utf8'
  );

  it('leaves no local nav arrays behind', () => {
    for (const name of ['mainNavItems', 'toolsNavItems', 'insightsNavItems', 'mobileNavItems']) {
      expect(sidebar).not.toContain(`const ${name} =`);
      expect(dashboard).not.toContain(`const ${name} =`);
    }
  });

  it('does not slice a nav list by index', () => {
    // `slice(0, 4)`, `slice(0, 5)` and `slice(5, length - (isAdmin ? 1 : 0))`
    // were the three renderers, and the reason Account Settings appeared twice.
    expect(dashboard).not.toMatch(/NavItems\.slice\(/);
  });
});
