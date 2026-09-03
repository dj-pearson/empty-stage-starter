import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { ROUTE_ALIASES, ROUTE_ALIAS_ENTRIES } from './routeAliases';

/**
 * The alias URLs redirect; they do not mount a second app (US-766).
 *
 * /pantry and /dashboard/pantry used to be two separate React trees, each with
 * its own Dashboard shell and its own state, so a filter set on one did not
 * exist on the other and a dialog left open on one was still open when you came
 * back to it. US-719 found exactly this for /planner, fixed that one route, and
 * left the other eight -- which is the reason to pin it here rather than trust
 * the diff: the bug is invisible until someone navigates between the two URLs,
 * and it has already been reintroduced once by being fixed only in one place.
 *
 * These assertions read App.tsx as text on purpose. Rendering the router would
 * pull in every lazy page and the whole provider stack to prove a routing fact
 * that is legible in the source, and the failure mode being guarded (a Route
 * mounting <Dashboard /> at an alias path) is a syntactic one.
 */

const appSource = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const redirects = readFileSync(path.join(process.cwd(), 'public', '_redirects'), 'utf8');

describe('route aliases', () => {
  it('covers every legacy top-level app URL', () => {
    expect(Object.keys(ROUTE_ALIASES).sort()).toEqual(
      [
        '/food-tracker',
        '/grocery',
        '/insights',
        '/kids',
        '/meal-builder',
        '/pantry',
        '/planner',
        '/recipes',
        '/sibling-meal-finder',
      ].sort()
    );
  });

  it('maps each alias to the /dashboard route of the same name', () => {
    for (const [from, to] of ROUTE_ALIAS_ENTRIES) {
      expect(to).toBe(`/dashboard${from}`);
    }
  });
});

describe('App.tsx renders the aliases as redirects', () => {
  it('renders them from the shared list', () => {
    expect(appSource).toContain('ROUTE_ALIAS_ENTRIES.map');
    expect(appSource).toContain('<Navigate to={to} replace />');
  });

  it.each(ROUTE_ALIAS_ENTRIES)('does not hardcode a Route for %s', (from) => {
    // A hand-written `path="/pantry"` is how the second Dashboard mount got
    // there in the first place, and how it would come back.
    expect(appSource).not.toContain(`path="${from}"`);
  });

  it('mounts the Dashboard shell exactly once', () => {
    // Nine mounts is the bug: one canonical /dashboard plus eight aliases each
    // instantiating their own shell.
    const mounts = appSource.match(/<Dashboard \/>/g) ?? [];
    expect(mounts).toHaveLength(1);
  });

  it('has no in-app link pointing at an alias', () => {
    // Every internal link should go straight to the canonical URL; the aliases
    // exist for bookmarks and inbound links, not for us to keep using.
    const srcDir = path.join(process.cwd(), 'src');
    const offenders: string[] = [];
    for (const [from] of ROUTE_ALIAS_ENTRIES) {
      const pattern = new RegExp(`(to|href)=["'\`]${from}["'\`]|navigate\\(["'\`]${from}["'\`]\\)`);
      for (const file of ['pages/Recipes.tsx', 'pages/Kids.tsx', 'components/QuickActionsMenu.tsx']) {
        const contents = readFileSync(path.join(srcDir, file), 'utf8');
        if (pattern.test(contents)) offenders.push(`${file} -> ${from}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the edge redirects match the client ones', () => {
  it.each(ROUTE_ALIAS_ENTRIES)('301s %s at the CDN', (from, to) => {
    // Without this a bookmarked /pantry costs a full app boot before the
    // client-side <Navigate> fires, and a crawler sees a soft redirect.
    expect(redirects).toContain(`${from} ${to} 301`);
  });

  it('sends the trailing-slash forms straight to the canonical target', () => {
    // These used to point at the alias, which now redirects again -- two hops
    // for a URL we can resolve in one.
    expect(redirects).toContain('/kids/ /dashboard/kids 301');
    expect(redirects).toContain('/pantry/ /dashboard/pantry 301');
    expect(redirects).not.toMatch(/^\/kids\/ \/kids 301$/m);
  });
});

describe('aliases stay out of discovery surfaces', () => {
  it('are absent from the prerender route list', () => {
    // They are 301s and behind auth; prerendering them would publish a
    // redirect stub and invite a crawler to index the duplicate URL.
    const routes = readFileSync(
      path.join(process.cwd(), 'scripts', 'prerender-routes.json'),
      'utf8'
    );
    for (const [from] of ROUTE_ALIAS_ENTRIES) {
      expect(routes).not.toContain(`"${from}"`);
    }
  });
});
